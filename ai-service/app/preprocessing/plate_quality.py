"""
Dynamic Plate Quality Gate for license plate crops.

Assesses whether a detected candidate crop contains sufficient visual evidence
for reliable OCR reading or if it is unreadable / severely degraded.
Calculates sharpness, contrast, edge density, aspect ratio, skew angle,
and classifies into GOOD, USABLE, or UNREADABLE.
"""

from dataclasses import dataclass, field
from enum import Enum
import logging
from typing import List, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class PlateQualityState(str, Enum):
    GOOD = "GOOD"
    USABLE = "USABLE"
    UNREADABLE = "UNREADABLE"


@dataclass
class PlateQualityAssessment:
    """Detailed visual quality assessment of a license plate crop."""
    state: PlateQualityState
    width: int
    height: int
    aspect_ratio: float
    sharpness: float
    brightness: float
    contrast: float
    edge_density: float
    skew_angle: float
    estimated_char_height: float
    reasons: List[str] = field(default_factory=list)
    recommended_enhancements: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "state": self.state.value,
            "width": self.width,
            "height": self.height,
            "aspect_ratio": round(self.aspect_ratio, 2),
            "sharpness": round(self.sharpness, 2),
            "brightness": round(self.brightness, 2),
            "contrast": round(self.contrast, 2),
            "edge_density": round(self.edge_density, 4),
            "skew_angle": round(self.skew_angle, 2),
            "estimated_char_height": round(self.estimated_char_height, 1),
            "reasons": self.reasons,
            "recommended_enhancements": self.recommended_enhancements,
        }


def estimate_skew_angle(gray: np.ndarray) -> float:
    """
    Estimate the skew angle of text/plate borders in degrees (-45 to +45).
    Returns 0.0 if not reliably detectable.
    """
    try:
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=30, minLineLength=20, maxLineGap=5)
        if lines is None or len(lines) == 0:
            return 0.0

        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            dx = x2 - x1
            dy = y2 - y1
            if dx == 0:
                continue
            angle = np.degrees(np.arctan2(dy, dx))
            # Plate lines are mostly horizontal (-45 to 45 deg)
            if -45.0 <= angle <= 45.0:
                angles.append(angle)

        if not angles:
            return 0.0
        return float(np.median(angles))
    except Exception as e:
        logger.debug("Skew estimation failed: %s", e)
        return 0.0


def estimate_char_height(gray: np.ndarray) -> float:
    """
    Estimate character height from vertical projection profile or connected components.
    Falls back to a standard fraction (60%) of crop height.
    """
    h, w = gray.shape[:2]
    if h < 10 or w < 20:
        return float(max(1, int(h * 0.6)))

    try:
        # Otsu thresholding
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
        
        char_heights = []
        for i in range(1, num_labels):
            comp_w = stats[i, cv2.CC_STAT_WIDTH]
            comp_h = stats[i, cv2.CC_STAT_HEIGHT]
            # Discard whole-border lines and tiny noise
            if 0.25 * h <= comp_h <= 0.95 * h and 2 <= comp_w <= 0.5 * w:
                char_heights.append(comp_h)

        if char_heights:
            return float(np.median(char_heights))
    except Exception as e:
        logger.debug("Char height estimation fallback: %s", e)

    return float(round(h * 0.65, 1))


def evaluate_plate_quality(crop: np.ndarray) -> PlateQualityAssessment:
    """
    Assess whether a plate crop is suitable for OCR.
    Categorizes the crop into:
      - GOOD: high resolution, clear edges, normal contrast
      - USABLE: degraded or slightly small, requires enhancement variants
      - UNREADABLE: extreme blur, sub-pixel dimensions, zero contrast
    """
    if crop is None or crop.size == 0:
        return PlateQualityAssessment(
            state=PlateQualityState.UNREADABLE,
            width=0,
            height=0,
            aspect_ratio=0.0,
            sharpness=0.0,
            brightness=0.0,
            contrast=0.0,
            edge_density=0.0,
            skew_angle=0.0,
            estimated_char_height=0.0,
            reasons=["Empty or null crop received"],
            recommended_enhancements=[],
        )

    h, w = crop.shape[:2]
    aspect_ratio = float(w) / float(max(1, h))

    if len(crop.shape) == 3 and crop.shape[2] == 3:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    else:
        gray = crop.copy()

    # Metrics
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    edges = cv2.Canny(gray, 50, 150)
    edge_density = float(np.count_nonzero(edges)) / float(max(1, h * w))

    skew_angle = estimate_skew_angle(gray)
    char_h = estimate_char_height(gray)

    reasons = []
    enhancements = []

    # Rule checks
    # 1. Extreme small size: minimum viable Indian plate crop is ~12-14px tall and ~32px wide
    is_too_small = (h < 12 or w < 32 or (h * w < 480))
    if is_too_small:
        reasons.append(f"Sub-pixel resolution: {w}x{h} px is below minimum reading threshold")

    # 2. Aspect ratio check (Indian plates: ~1.8 to 5.2 for single-line, ~1.2 to 2.0 for square)
    if aspect_ratio < 0.9 or aspect_ratio > 7.5:
        reasons.append(f"Abnormal aspect ratio ({aspect_ratio:.2f}); likely a false positive contour or fragment")

    # 3. Blur / Sharpness check
    if sharpness < 14.0 and h < 32:
        reasons.append(f"Severe motion/optical blur: Laplacian variance {sharpness:.1f} < 14.0")
    elif sharpness < 35.0:
        enhancements.append("sharpen")

    # 4. Contrast check
    if contrast < 1.0:
        reasons.append(f"Zero contrast ({contrast:.1f}); solid color blank crop with no text")
    elif contrast < 28.0:
        enhancements.append("clahe")

    # 5. Brightness checks
    if brightness < 45.0:
        enhancements.append("brighten")
    elif brightness > 225.0:
        enhancements.append("dim")

    # 6. Skew check
    if abs(skew_angle) > 4.0:
        enhancements.append("deskew")

    # 7. Super resolution candidate check
    if 12 <= h < 32 or 32 <= w < 100:
        enhancements.append("super_resolution")

    # Classification logic
    if is_too_small or (sharpness < 8.0 and h < 20) or (aspect_ratio < 0.7):
        state = PlateQualityState.UNREADABLE
        if not reasons:
            reasons.append("Combined severe degradation below OCR capability")
    elif (h >= 24 and w >= 64 and sharpness >= 38.0 and contrast >= 24.0 and 50.0 <= brightness <= 210.0):
        state = PlateQualityState.GOOD
    else:
        state = PlateQualityState.USABLE

    return PlateQualityAssessment(
        state=state,
        width=w,
        height=h,
        aspect_ratio=aspect_ratio,
        sharpness=sharpness,
        brightness=brightness,
        contrast=contrast,
        edge_density=edge_density,
        skew_angle=skew_angle,
        estimated_char_height=char_h,
        reasons=reasons,
        recommended_enhancements=enhancements,
    )
