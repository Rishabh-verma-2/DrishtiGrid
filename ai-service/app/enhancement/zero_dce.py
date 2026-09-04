"""
Zero-DCE low-light enhancement for license plate crops.

Uses a lightweight DCE-Net (Deep Curve Estimation Network) to enhance
dark plate images. The model is loaded ONCE at startup.

Weight download:
  python download_models.py --model zero_dce

References:
  Zero-DCE: https://github.com/Li-Chongyi/Zero-DCE
"""

import logging
import time
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG
from app.utils.image_utils import (
    compute_mean_brightness,
    numpy_bgr_to_pil,
    pil_to_numpy_bgr,
)

logger = logging.getLogger(__name__)

_zero_dce_model = None
_device = None


# ---------------------------------------------------------------------------
# Lightweight DCE-Net definition (re-implemented to avoid heavy dependency)
# ---------------------------------------------------------------------------

def _build_dce_net():
    """Build the DCE-Net architecture in PyTorch."""
    import torch
    import torch.nn as nn

    class DCENet(nn.Module):
        def __init__(self):
            super().__init__()
            n = 32
            self.e_conv1 = nn.Conv2d(3, n, 3, 1, 1, bias=True)
            self.e_conv2 = nn.Conv2d(n, n, 3, 1, 1, bias=True)
            self.e_conv3 = nn.Conv2d(n, n, 3, 1, 1, bias=True)
            self.e_conv4 = nn.Conv2d(n, n, 3, 1, 1, bias=True)
            self.e_conv5 = nn.Conv2d(n * 2, n, 3, 1, 1, bias=True)
            self.e_conv6 = nn.Conv2d(n * 2, n, 3, 1, 1, bias=True)
            self.e_conv7 = nn.Conv2d(n * 2, 24, 3, 1, 1, bias=True)
            self.relu = nn.ReLU(inplace=True)
            self.tanh = nn.Tanh()

        def forward(self, x):
            x1 = self.relu(self.e_conv1(x))
            x2 = self.relu(self.e_conv2(x1))
            x3 = self.relu(self.e_conv3(x2))
            x4 = self.relu(self.e_conv4(x3))
            x5 = self.relu(self.e_conv5(torch.cat([x3, x4], dim=1)))
            x6 = self.relu(self.e_conv6(torch.cat([x2, x5], dim=1)))
            x_r = self.tanh(self.e_conv7(torch.cat([x1, x6], dim=1)))
            # Apply 8 curve maps iteratively
            r1, r2, r3, r4, r5, r6, r7, r8 = torch.split(x_r, 3, dim=1)
            x = x + r1 * (torch.pow(x, 2) - x)
            x = x + r2 * (torch.pow(x, 2) - x)
            x = x + r3 * (torch.pow(x, 2) - x)
            enhance_image_1 = x + r4 * (torch.pow(x, 2) - x)
            x = enhance_image_1 + r5 * (torch.pow(enhance_image_1, 2) - enhance_image_1)
            x = x + r6 * (torch.pow(x, 2) - x)
            x = x + r7 * (torch.pow(x, 2) - x)
            enhance_image = x + r8 * (torch.pow(x, 2) - x)
            return enhance_image

    return DCENet()


def load_zero_dce_model():
    """Load Zero-DCE model once. Falls back gracefully if weights missing."""
    global _zero_dce_model, _device

    try:
        import torch
    except ImportError:
        logger.warning("PyTorch not installed — Zero-DCE disabled.")
        return None

    use_gpu = MODEL_CONFIG.get("USE_GPU", True)
    _device = torch.device(
        "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
    )
    logger.info(f"Zero-DCE using device: {_device}")

    weights_path = Path(MODEL_CONFIG["ZERO_DCE_WEIGHTS_PATH"])
    if not weights_path.exists():
        logger.warning(
            f"Zero-DCE weights not found at {weights_path}. "
            "Run 'python download_models.py --model zero_dce' to download. "
            "CLAHE-only fallback will be used for dark images."
        )
        return None

    try:
        model = _build_dce_net()
        state_dict = torch.load(str(weights_path), map_location=_device)
        model.load_state_dict(state_dict)
        model.to(_device)
        model.eval()
        _zero_dce_model = model
        logger.info("Zero-DCE model loaded successfully.")
        return _zero_dce_model
    except Exception as e:
        logger.error(f"Failed to load Zero-DCE weights: {e}")
        return None


def get_zero_dce_model():
    global _zero_dce_model
    if _zero_dce_model is None:
        load_zero_dce_model()
    return _zero_dce_model


def enhance_with_zero_dce(crop: np.ndarray) -> Tuple[np.ndarray, bool]:
    """
    Apply Zero-DCE enhancement to a BGR plate crop.

    Returns:
        (enhanced_image, was_applied: bool)
    """
    if crop is None or crop.size == 0:
        return crop, False

    import torch

    model = get_zero_dce_model()
    if model is None:
        return crop, False

    brightness = compute_mean_brightness(crop)
    threshold = MODEL_CONFIG.get("ZERO_DCE_BRIGHTNESS_THRESHOLD", 80)
    force = MODEL_CONFIG.get("FORCE_FULL_PIPELINE", False)

    if not force and brightness >= threshold:
        logger.debug(
            f"Zero-DCE skipped (brightness={brightness:.1f} >= {threshold})"
        )
        return crop, False

    t0 = time.perf_counter()
    try:
        # Convert BGR → RGB → [0,1] float tensor [1,3,H,W]
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        tensor = torch.from_numpy(rgb).permute(2, 0, 1).unsqueeze(0).to(_device)

        with torch.no_grad():
            enhanced = model(tensor)

        enhanced_np = (
            enhanced.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255
        ).clip(0, 255).astype(np.uint8)
        enhanced_bgr = cv2.cvtColor(enhanced_np, cv2.COLOR_RGB2BGR)

        elapsed = time.perf_counter() - t0
        logger.debug(
            f"Zero-DCE applied in {elapsed:.3f}s (brightness={brightness:.1f})"
        )
        return enhanced_bgr, True

    except Exception as e:
        logger.error(f"Zero-DCE inference failed: {e}")
        return crop, False
