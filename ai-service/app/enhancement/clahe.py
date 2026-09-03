"""
CLAHE (Contrast Limited Adaptive Histogram Equalization) enhancement.
Applied in LAB color space to improve local contrast without colour distortion.
"""

import logging
import time
from typing import Optional, Tuple

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG
from app.utils.image_utils import compute_contrast

logger = logging.getLogger(__name__)


def apply_clahe(
    image: np.ndarray,
    clip_limit: Optional[float] = None,
    tile_grid_size: Optional[Tuple[int, int]] = None,
) -> Tuple[np.ndarray, bool]:
    """
    Apply CLAHE to a BGR plate crop in LAB color space.

    The L (lightness) channel gets equalized; A and B channels are untouched,
    so colour is preserved while local contrast is boosted.

    Parameters
    ----------
    image : np.ndarray
        BGR input image.
    clip_limit : float
        CLAHE clip limit. Loaded from config if None.
    tile_grid_size : tuple
        CLAHE tile grid size. Loaded from config if None.

    Returns
    -------
    (enhanced: np.ndarray, was_applied: bool)
    """
    if image is None or image.size == 0:
        return image, False

    clip = clip_limit or MODEL_CONFIG.get("CLAHE_CLIP_LIMIT", 2.0)
    grid = tile_grid_size or MODEL_CONFIG.get("CLAHE_TILE_GRID_SIZE", (8, 8))
    force = MODEL_CONFIG.get("FORCE_FULL_PIPELINE", False)

    contrast = compute_contrast(image)
    low_contrast_threshold = 30.0  # std dev below this → apply CLAHE

    if not force and contrast >= low_contrast_threshold:
        logger.debug(
            f"CLAHE skipped (contrast={contrast:.1f} >= {low_contrast_threshold})"
        )
        return image, False

    t0 = time.perf_counter()
    try:
        clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=grid)

        # Handle grayscale images
        if len(image.shape) == 2:
            l_enhanced = clahe.apply(image)
            result = cv2.cvtColor(l_enhanced, cv2.COLOR_GRAY2BGR)
            return result, True

        # Convert BGR → LAB
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)

        # Apply CLAHE to L channel only
        l_enhanced = clahe.apply(l_channel)

        # Merge and convert back
        lab_enhanced = cv2.merge([l_enhanced, a_channel, b_channel])
        result = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)

        elapsed = time.perf_counter() - t0
        logger.debug(
            f"CLAHE applied in {elapsed:.3f}s "
            f"(contrast before={contrast:.1f}, clip={clip})"
        )
        return result, True

    except Exception as e:
        logger.error(f"CLAHE failed: {e}")
        return image, False
