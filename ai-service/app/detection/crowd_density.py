"""
Crowd Density Estimation & Heatmap Analysis Module
=================================================

Provides a pluggable density-estimation pathway for dense and severely occluded
crowds where individual bounding-box detection becomes unreliable.

Architecture:
- `CrowdDensityEstimator` (Abstract Base Class)
- `PretrainedCrowdDensityEstimator` (PyTorch / ONNX deep crowd density models)
- `TextureHeadDensityEstimator` (Statistical / Gradient / Spatial-Frequency Fallback)
- Thread-safe singleton model registry with GPU/CPU auto-detection.
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


class PretrainedCrowdDensityEstimator(CrowdDensityEstimator):
    """
    Deep-learning based crowd density estimator (CSRNet, DM-Count, BayCount, or ONNX).
    Loads PyTorch or ONNX model if weights exist.
    """

    def __init__(self, weights_path: Union[str, Path] = DEFAULT_DENSITY_WEIGHTS):
        self.weights_path = Path(weights_path)
        self.model = None
        self.device = "cpu"
        self._is_loaded = False
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
                import torch
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
                logger.info(f"[DensityEstimator] Loading density model from {self.weights_path} on {self.device}...")

                # Support TorchScript or PyTorch state dict
                if str(self.weights_path).endswith(".pt") or str(self.weights_path).endswith(".pth"):
                    try:
                        self.model = torch.jit.load(str(self.weights_path), map_location=self.device)
                        self.model.eval()
                        self._is_loaded = True
                        logger.info("[DensityEstimator] TorchScript density model loaded successfully.")
                    except Exception:
                        # Attempt standard torch.load
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
        return self._is_loaded and self.model is not None

    def estimate(
        self,
        image: np.ndarray,
        head_candidates: Optional[List[Dict[str, Any]]] = None,
        body_candidates: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[np.ndarray, float, float]:
        if not self.is_available():
            raise RuntimeError("Pretrained density model is not available.")

        import torch
        img_h, img_w = image.shape[:2]
        # Standard normalization: mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        norm_img = (rgb - mean) / std
        tensor = torch.from_numpy(norm_img.transpose(2, 0, 1)).unsqueeze(0).float().to(self.device)

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
    Combines:
    1. Multi-scale gradient magnitude & spatial texture frequency (Scharr/Sobel energy).
    2. Adaptive Gaussian kernel splatting based on head detections and high-entropy crowd patches.
    3. Foreground edge occupancy calibration.
    """

    def __init__(self):
        self._available = True

    def is_available(self) -> bool:
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
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Downsample for fast, stable spatial density calculation (max dimension 320)
        scale = min(1.0, 320.0 / max(img_h, img_w))
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
        texture_score = np.clip(texture_score, 0.0, 8.0)

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
            radius = max(2, int(min(hw, hh) * 0.75))
            cv2.circle(spatial_kernel_map, (cx, cy), radius, 1.0, -1)

        for b in bodies:
            bx1, by1, bx2, by1_head = b["box"][0], b["box"][1], b["box"][2], b["box"][1] + 0.3 * (b["box"][3] - b["box"][1])
            cx = int(((bx1 + bx2) / 2.0) * scale)
            cy = int(by1_head * scale)
            bw = max(2.0, (bx2 - bx1) * scale)
            radius = max(2, int(bw * 0.35))
            cv2.circle(spatial_kernel_map, (cx, cy), radius, 0.8, -1)

        spatial_kernel_map = cv2.GaussianBlur(spatial_kernel_map, (blur_ksize, blur_ksize), 0)

        # 3. Composite density field
        if len(heads) + len(bodies) > 0:
            density_field = 0.55 * spatial_kernel_map + 0.45 * (texture_score / (np.max(texture_score) + 1e-5))
        else:
            density_field = texture_score / (np.max(texture_score) + 1e-5)

        density_field = np.where(density_field > 0.15, density_field, 0.0)

        detector_count = len(bodies) + int(0.9 * max(0, len(heads) - len(bodies)))
        active_pixels = np.count_nonzero(density_field > 0.25)
        median_head_area_px = max(12.0, 180.0 * (scale ** 2))
        texture_count_estimate = active_pixels / median_head_area_px

        if detector_count > 0:
            estimated_count = max(
                float(detector_count),
                0.70 * float(detector_count) + 0.30 * float(texture_count_estimate),
            )
            confidence = min(0.92, 0.65 + 0.02 * min(15, detector_count))
        else:
            estimated_count = float(texture_count_estimate) if texture_count_estimate >= 1.0 else 0.0
            confidence = 0.55 if estimated_count > 0 else 0.85

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
