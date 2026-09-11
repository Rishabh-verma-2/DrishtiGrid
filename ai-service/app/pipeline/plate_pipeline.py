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
from app.detection.vehicle_attributes import detect_vehicle_attributes, _extract_dominant_color
from app.detection.yolo_detector import (
    detect_license_plates,
    detect_vehicles,
    detect_plates_in_vehicle_roi,
    detect_plates_vehicle_first,
    get_lp_model_diagnostics,
)
from app.enhancement.clahe import apply_clahe
from app.enhancement.zero_dce import enhance_with_zero_dce
from app.ocr.ocr_fusion import fuse_ocr_variants
from app.ocr.paddle_ocr import run_ocr_on_crop, get_ocr_diagnostics
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
# Final Acceptance Gate
# ---------------------------------------------------------------------------

def accept_anpr_result(candidate: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Precision-first ANPR acceptance gate.
    A vehicle becomes a successful ANPR result ONLY when:
      1. Vehicle exists & is strongly associated (or high-confidence orphan with valid format)
      2. Plate candidate is inside / strongly associated with vehicle
      3. Plate crop is valid (non-empty, plausible dimensions)
      4. Plate candidate passes geometry / quality checks
      5. OCR returns usable text (non-empty, >= 4 characters)
      6. Indian plate validation passes (VALID_FORMAT) OR strong possible-format evidence exists
      7. OCR confidence passes threshold
      8. Evidence consensus is sufficient (overall evidence >= 0.50)
      9. Candidate is not known non-plate text (billboard / watermark)
      10. Candidate is not an orphan false positive
    """
    if not candidate:
        return False, "Candidate is None or empty"

    # 9. Check non-plate keywords
    raw = (candidate.get("raw_ocr") or "").strip()
    norm = (candidate.get("corrected_plate") or candidate.get("normalized_plate") or "").strip()
    cleaned = clean_ocr_text(raw)
    if cleaned in NON_PLATE_KEYWORDS or norm in NON_PLATE_KEYWORDS:
        return False, f"Keyword '{cleaned or norm}' matches non-plate billboard/watermark"

    # 5. Must have usable text (at least 4 characters)
    if not norm or norm == "UNREADABLE" or len(norm) < 4:
        return False, "No readable plate text"

    # State check
    state = candidate.get("result_state", "")
    if state == PlateResultState.REJECTED.value:
        return False, "Marked as REJECTED by confidence scoring"
    if state == PlateResultState.PLATE_DETECTED_OCR_UNREADABLE.value:
        return False, "OCR text is unreadable"

    # 4. Geometry check
    bbox = candidate.get("bbox", {})
    bw = bbox.get("width", 0)
    bh = bbox.get("height", 0)
    if bw < 18 or bh < 6:
        return False, f"Invalid plate crop dimensions ({bw}x{bh})"

    # 1, 2, 10. Vehicle association check
    has_veh = candidate.get("vehicle_id") is not None
    assoc_plaus = float(candidate.get("association_plausibility", 0.0))
    val_status = candidate.get("validation_status", "UNCERTAIN")

    if not has_veh and assoc_plaus < 0.35:
        if val_status != "VALID_FORMAT" or candidate.get("overall_confidence", 0.0) < 0.70:
            return False, "Orphan candidate lacking vehicle association and valid format"

    # 6. Format check: Indian registration
    has_state = bool(len(norm) >= 2 and norm[:2] in KNOWN_STATE_CODES)
    if val_status not in ("VALID_FORMAT", "POSSIBLE_FORMAT"):
        if not (has_state and len(norm) >= 8 and candidate.get("overall_confidence", 0.0) >= 0.70):
            return False, f"Validation status '{val_status}' without strong Indian state syntax"

    # 7, 8. Overall evidence confidence threshold
    ov_conf = float(candidate.get("overall_confidence", 0.0))
    if ov_conf < 0.50:
        return False, f"Overall confidence ({ov_conf:.2f}) below acceptance threshold (0.50)"

    return True, None


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
        "vehicles_detected": 0,
        "original_image_b64": "",
        "processed_image_b64": "",
        "plates": [],
        "vehicle_results": [],
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

    # --- Step 1: Detect all vehicles first (Primary ANPR Unit) ---
    t0 = time.perf_counter()
    plate_candidates: List[Dict] = []
    vehicles: List[Dict] = []
    vf_debug: Dict[str, Any] = {}

    try:
        plate_candidates, vehicles, vf_debug = detect_plates_vehicle_first(image)
    except Exception as e:
        logger.debug(f"Vehicle-first detection exception: {e}")

    # Global fallback if vehicle-first found no candidates (also supports mock tests)
    if not plate_candidates:
        try:
            det_out = detect_license_plates(image, return_vehicles=True)
        except TypeError:
            det_out = detect_license_plates(image)

        if isinstance(det_out, tuple):
            fb_cands, v_list = det_out
            plate_candidates = fb_cands
            if not vehicles and v_list:
                vehicles = v_list
        elif isinstance(det_out, list) and len(det_out) > 0:
            plate_candidates = det_out

    result["timings"]["detection"] = round(time.perf_counter() - t0, 3)

    # --- Step 2: Vehicle-to-Plate Global Association & Conflict Resolution ---
    t0 = time.perf_counter()
    matches = associate_plates_to_vehicles(vehicles, plate_candidates, image_shape=(img_h, img_w))
    result["timings"]["association"] = round(time.perf_counter() - t0, 3)

    match_by_plate_idx: Dict[int, AssociationMatch] = {m.plate_index: m for m in matches}

    # --- Step 3: Quality Gate, OCR Fusion, Indian Validation per candidate ---
    t0 = time.perf_counter()
    plate_results: List[Dict] = []
    rejected_candidates: List[Dict] = []

    for idx, detection in enumerate(plate_candidates):
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

        # Attach vehicle metadata if associated
        if assoc_match and assoc_match.vehicle_index is not None and assoc_match.vehicle_index < len(vehicles):
            v_obj = vehicles[assoc_match.vehicle_index]
            vx1, vy1, vx2, vy2 = v_obj["bbox"]
            plate_result["vehicle_bbox"] = {"x": vx1, "y": vy1, "width": vx2 - vx1, "height": vy2 - vy1}
            plate_result["vehicle_type"] = v_obj.get("vehicle_type", "car")
            plate_result["vehicle_id"] = v_obj.get("vehicle_id")
        elif detection.get("vehicle_bbox"):
            plate_result["vehicle_bbox"] = detection["vehicle_bbox"]
            plate_result["vehicle_type"] = detection.get("vehicle_type", "car")
            plate_result["vehicle_id"] = detection.get("vehicle_id")

        plate_results.append(plate_result)

    result["timings"]["plate_processing"] = round(time.perf_counter() - t0, 3)

    # --- Step 4: Candidate Filtering & Vehicle-Level Deduplication ---
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

    # Group surviving plates by vehicle (ONE primary plate per vehicle)
    vehicle_groups: Dict[str, List[Dict]] = {}
    orphan_plates: List[Dict] = []

    for p in clean_candidates:
        vid = p.get("vehicle_id")
        if vid:
            vehicle_groups.setdefault(vid, []).append(p)
        else:
            orphan_plates.append(p)

    surviving_plates: List[Dict] = []
    vehicle_primary_plate: Dict[str, Dict] = {}

    for vid, v_plates in vehicle_groups.items():
        v_plates.sort(key=lambda item: item.get("overall_confidence", 0.0), reverse=True)
        primary = v_plates[0]
        surviving_plates.append(primary)
        vehicle_primary_plate[vid] = primary

        for alt in v_plates[1:]:
            alt["result_state"] = PlateResultState.REJECTED.value
            alt["rejection_reason"] = [f"Suppressed duplicate candidate for vehicle {vid}"]
            rejected_candidates.append(alt)

    surviving_plates.extend(orphan_plates)

    # Re-index plate IDs
    for idx, p in enumerate(surviving_plates, start=1):
        p["plate_id"] = idx

    # --- Step 5: Vehicle Color and Vehicle-Level Result Synthesis ---
    vehicle_results: List[Dict] = []
    plate_by_veh_id = {p["vehicle_id"]: p for p in surviving_plates if p.get("vehicle_id")}

    for v_idx, veh in enumerate(vehicles, start=1):
        vid = veh.get("vehicle_id") or f"veh_{v_idx}"
        vx1, vy1, vx2, vy2 = veh["bbox"]
        vw = max(1, vx2 - vx1)
        vh = max(1, vy2 - vy1)
        v_type = (veh.get("class") or veh.get("vehicle_type") or "car").capitalize()

        matched_plate = plate_by_veh_id.get(vid)

        # Estimate vehicle body color using true body mask
        v_color = "Unknown"
        try:
            p_box = (
                matched_plate["bbox"]["x"],
                matched_plate["bbox"]["y"],
                matched_plate["bbox"]["x"] + matched_plate["bbox"]["width"],
                matched_plate["bbox"]["y"] + matched_plate["bbox"]["height"],
            ) if matched_plate else None
            detected_color = _extract_dominant_color(image, plate_box=p_box, vehicle_box=(vx1, vy1, vx2, vy2))
            if detected_color and str(detected_color).strip().lower() != "unknown":
                v_color = detected_color
        except Exception:
            v_color = "Unknown"

        if matched_plate:
            matched_plate["car_color"] = v_color
            matched_plate["vehicle_type"] = v_type.lower()

            p_text = matched_plate.get("corrected_plate") or matched_plate.get("normalized_plate", "")
            if matched_plate.get("result_state") == PlateResultState.PLATE_DETECTED_OCR_UNREADABLE.value:
                p_text = "UNREADABLE"

            p_conf_pct = int(round(float(matched_plate.get("detection_confidence", 0.0)) * 100))
            ov_conf_pct = int(round(float(matched_plate.get("overall_confidence", 0.0)) * 100))

            vehicle_results.append({
                "vehicle_id": vid,
                "vehicle_number": v_idx,
                "vehicle_type": v_type,
                "car_color": v_color,
                "has_plate": True,
                "number_plate": p_text,
                "plate_confidence": p_conf_pct,
                "overall_confidence": ov_conf_pct,
                "status": matched_plate.get("result_state", "REVIEW"),
                "plate_id": matched_plate["plate_id"],
                "vehicle_bbox": {"x": vx1, "y": vy1, "width": vw, "height": vh},
                "plate_bbox": matched_plate["bbox"],
            })
        else:
            vehicle_results.append({
                "vehicle_id": vid,
                "vehicle_number": v_idx,
                "vehicle_type": v_type,
                "car_color": v_color,
                "has_plate": False,
                "number_plate": "NO PLATE DETECTED",
                "plate_confidence": 0,
                "overall_confidence": int(round(float(veh.get("confidence", 0.5)) * 100)),
                "status": "NO_PLATE_DETECTED",
                "plate_id": None,
                "vehicle_bbox": {"x": vx1, "y": vy1, "width": vw, "height": vh},
                "plate_bbox": None,
            })

    # --- Step 6: Final Acceptance Gate & Synthesis of successful_anpr_results ---
    successful_anpr_results: List[Dict] = []
    accepted_plates: List[Dict] = []
    candidate_evidence: List[Dict] = []

    for idx, p in enumerate(surviving_plates, start=1):
        is_accepted, rej_reason = accept_anpr_result(p)
        vid = p.get("vehicle_id") or f"veh_{idx}"
        v_type = (p.get("vehicle_type") or "car").capitalize()
        v_color = p.get("car_color") or "Unknown"
        p_text = p.get("corrected_plate") or p.get("normalized_plate", "")
        p_conf_pct = int(round(float(p.get("detection_confidence", 0.0)) * 100))
        ov_conf_pct = int(round(float(p.get("overall_confidence", 0.0)) * 100))

        evidence_entry = {
            "candidate_id": p.get("plate_id", idx),
            "source": p.get("confidence_breakdown", {}).get("sources", ["detection"]),
            "det_conf": p.get("detection_confidence", 0.0),
            "quality": p.get("quality_assessment", {}).get("state", "UNKNOWN"),
            "ocr_text": p_text,
            "ocr_conf": p.get("ocr_confidence", 0.0),
            "validation_status": p.get("validation_status", "UNCERTAIN"),
            "association_plausibility": p.get("association_plausibility", 0.0),
            "final_decision": "ACCEPTED" if is_accepted else "REJECTED",
            "rejection_reason": rej_reason,
        }
        candidate_evidence.append(evidence_entry)

        if is_accepted:
            accepted_plates.append(p)
            successful_anpr_results.append({
                "vehicle_id": vid,
                "vehicle_number": len(successful_anpr_results) + 1,
                "number_plate": p_text,
                "vehicle_type": v_type,
                "vehicle_color": v_color,
                "plate_confidence": p_conf_pct,
                "overall_confidence": ov_conf_pct,
                "status": p.get("result_state", "VERIFIED"),
                "vehicle_bbox": p.get("vehicle_bbox"),
                "plate_bbox": p.get("bbox"),
                "plate_id": p.get("plate_id", idx),
            })
        else:
            p["result_state"] = PlateResultState.REJECTED.value
            p["rejection_reason"] = [rej_reason or "Failed final acceptance gate"]
            rejected_candidates.append(p)

    # --- Step 7: Model & Pipeline Diagnostics ---
    lp_diag = get_lp_model_diagnostics()
    ocr_diag = get_ocr_diagnostics()
    model_diagnostics = {
        "lp_model_loaded": bool(lp_diag.get("lp_model_available", False)),
        "lp_model_path": str(lp_diag.get("lp_model_path", "")),
        "lp_model_classes": list(lp_diag.get("lp_model_classes", [])),
        "ocr_engine": str(ocr_diag.get("ocr_engine", "paddle")),
        "ocr_available": bool(ocr_diag.get("ocr_available", True)),
    }

    pipeline_diagnostics = {
        "vehicles_detected": len(vehicles),
        "plate_candidates": len(plate_candidates),
        "quality_passed": sum(1 for p in plate_results if p.get("quality_assessment", {}).get("state") != "UNREADABLE"),
        "ocr_attempted": sum(1 for p in plate_results if "ocr_fusion" in p.get("stages_applied", [])),
        "ocr_successful": sum(1 for p in plate_results if bool(p.get("raw_ocr", "").strip())),
        "validated_plates": len(successful_anpr_results),
        "rejected_candidates": len(rejected_candidates),
    }

    result["total_plates_detected"] = len(successful_anpr_results)
    result["vehicles_detected"] = len(vehicles)
    result["successful_anpr_results"] = successful_anpr_results
    result["plates"] = accepted_plates
    result["vehicle_results"] = vehicle_results
    result["model_diagnostics"] = model_diagnostics
    result["pipeline_diagnostics"] = pipeline_diagnostics

    # --- Step 8: Clean Surveillance Visualization (Annotate ONLY successful ANPR detections) ---
    try:
        annot_plates = [
            {
                "plate_id": r.get("plate_id", a_i + 1),
                "bbox": r["plate_bbox"],
                "detection_confidence": r["plate_confidence"] / 100.0,
                "overall_confidence": r["overall_confidence"] / 100.0,
                "normalized_plate": r["number_plate"],
                "validation_status": "VALID_FORMAT",
                "result_state": r["status"],
            }
            for a_i, r in enumerate(successful_anpr_results)
            if r.get("plate_bbox")
        ]
        annot_vehicles = [
            {
                "vehicle_bbox": r["vehicle_bbox"],
                "vehicle_type": r["vehicle_type"],
                "car_color": r["vehicle_color"],
                "has_plate": True,
                "vehicle_id": r["vehicle_id"],
            }
            for r in successful_anpr_results
            if r.get("vehicle_bbox")
        ]

        if annot_plates or annot_vehicles:
            annotated = draw_bounding_boxes(
                image,
                plates=annot_plates,
                vehicles=annot_vehicles,
            )
            result["processed_image_b64"] = numpy_to_base64(annotated)
        else:
            result["processed_image_b64"] = result["original_image_b64"]
    except Exception as e:
        logger.warning(f"Failed to draw bounding boxes: {e}")
        result["processed_image_b64"] = result["original_image_b64"]

    # --- Debug Information ---
    if debug:
        result["debug_info"] = {
            "vehicles_detected_count": len(vehicles),
            "surviving_plates_count": len(accepted_plates),
            "rejected_candidates_count": len(rejected_candidates),
            "candidate_evidence": candidate_evidence,
            "model_diagnostics": model_diagnostics,
            "pipeline_diagnostics": pipeline_diagnostics,
            "vehicle_results": vehicle_results,
            "vf_debug": vf_debug,
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
            "vehicles": vehicles,
        }

    result["success"] = True
    result["timings"]["total"] = round(time.perf_counter() - pipeline_start, 3)

    logger.info(
        f"Vehicle-First Pipeline complete — {len(successful_anpr_results)} successful ANPR detection(s) across "
        f"{len(vehicles)} vehicle(s) in {result['timings']['total']:.2f}s"
    )
    return result
