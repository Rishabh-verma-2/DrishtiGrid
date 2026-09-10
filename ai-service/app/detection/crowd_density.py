"""
Crowd Density Estimation & Heatmap Analysis Module
=================================================

Provides a pluggable density-estimation pathway for dense and severely occluded
crowds where individual bounding-box detection becomes unreliable.

Architecture:
- `CrowdDensityEstimator` (Abstract Base Class)
- `PretrainedCrowdDensityEstimator` (PyTorch / ONNX deep crowd density models)
- `TextureHeadDensityEstimator` (Calibrated Statistical / Gradient Fallback)
- Thread-safe singleton model registry with GPU/CPU auto-detection.
- Clearly flags fallback mode vs learned neural network mode without artificial count inflation.
"""

from __future__ import annotations

import logging
import threading
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Default model weights path
DEFAULT_DENSITY_WEIGHTS = Path(__file__).resolve().parent.parent.parent / "model_weights" / "crowd_density.pt"


class CrowdDensityEstimator(ABC):
    """Abstract interface for crowd density estimation models."""

    @abstractmethod
    def estimate(
        self,
        image: np.ndarray,
        head_candidates: Optional[List[Dict[str, Any]]] = None,
        body_candidates: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[np.ndarray, float, float]:
        """
        Estimate crowd density map and total person count from image.

        Parameters
        ----------
        image           : BGR NumPy array (H, W, 3)
        head_candidates : Optional list of detected head candidates for spatial anchoring
        body_candidates : Optional list of detected body candidates for spatial anchoring

        Returns
        -------
        density_map     : 2D float32 array normalized to [0.0, 1.0] (H_map, W_map)
        estimated_count : Float scalar representing total estimated individuals
        confidence      : Float confidence score in [0.0, 1.0]
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if model is loaded and ready."""
        pass

    @property
    @abstractmethod
    def is_fallback(self) -> bool:
        """Return True if estimator is a heuristic fallback rather than a trained neural network."""
        pass


class PretrainedCrowdDensityEstimator(CrowdDensityEstimator):
    """
    Deep-learning based crowd density estimator (CSRNet, DM-Count, BayCount, or ONNX).
    Loads PyTorch, TorchScript, or ONNX model if weights exist.
    """

    def __init__(self, weights_path: Union[str, Path] = DEFAULT_DENSITY_WEIGHTS):
        self.weights_path = Path(weights_path)
        self.model = None
        self.device = "cpu"
        self._is_loaded = False
        self._is_onnx = False
        self._session = None
        self._load_lock = threading.Lock()
        self._attempt_load()

    def _attempt_load(self) -> None:
        with self._load_lock:
            if self._is_loaded:
                return
            if not self.weights_path.exists():
                logger.info(
                    f"[DensityEstimator] Pretrained density weights not found at {self.weights_path}. "
                    f"Statistical texture-head fallback will be used."
                )
                return

            try:
                # 1. Try ONNX runtime if file ends with .onnx
                if str(self.weights_path).endswith(".onnx"):
                    import onnxruntime as ort
                    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
                    self._session = ort.InferenceSession(str(self.weights_path), providers=providers)
                    self._is_onnx = True
                    self._is_loaded = True
                    logger.info("[DensityEstimator] ONNX crowd density model loaded successfully.")
                    return

                # 2. Try PyTorch / TorchScript
                import torch
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
                logger.info(f"[DensityEstimator] Loading density model from {self.weights_path} on {self.device}...")

                if str(self.weights_path).endswith(".pt") or str(self.weights_path).endswith(".pth"):
                    try:
                        self.model = torch.jit.load(str(self.weights_path), map_location=self.device)
                        self.model.eval()
                        self._is_loaded = True
                        logger.info("[DensityEstimator] TorchScript density model loaded successfully.")
                    except Exception:
                        checkpoint = torch.load(str(self.weights_path), map_location=self.device)
                        if isinstance(checkpoint, torch.nn.Module):
                            self.model = checkpoint
                            self.model.eval()
                            self._is_loaded = True
                            logger.info("[DensityEstimator] PyTorch density model loaded successfully.")
            except Exception as e:
                logger.warning(f"[DensityEstimator] Could not load pretrained model: {e}")
                self.model = None
                self._is_loaded = False

    def is_available(self) -> bool:
        return self._is_loaded and (self.model is not None or self._session is not None)

    @property
    def is_fallback(self) -> bool:
        return False

    def estimate(
        self,
        image: np.ndarray,
        head_candidates: Optional[List[Dict[str, Any]]] = None,
        body_candidates: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[np.ndarray, float, float]:
        if not self.is_available():
            raise RuntimeError("Pretrained density model is not available.")

        img_h, img_w = image.shape[:2]
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        norm_img = (rgb - mean) / std
        input_tensor = norm_img.transpose(2, 0, 1)[np.newaxis, ...].astype(np.float32)

        if self._is_onnx and self._session is not None:
            input_name = self._session.get_inputs()[0].name
            outputs = self._session.run(None, {input_name: input_tensor})
            density_raw = outputs[0].squeeze()
        else:
            import torch
            tensor = torch.from_numpy(input_tensor).float().to(self.device)
            with torch.no_grad():
                output = self.model(tensor)
                if isinstance(output, tuple):
                    output = output[0]
                density_raw = output.squeeze().cpu().numpy()

        raw_count = float(np.sum(density_raw))
        count = max(0.0, raw_count)

        max_val = float(np.max(density_raw)) if density_raw.size > 0 else 1.0
        if max_val > 1e-6:
            norm_map = np.clip(density_raw / max_val, 0.0, 1.0).astype(np.float32)
        else:
            norm_map = np.zeros_like(density_raw, dtype=np.float32)

        confidence = 0.88 if count > 0 else 0.50
        return norm_map, count, confidence


class TextureHeadDensityEstimator(CrowdDensityEstimator):
    """
    Zero-dependency, calibrated statistical crowd density estimator.
    Combines multi-scale gradient energy with detected head and body spatial evidence.
    Calibrated to prevent false count inflation while maintaining an accurate spatial density map.
    """

    def __init__(self):
        self._available = True

    def is_available(self) -> bool:
        return True

    @property
    def is_fallback(self) -> bool:
        return True

    def estimate(
        self,
        image: np.ndarray,
        head_candidates: Optional[List[Dict[str, Any]]] = None,
        body_candidates: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[np.ndarray, float, float]:
        if image is None or image.size == 0:
            return np.zeros((10, 10), dtype=np.float32), 0.0, 0.0

        img_h, img_w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

        # Spatial resolution for density map (proportional to image aspect ratio)
        scale = min(1.0, 360.0 / max(img_h, img_w))
        map_w = max(16, int(img_w * scale))
        map_h = max(16, int(img_h * scale))
        small_gray = cv2.resize(gray, (map_w, map_h), interpolation=cv2.INTER_AREA)

        # 1. Texture & Gradient Analysis
        gx = cv2.Sobel(small_gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(small_gray, cv2.CV_32F, 0, 1, ksize=3)
        grad_mag = cv2.magnitude(gx, gy)

        blur_ksize = max(5, int(min(map_w, map_h) * 0.08) | 1)
        texture_energy = cv2.GaussianBlur(grad_mag, (blur_ksize, blur_ksize), 0)

        blur_mean = cv2.blur(small_gray.astype(np.float32), (blur_ksize, blur_ksize))
        blur_sq_mean = cv2.blur((small_gray.astype(np.float32)) ** 2, (blur_ksize, blur_ksize))
        local_var = np.maximum(0.0, blur_sq_mean - blur_mean ** 2)
        local_std = np.sqrt(local_var)

        texture_score = (texture_energy / (np.mean(texture_energy) + 1e-5)) * (
            local_std / (np.mean(local_std) + 1e-5)
        )
        texture_score = np.clip(texture_score, 0.0, 6.0)

        # 2. Integrate detected head and body spatial evidence
        spatial_kernel_map = np.zeros((map_h, map_w), dtype=np.float32)
        heads = head_candidates or []
        bodies = body_candidates or []

        for h in heads:
            hx1, hy1, hx2, hy2 = h["box"]
            cx = int(((hx1 + hx2) / 2.0) * scale)
            cy = int(((hy1 + hy2) / 2.0) * scale)
            hw = max(2.0, (hx2 - hx1) * scale)
            hh = max(2.0, (hy2 - hy1) * scale)
            radius = max(2, int(min(hw, hh) * 0.8))
            cv2.circle(spatial_kernel_map, (cx, cy), radius, 1.0, -1)

        for b in bodies:
            bx1, by1, bx2, by2 = b["box"]
            cx = int(((bx1 + bx2) / 2.0) * scale)
            cy = int((by1 + 0.35 * (by2 - by1)) * scale)
            bw = max(2.0, (bx2 - bx1) * scale)
            radius = max(2, int(bw * 0.40))
            cv2.circle(spatial_kernel_map, (cx, cy), radius, 0.85, -1)

        spatial_kernel_map = cv2.GaussianBlur(spatial_kernel_map, (blur_ksize, blur_ksize), 0)

        # 3. Composite density field
        if len(heads) + len(bodies) > 0:
            norm_tex = texture_score / (np.max(texture_score) + 1e-5)
            density_field = 0.65 * spatial_kernel_map + 0.35 * norm_tex
        else:
            density_field = texture_score / (np.max(texture_score) + 1e-5)

        density_field = np.where(density_field > 0.12, density_field, 0.0)

        # 4. Calibrated Person Count Estimate (Anchored without runaway extrapolation)
        detector_count = len(bodies) + int(0.9 * max(0, len(heads) - len(bodies)))
        active_pixels = float(np.count_nonzero(density_field > 0.20))
        total_pixels = float(map_h * map_w)
        coverage_ratio = active_pixels / max(1.0, total_pixels)

        if detector_count > 0:
            # Calibrated estimate anchored to detected evidence
            # Avoids wild over-counting while accounting for occluded pockets
            texture_residual = max(0.0, coverage_ratio * 150.0 - float(detector_count))
            estimated_count = float(detector_count) + 0.15 * texture_residual
            confidence = 0.62  # Modest, honest confidence for statistical fallback
        else:
            estimated_count = round(coverage_ratio * 60.0, 1)
            confidence = 0.50 if estimated_count > 0 else 0.90

        max_d = float(np.max(density_field))
        norm_map = (density_field / max_d).astype(np.float32) if max_d > 1e-6 else np.zeros((map_h, map_w), dtype=np.float32)

        return norm_map, round(estimated_count, 1), round(confidence, 2)


# ---------------------------------------------------------------------------
# Singleton Registry
# ---------------------------------------------------------------------------
_density_estimator_lock = threading.Lock()
_cached_density_estimator: Optional[CrowdDensityEstimator] = None


def get_density_estimator(
    weights_path: Optional[Union[str, Path]] = None,
    force_fallback: bool = False,
) -> CrowdDensityEstimator:
    """
    Retrieve or create cached thread-safe CrowdDensityEstimator singleton.
    Prefers deep model if weights exist; otherwise uses calibrated statistical fallback.
    """
    global _cached_density_estimator
    with _density_estimator_lock:
        if _cached_density_estimator is None or force_fallback:
            path = Path(weights_path) if weights_path else DEFAULT_DENSITY_WEIGHTS
            if not force_fallback and path.exists():
                estimator = PretrainedCrowdDensityEstimator(weights_path=path)
                if estimator.is_available():
                    _cached_density_estimator = estimator
                    return _cached_density_estimator

            _cached_density_estimator = TextureHeadDensityEstimator()
        return _cached_density_estimator
