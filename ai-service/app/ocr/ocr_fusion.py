"""
Multi-Variant OCR Consensus and Evidence Fusion Module.

Generates controlled image enhancement variants of a plate crop,
runs OCR across variants, and fuses character-level and format-level evidence
to produce the most reliable license plate text and confidence score.
"""

from dataclasses import dataclass, field
import logging
from typing import Any, Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.preprocessing.plate_quality import PlateQualityAssessment, PlateQualityState
from app.validation.indian_plate import (
    KNOWN_STATE_CODES,
    clean_ocr_text,
    repair_indian_plate,
    validate_indian_plate,
)

logger = logging.getLogger(__name__)


@dataclass
class VariantOCRResult:
    variant_name: str
    raw_ocr: str
    cleaned: str
    corrected: str
    confidence: float
    status: str
    note: str
    repairs: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "variant_name": self.variant_name,
            "raw_ocr": self.raw_ocr,
            "cleaned": self.cleaned,
            "corrected": self.corrected,
            "confidence": round(self.confidence, 4),
            "status": self.status,
            "note": self.note,
            "repairs": self.repairs,
        }


def generate_variants(
    crop: np.ndarray,
    assessment: Optional[PlateQualityAssessment] = None,
    min_height: int = 48,
) -> List[Tuple[str, np.ndarray]]:
    """
    Generate up to 5 controlled enhancement variants of a plate crop.
    """
    variants: List[Tuple[str, np.ndarray]] = []
    if crop is None or crop.size == 0:
        return variants

    h, w = crop.shape[:2]

    # Ensure baseline minimum height for OCR readability
    base = crop.copy()
    if h < min_height:
        scale = min_height / float(h)
        new_w = int(round(w * scale))
        base = cv2.resize(base, (new_w, min_height), interpolation=cv2.INTER_CUBIC)
        h, w = base.shape[:2]

    # Variant 1: Baseline / Normalized original
    variants.append(("original", base))

    # Variant 2: CLAHE + Unsharp Mask (enhances faint or low-contrast characters)
    try:
        if len(base.shape) == 3 and base.shape[2] == 3:
            lab = cv2.cvtColor(base, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))
            l_clahe = clahe.apply(l)
            lab_clahe = cv2.merge((l_clahe, a, b))
            enhanced = cv2.cvtColor(lab_clahe, cv2.COLOR_LAB2BGR)
        else:
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))
            enhanced = clahe.apply(base)

        blurred = cv2.GaussianBlur(enhanced, (0, 0), 2.0)
        sharpened = cv2.addWeighted(enhanced, 1.35, blurred, -0.35, 0)
        variants.append(("clahe_sharpen", sharpened))
    except Exception as e:
        logger.debug("CLAHE variant creation failed: %s", e)

    # Variant 3: Bilateral Denoising (removes specular reflections and road grime)
    try:
        denoised = cv2.bilateralFilter(base, d=5, sigmaColor=40, sigmaSpace=40)
        variants.append(("denoise_bilateral", denoised))
    except Exception as e:
        logger.debug("Bilateral variant creation failed: %s", e)

    # Variant 4: Adaptive Binarization (improves deep shadow / backlit plates)
    try:
        gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY) if len(base.shape) == 3 else base.copy()
        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 6
        )
        # Convert back to 3 channels so PaddleOCR can ingest
        thresh_3ch = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)
        variants.append(("adaptive_thresh", thresh_3ch))
    except Exception as e:
        logger.debug("Adaptive thresh variant creation failed: %s", e)

    # Variant 5: Deskewed (if skew angle is significant)
    if assessment and abs(assessment.skew_angle) >= 2.0 and abs(assessment.skew_angle) <= 35.0:
        try:
            angle = assessment.skew_angle
            center = (w // 2, h // 2)
            rot_mat = cv2.getRotationMatrix2D(center, angle, 1.0)
            deskewed = cv2.warpAffine(
                base, rot_mat, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
            )
            variants.append(("deskewed", deskewed))
        except Exception as e:
            logger.debug("Deskew variant creation failed: %s", e)

    return variants


def fuse_ocr_variants(
    crop: np.ndarray,
    ocr_fn: Callable[[np.ndarray], Dict[str, Any]],
    assessment: Optional[PlateQualityAssessment] = None,
) -> Dict[str, Any]:
    """
    Run OCR across enhancement variants, evaluate Indian plate grammar and consensus,
    and fuse into the highest-evidence result.
    """
    if assessment and assessment.state == PlateQualityState.UNREADABLE:
        # Quality gate rejected this crop from reading text
        return {
            "raw_ocr": "",
            "normalized_plate": "",
            "corrected_plate": "",
            "fused_confidence": 0.0,
            "ocr_confidence": 0.0,
            "validation_status": "UNREADABLE",
            "validation_note": f"Crop failed quality gate: {', '.join(assessment.reasons) if assessment.reasons else 'Severely degraded'}",
            "is_valid": False,
            "variants_executed": 0,
            "consensus_count": 0,
            "variant_results": [],
        }

    variants = generate_variants(crop, assessment=assessment)
    if not variants:
        return {
            "raw_ocr": "",
            "normalized_plate": "",
            "corrected_plate": "",
            "fused_confidence": 0.0,
            "ocr_confidence": 0.0,
            "validation_status": "UNCERTAIN",
            "validation_note": "No variants generated",
            "is_valid": False,
            "variants_executed": 0,
            "consensus_count": 0,
            "variant_results": [],
        }

    variant_results: List[VariantOCRResult] = []

    for name, v_crop in variants:
        try:
            ocr_out = ocr_fn(v_crop)
            raw = ocr_out.get("raw_ocr", "")
            raw_conf = float(ocr_out.get("ocr_confidence", 0.0))

            cleaned = clean_ocr_text(raw)
            corrected, repairs = repair_indian_plate(cleaned, ocr_confidence=raw_conf)
            status, note = validate_indian_plate(corrected)

            variant_results.append(
                VariantOCRResult(
                    variant_name=name,
                    raw_ocr=raw,
                    cleaned=cleaned,
                    corrected=corrected,
                    confidence=raw_conf,
                    status=status,
                    note=note,
                    repairs=repairs,
                )
            )

            # Early exit: if original is already valid and high confidence, skip extra passes
            if name == "original" and status == "VALID_FORMAT" and raw_conf >= 0.88:
                break
        except Exception as e:
            logger.warning("OCR failed on variant %s: %s", name, e)

    if not variant_results:
        return {
            "raw_ocr": "",
            "normalized_plate": "",
            "corrected_plate": "",
            "fused_confidence": 0.0,
            "ocr_confidence": 0.0,
            "validation_status": "UNCERTAIN",
            "validation_note": "OCR inference returned empty",
            "is_valid": False,
            "variants_executed": 0,
            "consensus_count": 0,
            "variant_results": [],
        }

    # Group results by corrected candidate plate text
    text_groups: Dict[str, List[VariantOCRResult]] = {}
    for res in variant_results:
        key = res.corrected.strip()
        if not key:
            continue
        text_groups.setdefault(key, []).append(res)

    if not text_groups:
        # All variants produced blank OCR
        best_empty = max(variant_results, key=lambda r: r.confidence)
        return {
            "raw_ocr": best_empty.raw_ocr,
            "normalized_plate": best_empty.cleaned,
            "corrected_plate": best_empty.corrected,
            "fused_confidence": 0.0,
            "ocr_confidence": best_empty.confidence,
            "validation_status": best_empty.status,
            "validation_note": best_empty.note,
            "is_valid": False,
            "variants_executed": len(variant_results),
            "consensus_count": 0,
            "variant_results": [r.to_dict() for r in variant_results],
        }

    # Score each distinct text candidate
    scored_candidates = []
    for cand_text, group in text_groups.items():
        base_conf = max(r.confidence for r in group)
        status = group[0].status
        note = group[0].note

        # Consensus bonus for multi-variant agreement (+0.08 per extra variant)
        consensus_count = len(group)
        consensus_bonus = min(0.18, max(0.0, (consensus_count - 1) * 0.08))

        # Format bonus
        if status == "VALID_FORMAT":
            format_weight = 0.22
        elif status == "POSSIBLE_FORMAT":
            format_weight = 0.10
        else:
            format_weight = 0.0

        # State code match bonus
        state_bonus = 0.08 if cand_text[:2] in KNOWN_STATE_CODES else 0.0

        # Length plausibility
        length_bonus = 0.05 if 8 <= len(cand_text) <= 11 else 0.0

        composite_score = (
            0.50 * base_conf +
            format_weight +
            consensus_bonus +
            state_bonus +
            length_bonus
        )
        scored_candidates.append((composite_score, cand_text, group))

    # Pick the candidate with highest composite evidence score
    scored_candidates.sort(key=lambda item: item[0], reverse=True)
    best_score, best_text, best_group = scored_candidates[0]

    # Best representative result from the winning group
    best_res = max(best_group, key=lambda r: (r.status == "VALID_FORMAT", r.confidence))

    # Calculate fused confidence (bounded 0.0 .. 1.0)
    # OCR confidence is based on the top variant's confidence with agreement bonus
    fused_ocr_conf = float(np.clip(best_res.confidence + (len(best_group) - 1) * 0.04, 0.0, 1.0))

    return {
        "raw_ocr": best_res.raw_ocr,
        "normalized_plate": best_res.cleaned,
        "corrected_plate": best_res.corrected,
        "fused_confidence": round(fused_ocr_conf, 4),
        "ocr_confidence": round(best_res.confidence, 4),
        "validation_status": best_res.status,
        "validation_note": best_res.note,
        "repairs_applied": best_res.repairs,
        "is_valid": best_res.status == "VALID_FORMAT",
        "variants_executed": len(variant_results),
        "consensus_count": len(best_group),
        "variant_results": [r.to_dict() for r in variant_results],
    }
