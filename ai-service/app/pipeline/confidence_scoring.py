"""
Deterministic Multi-Factor Confidence Scoring and Classification Module.

Computes a calibrated overall confidence score by fusing:
  - Detector confidence (30%)
  - OCR confidence (25%)
  - Plate visual quality (15%)
  - Geometric plausibility (10%)
  - Vehicle association plausibility (10%)
  - Plate grammar validity (5%)
  - Multi-pass confirmation (5%)

Assigns result states:
  VERIFIED | HIGH_CONFIDENCE | REVIEW | PLATE_DETECTED_OCR_UNREADABLE | REJECTED
"""

from dataclasses import dataclass, field
from enum import Enum
import logging
from typing import Any, Dict, List, Optional

import numpy as np

from app.preprocessing.plate_quality import PlateQualityAssessment, PlateQualityState

logger = logging.getLogger(__name__)


class PlateResultState(str, Enum):
    VERIFIED = "VERIFIED"
    HIGH_CONFIDENCE = "HIGH_CONFIDENCE"
    REVIEW = "REVIEW"
    PLATE_DETECTED_OCR_UNREADABLE = "PLATE_DETECTED_OCR_UNREADABLE"
    REJECTED = "REJECTED"


@dataclass
class ConfidenceBreakdown:
    detector_score: float         # Weight: 0.30
    ocr_score: float              # Weight: 0.25
    quality_score: float          # Weight: 0.15
    geometric_score: float        # Weight: 0.10
    association_score: float      # Weight: 0.10
    grammar_score: float          # Weight: 0.05
    multipass_score: float        # Weight: 0.05
    overall_confidence: float
    result_state: PlateResultState
    rejection_reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "detector_score": round(self.detector_score, 4),
            "ocr_score": round(self.ocr_score, 4),
            "quality_score": round(self.quality_score, 4),
            "geometric_score": round(self.geometric_score, 4),
            "association_score": round(self.association_score, 4),
            "grammar_score": round(self.grammar_score, 4),
            "multipass_score": round(self.multipass_score, 4),
            "overall_confidence": round(self.overall_confidence, 4),
            "result_state": self.result_state.value,
            "rejection_reasons": self.rejection_reasons,
        }


def compute_geometric_score(width: int, height: int, aspect_ratio: float, skew_angle: float) -> float:
    """Score geometry based on realistic aspect ratio and low skew."""
    if width <= 0 or height <= 0:
        return 0.0

    # Ideal Indian plate aspect ratio: single-line ~ 3.0 to 4.8; two-line/square ~ 1.3 to 2.2
    if 2.2 <= aspect_ratio <= 5.2:
        ar_score = 1.0
    elif 1.2 <= aspect_ratio < 2.2:
        ar_score = 0.85
    elif 5.2 < aspect_ratio <= 6.5:
        ar_score = 0.65
    elif 0.9 <= aspect_ratio < 1.2:
        ar_score = 0.35
    else:
        ar_score = 0.15

    # Skew angle penalty
    abs_skew = abs(skew_angle)
    if abs_skew <= 3.0:
        skew_score = 1.0
    elif abs_skew <= 10.0:
        skew_score = 0.80
    elif abs_skew <= 20.0:
        skew_score = 0.55
    else:
        skew_score = 0.30

    return float(0.70 * ar_score + 0.30 * skew_score)


def compute_quality_score(assessment: Optional[PlateQualityAssessment]) -> float:
    """Score visual quality based on resolution, sharpness, and contrast."""
    if not assessment:
        return 0.5

    if assessment.state == PlateQualityState.UNREADABLE:
        return 0.15

    score = 0.5
    if assessment.state == PlateQualityState.GOOD:
        score = 0.90
    elif assessment.state == PlateQualityState.USABLE:
        score = 0.65

    # Bonus for crisp sharpness and adequate height
    if assessment.height >= 32 and assessment.sharpness >= 45.0:
        score = min(1.0, score + 0.10)
    elif assessment.height < 18 or assessment.sharpness < 20.0:
        score = max(0.20, score - 0.15)

    return float(np.clip(score, 0.0, 1.0))


def compute_grammar_score(validation_status: str, has_state_prefix: bool) -> float:
    """Score plate grammar validity."""
    if validation_status == "VALID_FORMAT":
        return 1.0
    elif validation_status == "POSSIBLE_FORMAT":
        return 0.70 if has_state_prefix else 0.55
    elif validation_status == "UNCERTAIN":
        return 0.30
    return 0.05


def compute_overall_confidence(
    detector_confidence: float,
    ocr_confidence: float,
    quality_assessment: Optional[PlateQualityAssessment],
    validation_status: str,
    association_plausibility: float = 0.5,
    has_state_prefix: bool = False,
    source_count: int = 1,
    is_contour_only: bool = False,
    has_text: bool = True,
) -> ConfidenceBreakdown:
    """
    Compute overall confidence and assign result state.
    """
    rejection_reasons: List[str] = []

    # 1. Detector Score (0.30)
    s_det = float(np.clip(detector_confidence, 0.0, 1.0))

    # 2. OCR Score (0.25)
    s_ocr = float(np.clip(ocr_confidence, 0.0, 1.0))

    # 3. Quality Score (0.15)
    s_qual = compute_quality_score(quality_assessment)

    # 4. Geometric Score (0.10)
    if quality_assessment:
        s_geom = compute_geometric_score(
            quality_assessment.width,
            quality_assessment.height,
            quality_assessment.aspect_ratio,
            quality_assessment.skew_angle,
        )
    else:
        s_geom = 0.60

    # 5. Association Score (0.10)
    s_assoc = float(np.clip(association_plausibility, 0.0, 1.0))

    # 6. Grammar Score (0.05)
    s_gram = compute_grammar_score(validation_status, has_state_prefix)

    # 7. Multi-pass Confirmation Score (0.05)
    if source_count >= 2:
        s_multi = 1.0
    elif source_count == 1 and not is_contour_only:
        s_multi = 0.50
    else:
        s_multi = 0.15

    # Overall weighted combination
    overall = (
        0.30 * s_det +
        0.25 * s_ocr +
        0.15 * s_qual +
        0.10 * s_geom +
        0.10 * s_assoc +
        0.05 * s_gram +
        0.05 * s_multi
    )
    overall = float(np.clip(overall, 0.0, 1.0))

    # Classification & Rejection Rules
    is_unreadable_crop = (quality_assessment and quality_assessment.state == PlateQualityState.UNREADABLE)

    if is_contour_only:
        rejection_reasons.append("Unconfirmed contour candidate")
        result_state = PlateResultState.REJECTED
    elif is_unreadable_crop or (not has_text and s_det >= 0.55):
        # We detected a plate location reliably on the vehicle, but OCR cannot read it
        if s_det >= 0.50 and s_assoc >= 0.40:
            result_state = PlateResultState.PLATE_DETECTED_OCR_UNREADABLE
        else:
            rejection_reasons.append("Unreadable crop with poor detector/association confidence")
            result_state = PlateResultState.REJECTED
    elif overall >= 0.85 and s_gram >= 0.65 and s_ocr >= 0.60:
        result_state = PlateResultState.VERIFIED
    elif overall >= 0.70 and s_ocr >= 0.40:
        result_state = PlateResultState.HIGH_CONFIDENCE
    elif overall >= 0.55:
        result_state = PlateResultState.REVIEW
    else:
        rejection_reasons.append(f"Overall confidence {overall:.3f} below minimum threshold (0.55)")
        result_state = PlateResultState.REJECTED

    return ConfidenceBreakdown(
        detector_score=s_det,
        ocr_score=s_ocr,
        quality_score=s_qual,
        geometric_score=s_geom,
        association_score=s_assoc,
        grammar_score=s_gram,
        multipass_score=s_multi,
        overall_confidence=overall,
        result_state=result_state,
        rejection_reasons=rejection_reasons,
    )
