"""
Main orchestration pipeline for license plate processing.
Vehicle-First Evidence-Fusion ANPR Architecture.

Flow per image:
  1. Validate + decode image
  2. Detect vehicles and plate candidates (Multi-pass YOLO + Cascade)
  3. Spatial candidate clustering & source reliability weighting
  4. Geometric Vehicle-to-Plate association
  5. Plate Quality Gate (GOOD, USABLE, UNREADABLE)
  6. Controlled multi-variant OCR consensus & evidence fusion
  7. Constrained Indian plate grammar verification & character repair
  8. Deterministic multi-factor confidence scoring & state classification
  9. Vehicle-level candidate grouping & primary plate selection
  10. Filter unverified/rejected false positives
  11. Draw bounding boxes on original -> processed image
  12. Return backward-compatible JSON result (+ optional debug_info)
"""

import logging
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG
from app.detection.association import associate_plates_to_vehicles, AssociationMatch
from app.detection.vehicle_attributes import detect_vehicle_attributes
from app.detection.yolo_detector import detect_license_plates, detect_vehicles
from app.enhancement.clahe import apply_clahe
from app.enhancement.zero_dce import enhance_with_zero_dce
from app.ocr.ocr_fusion import fuse_ocr_variants
from app.ocr.paddle_ocr import run_ocr_on_crop
from app.pipeline.confidence_scoring import (
    PlateResultState,
    compute_overall_confidence,
)
from app.preprocessing.opencv_preprocess import (
    analyze_image_quality,
    preprocess_plate_crop,
)
from app.preprocessing.plate_quality import (
    PlateQualityAssessment,
    PlateQualityState,
    evaluate_plate_quality,
)
from app.super_resolution.real_esrgan import upscale_plate_crop
from app.utils.image_utils import (
    draw_bounding_boxes,
    numpy_to_base64,
    safe_crop,
    validate_image_bytes,
)
from app.validation.indian_plate import (
    KNOWN_STATE_CODES,
    clean_ocr_text,
    process_ocr_result,
    repair_indian_plate,
    validate_indian_plate,
)

logger = logging.getLogger(__name__)

NON_PLATE_KEYWORDS = {
    # Media / broadcast watermarks
    "TIMES", "TIMESNOW", "GOVERNOR", "OFFICIAL", "OFFICIALUSE",
    "TEMPORARY", "REGISTRATION", "POLICE", "HIGHWAY", "TOLL",
    "GROUP", "TRMN", "NEWDELHI", "DELHI", "INDIA", "TRANSPORT",
    "MAIAD", "ALAMY", "STOCK", "PHOTO", "NEWS", "BHARAT",
    "CHTANMENTAS", "XABUSHANOI", "XABUS", "XABUSHANO",
    "DAOCA", "OUUHSAUUX",
    # Storefronts / signs
    "SHARMA", "ELECTRONICS", "BANKOFINDIA", "BANKOFIND",
    "CAFE", "DELIGHT", "CAFEDELIGHT", "BANDRA", "JUNCTION",
    "SUPERMARKET", "HOSPITAL", "SCHOOL", "COLLEGE", "UNIVERSITY",
    "PETROL", "DIESEL", "PUMP", "FILLING", "STATION",
    "RESTAURANT", "HOTEL", "LODGE", "MALL", "PLAZA", "TOWER",
    "MUNICIPAL", "CORPORATION", "NAGAR", "NIGAM",
    "BHAVAN", "BHAWAN", "MANDIR", "MASJID", "CHURCH", "GURUDWARA",
}


def _decode_image(image_input: Any) -> Optional[np.ndarray]:
    """Decode raw bytes or pass-through BGR NumPy array. Returns None on failure."""
    if isinstance(image_input, np.ndarray):
        return image_input
    try:
        arr = np.frombuffer(image_input, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        logger.error(f"Image decode failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Per-plate pipeline
# ---------------------------------------------------------------------------

def _process_single_plate(
    plate_id: int,
    original_crop: np.ndarray,
    detection_confidence: float,
    bbox: Dict,
    association_match: Optional[AssociationMatch] = None,
    detection_meta: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Run Quality Gate, Multi-Variant OCR Fusion, and Deterministic Confidence Scoring.
    """
    meta = detection_meta or {}
    assoc = association_match

    result: Dict[str, Any] = {
        "plate_id": plate_id,
        "bbox": bbox,
        "detection_confidence": round(detection_confidence, 4),
        "original_crop_b64": "",
        "enhanced_crop_b64": "",
        "car_color": None,
        "car_model": None,
        "vehicle_type": "car",
        "vehicle_id": assoc.vehicle_id if assoc else None,
        "vehicle_bbox": None,
        "association_plausibility": round(assoc.plausibility_score, 3) if assoc else 0.5,
        "raw_ocr": "",
        "normalized_plate": "",
        "corrected_plate": "",
        "ocr_confidence": 0.0,
        "overall_confidence": 0.0,
        "result_state": PlateResultState.REVIEW.value,
        "validation_status": "UNCERTAIN",
        "validation_note": "",
        "processing_status": "SUCCESS",
        "processing_error": None,
        "stages_applied": [],
        "timings": {},
        "quality_assessment": {},
        "confidence_breakdown": {},
    }

    try:
        # Store original crop base64
        result["original_crop_b64"] = numpy_to_base64(original_crop)

        # 1. Evaluate Plate Quality Gate
        t0 = time.perf_counter()
        quality = evaluate_plate_quality(original_crop)
        result["quality_assessment"] = quality.to_dict()
        result["timings"]["quality_gate"] = round(time.perf_counter() - t0, 3)

        raw_ocr = ""
        norm_plate = ""
        corr_plate = ""
        ocr_conf = 0.0
        val_status = "UNCERTAIN"
        val_note = ""

        if quality.state == PlateQualityState.UNREADABLE:
            # Sub-pixel or severely degraded crop: DO NOT run OCR or hallucinate
            result["stages_applied"].append("quality_gate_unreadable")
            val_status = "UNREADABLE"
            val_note = f"Quality gate: {', '.join(quality.reasons) if quality.reasons else 'Degraded crop'}"
            enhanced = original_crop.copy()
            result["enhanced_crop_b64"] = result["original_crop_b64"]
            logger.info("Plate #%d failed quality gate: %s", plate_id, val_note)
        else:
            # 2. Controlled Multi-Variant OCR Fusion
            t0 = time.perf_counter()
            ocr_fused = fuse_ocr_variants(original_crop, run_ocr_on_crop, assessment=quality)
            result["timings"]["ocr_fusion"] = round(time.perf_counter() - t0, 3)
            result["stages_applied"].append("ocr_fusion")

            raw_ocr = ocr_fused.get("raw_ocr", "")
            norm_plate = ocr_fused.get("normalized_plate", "")
            corr_plate = ocr_fused.get("corrected_plate", "")
            ocr_conf = float(ocr_fused.get("ocr_confidence", 0.0))
            val_status = ocr_fused.get("validation_status", "UNCERTAIN")
            val_note = ocr_fused.get("validation_note", "")

            # Apply standard enhancement for visual inspection
            enhanced = original_crop.copy()
            try:
                enhanced = preprocess_plate_crop(enhanced)
                enhanced, _ = apply_clahe(enhanced)
            except Exception:
                pass
            result["enhanced_crop_b64"] = numpy_to_base64(enhanced)

        # 3. Deterministic Confidence Scoring & State Classification
        assoc_score = assoc.plausibility_score if assoc and not assoc.is_orphan else (
            0.40 if meta.get("sources") and "vehicle_cascade" in meta.get("sources", []) else 0.20
        )
        has_state = bool(corr_plate and corr_plate[:2] in KNOWN_STATE_CODES)
        has_text = bool(corr_plate and len(corr_plate) >= 4)

        conf_breakdown = compute_overall_confidence(
            detector_confidence=detection_confidence,
            ocr_confidence=ocr_conf,
            quality_assessment=quality,
            validation_status=val_status,
            association_plausibility=assoc_score,
            has_state_prefix=has_state,
            source_count=meta.get("source_count", 1),
            is_contour_only=meta.get("is_contour_only", False),
            has_text=has_text,
        )

        result["raw_ocr"] = raw_ocr
        result["normalized_plate"] = norm_plate
        result["corrected_plate"] = corr_plate
        result["ocr_confidence"] = round(ocr_conf, 4)
        result["overall_confidence"] = conf_breakdown.overall_confidence
        result["result_state"] = conf_breakdown.result_state.value
        result["confidence_breakdown"] = conf_breakdown.to_dict()
        result["validation_status"] = val_status
        result["validation_note"] = val_note

        if conf_breakdown.result_state == PlateResultState.PLATE_DETECTED_OCR_UNREADABLE:
            if not result["normalized_plate"]:
                result["normalized_plate"] = "UNREADABLE"
            if not result["corrected_plate"]:
                result["corrected_plate"] = "UNREADABLE"

        if result["processing_status"] == "SUCCESS" and not raw_ocr.strip() and quality.state != PlateQualityState.UNREADABLE:
            result["processing_status"] = "OCR_NO_TEXT"

    except Exception as e:
        logger.error(f"Plate {plate_id}: Unexpected pipeline error: {e}", exc_info=True)
        result["processing_status"] = "FAILED"
        result["processing_error"] = str(e)
        result["result_state"] = PlateResultState.REJECTED.value

    return result


# ---------------------------------------------------------------------------
# Main pipeline entry point
# ---------------------------------------------------------------------------

def run_pipeline(image_bytes: bytes, debug: bool = False) -> Dict[str, Any]:
    """
    Full end-to-end pipeline for one uploaded image.
    Vehicle-first evidence-fusion ANPR architecture.

    Returns a JSON-serializable result dict.
    """
    pipeline_start = time.perf_counter()
    result: Dict[str, Any] = {
        "success": False,
        "total_plates_detected": 0,
        "original_image_b64": "",
        "processed_image_b64": "",
        "plates": [],
        "timings": {},
        "error": None,
    }

    # --- Decode image ---
    image = _decode_image(image_bytes)
    if image is None:
        result["error"] = "Could not decode image. File may be corrupt or unsupported."
        return result

    img_h, img_w = image.shape[:2]
    result["original_image_b64"] = numpy_to_base64(image)

    # --- Detection (Plates + Vehicles) ---
    t0 = time.perf_counter()
    try:
        try:
            det_out = detect_license_plates(image, return_vehicles=True)
        except TypeError:
            det_out = detect_license_plates(image)

        if isinstance(det_out, tuple):
            detections, vehicles = det_out
        else:
            detections = det_out
            vehicles = []
    except Exception as e:
        logger.error(f"Detection failed: {e}", exc_info=True)
        result["error"] = f"License plate detection failed: {e}"
        return result

    # If no vehicles returned from cascade, attempt vehicle detection directly
    if not vehicles:
        try:
            vehicles = detect_vehicles(image)
        except Exception as e:
            logger.debug("Secondary vehicle detection failed: %s", e)
            vehicles = []

    result["timings"]["detection"] = round(time.perf_counter() - t0, 3)

    # --- Vehicle-to-Plate Association ---
    t0 = time.perf_counter()
    matches = associate_plates_to_vehicles(vehicles, detections, image_shape=(img_h, img_w))
    result["timings"]["association"] = round(time.perf_counter() - t0, 3)

    match_by_plate_idx: Dict[int, AssociationMatch] = {m.plate_index: m for m in matches}

    # --- Process each candidate plate ---
    t0 = time.perf_counter()
    plate_results: List[Dict] = []
    rejected_candidates: List[Dict] = []

    for idx, detection in enumerate(detections):
        plate_id = detection.get("plate_id", idx + 1)
        original_crop = detection["original_crop"]
        bbox = detection["bbox"]
        det_conf = detection["detection_confidence"]
        assoc_match = match_by_plate_idx.get(idx)

        logger.info(f"Processing candidate #{plate_id} (conf={det_conf:.2f}) ...")
        plate_result = _process_single_plate(
            plate_id=plate_id,
            original_crop=original_crop,
            detection_confidence=det_conf,
            bbox=bbox,
            association_match=assoc_match,
            detection_meta=detection,
        )

        # Attach vehicle bounding box and type if matched
        if assoc_match and assoc_match.vehicle_index is not None and assoc_match.vehicle_index < len(vehicles):
            v_obj = vehicles[assoc_match.vehicle_index]
            vx1, vy1, vx2, vy2 = v_obj["bbox"]
            plate_result["vehicle_bbox"] = {"x": vx1, "y": vy1, "width": vx2 - vx1, "height": vy2 - vy1}
            plate_result["vehicle_type"] = v_obj.get("vehicle_type", "car")
        elif detection.get("vehicle_bbox"):
            plate_result["vehicle_bbox"] = detection["vehicle_bbox"]

        plate_results.append(plate_result)

    result["timings"]["plate_processing"] = round(time.perf_counter() - t0, 3)

    # --- Candidate Filtering & Vehicle-Level Deduplication ---
    # 1. Filter out false positives (keywords, watermarks, unverified orphans)
    clean_candidates: List[Dict] = []
    for p in plate_results:
        raw = p.get("raw_ocr", "").strip()
        cleaned_text = clean_ocr_text(raw)
        result_state = p.get("result_state", PlateResultState.REVIEW.value)

        # Discard known watermarks or billboard words
        if cleaned_text in NON_PLATE_KEYWORDS:
            p["result_state"] = PlateResultState.REJECTED.value
            p["rejection_reason"] = f"Non-plate billboard/watermark keyword '{cleaned_text}'"
            rejected_candidates.append(p)
            continue

        # Discard REJECTED state candidates
        if result_state == PlateResultState.REJECTED.value:
            p["rejection_reason"] = p.get("confidence_breakdown", {}).get("rejection_reasons") or ["Low overall confidence"]
            rejected_candidates.append(p)
            continue

        # Special handling for orphan plates (no vehicle associated)
        assoc_plaus = p.get("association_plausibility", 0.0)
        has_vehicle = p.get("vehicle_id") is not None
        if not has_vehicle and assoc_plaus < 0.30:
            val_stat = p.get("validation_status", "UNCERTAIN")
            # Orphan candidate must have valid format and reasonable confidence to survive
            if val_stat not in ("VALID_FORMAT", "POSSIBLE_FORMAT") or p.get("overall_confidence", 0.0) < 0.55:
                p["result_state"] = PlateResultState.REJECTED.value
                p["rejection_reason"] = ["Orphan candidate lacking vehicle context and valid format"]
                rejected_candidates.append(p)
                continue

        clean_candidates.append(p)

    # 2. Group candidates by vehicle and select primary plate
    vehicle_groups: Dict[str, List[Dict]] = {}
    orphan_plates: List[Dict] = []

    for p in clean_candidates:
        vid = p.get("vehicle_id")
        if vid:
            vehicle_groups.setdefault(vid, []).append(p)
        else:
            orphan_plates.append(p)

    surviving_plates: List[Dict] = []

    for vid, v_plates in vehicle_groups.items():
        # Sort by overall_confidence descending
        v_plates.sort(key=lambda item: item.get("overall_confidence", 0.0), reverse=True)
        primary = v_plates[0]
        surviving_plates.append(primary)

        # If there are additional plates for this vehicle that are spatially distinct (e.g. front & rear visible),
        # keep them if IoU with primary is very small (< 0.20)
        pbox = (primary["bbox"]["x"], primary["bbox"]["y"],
                primary["bbox"]["x"] + primary["bbox"]["width"],
                primary["bbox"]["y"] + primary["bbox"]["height"])

        for alt in v_plates[1:]:
            abox = (alt["bbox"]["x"], alt["bbox"]["y"],
                    alt["bbox"]["x"] + alt["bbox"]["width"],
                    alt["bbox"]["y"] + alt["bbox"]["height"])

            from app.detection.candidate_clustering import compute_iou
            if compute_iou(pbox, abox) < 0.20 and alt.get("overall_confidence", 0.0) >= 0.70:
                surviving_plates.append(alt)
            else:
                alt["result_state"] = PlateResultState.REJECTED.value
                alt["rejection_reason"] = [f"Suppressed duplicate candidate for vehicle {vid}"]
                rejected_candidates.append(alt)

    surviving_plates.extend(orphan_plates)

    # Deduplicate across surviving plates by normalized/corrected text
    seen_texts: Dict[str, Dict] = {}
    for p in surviving_plates:
        text_key = p.get("corrected_plate") or p.get("normalized_plate") or f"__plate_{p['plate_id']}"
        if text_key == "UNREADABLE":
            text_key = f"__unreadable_{p['plate_id']}"

        existing = seen_texts.get(text_key)
        if existing is None:
            seen_texts[text_key] = p
        else:
            if p.get("overall_confidence", 0.0) > existing.get("overall_confidence", 0.0):
                seen_texts[text_key] = p

    final_plates = list(seen_texts.values())

    # Re-index plate IDs
    for idx, p in enumerate(final_plates, start=1):
        p["plate_id"] = idx

    # --- Vehicle Attribute Detection (Color, Model, Type) ---
    for p in final_plates:
        try:
            attr = detect_vehicle_attributes(image, p["bbox"])
            p["car_color"] = attr.get("car_color") or p.get("car_color") or "Unknown"
            p["car_model"] = attr.get("car_model") or p.get("car_model")
            p["vehicle_type"] = attr.get("vehicle_type") or p.get("vehicle_type") or "car"
            if not p.get("vehicle_bbox"):
                p["vehicle_bbox"] = attr.get("vehicle_bbox")
        except Exception as e:
            logger.warning(f"Plate #{p['plate_id']}: Vehicle attribute detection failed: {e}")
            p["car_color"] = p.get("car_color") or "Unknown"
            p["car_model"] = None
            p["vehicle_type"] = p.get("vehicle_type") or "car"

    result["total_plates_detected"] = len(final_plates)
    result["plates"] = final_plates

    # --- Annotated image (bounding boxes for vehicles & plates) ---
    try:
        annotated = draw_bounding_boxes(
            image,
            [
                {
                    "plate_id": p["plate_id"],
                    "bbox": p["bbox"],
                    "detection_confidence": p["detection_confidence"],
                    "normalized_plate": p.get("corrected_plate") or p.get("normalized_plate", ""),
                    "validation_status": p.get("validation_status", "UNCERTAIN"),
                }
                for p in final_plates
            ],
            vehicles=[
                {
                    "vehicle_bbox": p.get("vehicle_bbox"),
                    "vehicle_type": p.get("vehicle_type", "car"),
                    "car_color": p.get("car_color"),
                }
                for p in final_plates if p.get("vehicle_bbox")
            ],
        )
        result["processed_image_b64"] = numpy_to_base64(annotated)
    except Exception as e:
        logger.warning(f"Failed to draw bounding boxes: {e}")
        result["processed_image_b64"] = result["original_image_b64"]

    # --- Debug Information ---
    if debug:
        result["debug_info"] = {
            "vehicles_detected_count": len(vehicles),
            "raw_detections_count": len(detections),
            "surviving_plates_count": len(final_plates),
            "rejected_candidates_count": len(rejected_candidates),
            "rejected_candidates": [
                {
                    "plate_id": r.get("plate_id"),
                    "bbox": r.get("bbox"),
                    "raw_ocr": r.get("raw_ocr"),
                    "result_state": r.get("result_state"),
                    "reasons": r.get("rejection_reason"),
                    "confidence_breakdown": r.get("confidence_breakdown"),
                }
                for r in rejected_candidates
            ],
            "vehicles": [
                {
                    "vehicle_id": v.get("vehicle_id"),
                    "bbox": v.get("bbox"),
                    "type": v.get("vehicle_type"),
                    "confidence": v.get("confidence"),
                }
                for v in vehicles
            ],
        }

    result["success"] = True
    result["timings"]["total"] = round(time.perf_counter() - pipeline_start, 3)

    logger.info(
        f"Pipeline complete — {len(final_plates)} verified plate(s) in "
        f"{result['timings']['total']:.2f}s"
    )
    return result
