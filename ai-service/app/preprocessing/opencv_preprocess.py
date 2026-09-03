"""
OpenCV-based image preprocessing for license plate crops.
Applies denoising, normalization, and optional sharpening.
Also evaluates image quality metrics to inform downstream enhancement decisions.
"""

import logging
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from app.utils.image_utils import (
    compute_contrast,
    compute_mean_brightness,
    compute_noise_level,
)

logger = logging.getLogger(__name__)


@dataclass
class ImageQualityMetrics:
    """Quality metrics used to decide which enhancement stages to apply."""
    mean_brightness: float   # 0–255
    noise_level: float       # Laplacian variance (lower = more blurry)
    contrast: float          # Std dev of grayscale pixels

    @property
    def is_dark(self) -> bool:
        return self.mean_brightness < 80

    @property
    def is_low_contrast(self) -> bool:
        return self.contrast < 30

    @property
    def is_noisy(self) -> bool:
        # Very high variance sometimes means noise; very low means blur
        return self.noise_level > 500

    @property
    def is_blurry(self) -> bool:
        return self.noise_level < 50


def analyze_image_quality(image: np.ndarray) -> ImageQualityMetrics:
    """Return quality metrics for a BGR image."""
    return ImageQualityMetrics(
        mean_brightness=compute_mean_brightness(image),
        noise_level=compute_noise_level(image),
        contrast=compute_contrast(image),
    )


def preprocess_plate_crop(
    crop: np.ndarray,
    target_height: int = 64,
    denoise_strength: int = 7,
    sharpen: bool = True,
) -> np.ndarray:
    """
    Basic OpenCV preprocessing for a plate crop:
    1. Resize to at least `target_height` pixels tall (preserve AR)
    2. Mild denoising
    3. Optional unsharp-mask sharpening

    Returns the preprocessed BGR image.
    """
    if crop is None or crop.size == 0:
        raise ValueError("Empty crop received for preprocessing")

    h, w = crop.shape[:2]

    # 1. Upsize if the crop is very small
    if h < target_height:
        scale = target_height / h
        new_w = int(w * scale)
        crop = cv2.resize(crop, (new_w, target_height),
                          interpolation=cv2.INTER_CUBIC)
        h, w = crop.shape[:2]

    # 2. Mild denoising (fastNlMeansDenoisingColored is slow on large images —
    #    only apply when genuinely useful)
    metrics = analyze_image_quality(crop)
    if metrics.is_noisy:
        crop = cv2.fastNlMeansDenoisingColored(
            crop,
            h=denoise_strength,
            hColor=denoise_strength,
            templateWindowSize=7,
            searchWindowSize=21,
        )
        logger.debug("Denoising applied (noise_level=%.1f)", metrics.noise_level)

    # 3. Optional unsharp-mask sharpening
    if sharpen:
        blurred = cv2.GaussianBlur(crop, (0, 0), 2.0)
        crop = cv2.addWeighted(crop, 1.5, blurred, -0.5, 0)

    return crop


def normalize_image(image: np.ndarray) -> np.ndarray:
    """Normalize pixel values to full 0–255 range per channel."""
    norm = np.zeros_like(image)
    for c in range(image.shape[2] if len(image.shape) == 3 else 1):
        if len(image.shape) == 3:
            channel = image[:, :, c]
        else:
            channel = image
        cv2.normalize(channel, channel, 0, 255, cv2.NORM_MINMAX)
    return image


def prepare_full_image_for_detection(image: np.ndarray,
                                     max_dim: int = 1280) -> np.ndarray:
    """
    Resize the full uploaded image so YOLO runs efficiently.
    Does NOT enhance or upscale — just constrains size.
    """
    h, w = image.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        new_w = int(w * scale)
        new_h = int(h * scale)
        return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return image
