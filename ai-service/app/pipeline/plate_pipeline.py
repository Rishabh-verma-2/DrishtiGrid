"""
Main orchestration pipeline for license plate processing.

Flow per image:
  1. Validate + decode image
  2. Detect all plates (YOLO)
  3. For each plate:
     a. Safe crop from original
     b. OpenCV preprocessing (denoise, sharpen)
     c. Zero-DCE (if dark)
     d. CLAHE (if low contrast)
     e. Real-ESRGAN upscaling
     f. PaddleOCR
     g. Indian plate validation/normalization
  4. Draw bounding boxes on original → processed image
  5. Return aggregated JSON result

Errors in individual plates are isolated so other plates continue processing.
"""

import logging
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG
from app.detection.vehicle_attributes import detect_vehicle_attributes
from app.detection.yolo_detector import detect_license_plates
from app.enhancement.clahe import apply_clahe
from app.enhancement.zero_dce import enhance_with_zero_dce
from app.ocr.paddle_ocr import run_ocr_on_crop
from app.preprocessing.opencv_preprocess import (
    analyze_image_quality,
    preprocess_plate_crop,
)
from app.super_resolution.real_esrgan import upscale_plate_crop
from app.utils.image_utils import (
    draw_bounding_boxes,
    numpy_to_base64,
    safe_crop,
    validate_image_bytes,
)
from app.validation.indian_plate import process_ocr_result

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _compute_overall_confidence(det_conf: float, ocr_conf: float) -> float:
    """Weighted geometric mean of detection and OCR confidence."""
    return round((det_conf ** 0.5) * (ocr_conf ** 0.5), 4)


# ---------------------------------------------------------------------------
# Per-plate pipeline
# ---------------------------------------------------------------------------

def _process_single_plate(
    plate_id: int,
    original_crop: np.ndarray,
    detection_confidence: float,
    bbox: Dict,
) -> Dict[str, Any]:
    """
    Run the full enhancement + OCR pipeline on one plate crop.
    Returns a result dict. Errors are caught per-stage and surfaced in the result.
    """
    result: Dict[str, Any] = {
        "plate_id": plate_id,
        "bbox": bbox,
        "detection_confidence": round(detection_confidence, 4),
        "original_crop_b64": "",
        "enhanced_crop_b64": "",
        "car_color": None,
        "car_model": None,
        "raw_ocr": "",
        "normalized_plate": "",
        "ocr_confidence": 0.0,
        "overall_confidence": 0.0,
        "validation_status": "UNCERTAIN",
        "validation_note": "",
        "processing_status": "SUCCESS",
        "processing_error": None,
        "stages_applied": [],
        "timings": {},
    }

    try:
        # --- Store original crop ---
        result["original_crop_b64"] = numpy_to_base64(original_crop)

        enhanced = original_crop.copy()

        # --- Stage 1: OpenCV preprocessing ---
        t0 = time.perf_counter()
        try:
            enhanced = preprocess_plate_crop(enhanced)
            result["stages_applied"].append("opencv_preprocess")
        except Exception as e:
            logger.warning(f"Plate {plate_id}: OpenCV preprocess failed: {e}")
        result["timings"]["preprocess"] = round(time.perf_counter() - t0, 3)

        # --- Stage 2: Zero-DCE ---
        t0 = time.perf_counter()
        try:
            enhanced, dce_applied = enhance_with_zero_dce(enhanced)
            if dce_applied:
                result["stages_applied"].append("zero_dce")
        except Exception as e:
            logger.warning(f"Plate {plate_id}: Zero-DCE failed: {e}")
        result["timings"]["zero_dce"] = round(time.perf_counter() - t0, 3)

        # --- Stage 3: CLAHE ---
        t0 = time.perf_counter()
        try:
            enhanced, clahe_applied = apply_clahe(enhanced)
            if clahe_applied:
                result["stages_applied"].append("clahe")
        except Exception as e:
            logger.warning(f"Plate {plate_id}: CLAHE failed: {e}")
        result["timings"]["clahe"] = round(time.perf_counter() - t0, 3)

        # --- Stage 4: Real-ESRGAN super-resolution ---
        t0 = time.perf_counter()
        try:
            enhanced, esrgan_applied = upscale_plate_crop(enhanced)
            if esrgan_applied:
                result["stages_applied"].append("real_esrgan")
            else:
                result["stages_applied"].append("bicubic_upscale")
        except Exception as e:
            logger.warning(f"Plate {plate_id}: Real-ESRGAN failed: {e}")
        result["timings"]["super_resolution"] = round(time.perf_counter() - t0, 3)

        # --- Store enhanced crop ---
        result["enhanced_crop_b64"] = numpy_to_base64(enhanced)

        # --- Stage 5: PaddleOCR ---
        t0 = time.perf_counter()
        ocr_result = run_ocr_on_crop(enhanced)
        result["timings"]["ocr"] = round(time.perf_counter() - t0, 3)

        if not ocr_result["success"]:
            result["processing_status"] = "OCR_FAILED"
            result["processing_error"] = ocr_result.get("error", "Unknown OCR error")
            logger.warning(
                f"Plate {plate_id}: OCR failed — {result['processing_error']}"
            )
        else:
            result["stages_applied"].append("paddleocr")

        raw_ocr = ocr_result.get("raw_ocr", "")
        ocr_conf = ocr_result.get("ocr_confidence", 0.0)

        # --- Stage 6: Indian plate validation ---
        plate_info = process_ocr_result(raw_ocr)
        result["raw_ocr"] = plate_info["raw_ocr"]
        result["normalized_plate"] = plate_info["normalized_plate"]
        result["validation_status"] = plate_info["validation_status"]
        result["validation_note"] = plate_info["validation_note"]
        result["ocr_confidence"] = round(ocr_conf, 4)
        result["overall_confidence"] = _compute_overall_confidence(
            detection_confidence, ocr_conf
        )

        if result["processing_status"] == "SUCCESS" and not raw_ocr.strip():
            result["processing_status"] = "OCR_NO_TEXT"

    except Exception as e:
        logger.error(f"Plate {plate_id}: Unexpected pipeline error: {e}", exc_info=True)
        result["processing_status"] = "FAILED"
        result["processing_error"] = str(e)

    return result


# ---------------------------------------------------------------------------
# Main pipeline entry point
# ---------------------------------------------------------------------------

def run_pipeline(image_bytes: bytes) -> Dict[str, Any]:
    """
    Full end-to-end pipeline for one uploaded image.

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

    result["original_image_b64"] = numpy_to_base64(image)

    # --- Detection ---
    t0 = time.perf_counter()
    try:
        detections = detect_license_plates(image)
    except Exception as e:
        logger.error(f"YOLO detection failed: {e}", exc_info=True)
        result["error"] = f"License plate detection failed: {e}"
        return result
    result["timings"]["detection"] = round(time.perf_counter() - t0, 3)

    total = len(detections)
    result["total_plates_detected"] = total
    logger.info(f"Pipeline: {total} plate(s) detected.")

    if total == 0:
        # No plates — still return a processed image (no annotations needed)
        result["processed_image_b64"] = result["original_image_b64"]
        result["success"] = True
        result["timings"]["total"] = round(time.perf_counter() - pipeline_start, 3)
        return result

    # --- Process each plate ---
    t0 = time.perf_counter()
    plate_results: List[Dict] = []

    for detection in detections:
        plate_id = detection["plate_id"]
        original_crop = detection["original_crop"]
        bbox = detection["bbox"]
        det_conf = detection["detection_confidence"]

        logger.info(f"Processing plate #{plate_id} (conf={det_conf:.2f}) ...")
        plate_result = _process_single_plate(
            plate_id=plate_id,
            original_crop=original_crop,
            detection_confidence=det_conf,
            bbox=bbox,
        )
        if detection.get("vehicle_bbox"):
            plate_result["vehicle_bbox"] = detection["vehicle_bbox"]
        plate_results.append(plate_result)

    NON_PLATE_KEYWORDS = {
        # News / media watermarks
        "TIMES", "TIMESNOW", "GOVERNOR", "OFFICIAL", "OFFICIALUSE",
        "TEMPORARY", "REGISTRATION", "POLICE", "HIGHWAY", "TOLL",
        "GROUP", "TRMN", "NEWDELHI", "DELHI", "INDIA", "TRANSPORT",
        "MAIAD", "ALAMY", "STOCK", "PHOTO", "NEWS", "BHARAT",
        "CHTANMENTAS", "XABUSHANOI", "XABUS", "XABUSHANO",
        "DAOCA", "OUUHSAUUX",
        # Common billboard / storefront text visible in Indian traffic CCTV
        "SHARMA", "ELECTRONICS", "BANKOFINDIA", "BANKOFIND",
        "CAFE", "DELIGHT", "CAFEDELIGHT", "BANDRA", "JUNCTION",
        "SUPERMARKET", "HOSPITAL", "SCHOOL", "COLLEGE", "UNIVERSITY",
        "PETROL", "DIESEL", "PUMP", "FILLING", "STATION",
        "RESTAURANT", "HOTEL", "LODGE", "MALL", "PLAZA", "TOWER",
        "POLICE", "MUNICIPAL", "CORPORATION", "NAGAR", "NIGAM",
        "BHAVAN", "BHAWAN", "MANDIR", "MASJID", "CHURCH", "GURUDWARA",
    }

    # Filter out distant vehicles & false positives:
    # Only vehicles whose license plate is clearly visible and readable are retained.
    # Distant vehicles or vehicles with unreadable/sub-pixel plates are discarded.
    valid_plate_results = []
    for p in plate_results:
        raw = p.get("raw_ocr", "").strip()
        ocr_conf = p.get("ocr_confidence", 0.0)
        det_conf = p.get("detection_confidence", 0.0)
        val_status = p.get("validation_status", "UNCERTAIN")
        alnum_chars = [c for c in raw if c.isalnum()]
        clean_alnum = "".join(alnum_chars).upper()

        # Discard known watermarks or billboard words
        if clean_alnum in NON_PLATE_KEYWORDS:
            logger.info(f"Discarded non-plate keyword #{p['plate_id']} '{raw}'")
            continue

        # Reject distant vehicles, empty OCR, or unreadable noise (< 3 alphanumeric chars)
        if len(alnum_chars) < 3 or ocr_conf <= 0.0 or not raw:
            logger.info(f"Discarded distant vehicle/unreadable plate #{p['plate_id']} '{raw}' (insufficient/no OCR)")
            continue

        # If flagged INVALID_FORMAT, only retain if it contains both letters and digits and looks like a real plate
        if val_status == "INVALID_FORMAT":
            has_letters = any(c.isalpha() for c in clean_alnum)
            has_digits = any(c.isdigit() for c in clean_alnum)
            if 4 <= len(alnum_chars) <= 12 and has_letters and has_digits:
                p["validation_status"] = "POSSIBLE_FORMAT"
                p["validation_note"] = "Detected vehicle registration plate"
                if not p.get("normalized_plate"):
                    p["normalized_plate"] = clean_alnum
            else:
                logger.info(f"Discarded invalid non-plate text #{p['plate_id']} '{raw}' (INVALID_FORMAT)")
                continue

        # Drop any leftover distant vehicle or unreadable placeholders
        if p.get("normalized_plate") in ("DISTANT VEHICLE", "UNREADABLE", "UNREADABLE_OR_DISTANT", ""):
            logger.info(f"Discarded distant vehicle placeholder #{p['plate_id']}")
            continue

        if p.get("validation_status") == "UNREADABLE_OR_DISTANT":
            logger.info(f"Discarded unreadable/distant status #{p['plate_id']}")
            continue

        if not p.get("normalized_plate") and clean_alnum:
            p["normalized_plate"] = clean_alnum

        valid_plate_results.append(p)

    # Deduplicate by normalized plate text
    seen_texts: dict = {}
    for p in valid_plate_results:
        norm = p.get("normalized_plate", "").strip()
        key = norm if norm else f"__plate_{p['plate_id']}"
        existing = seen_texts.get(key)
        if existing is None:
            seen_texts[key] = p
        else:
            if p.get("overall_confidence", 0.0) > existing.get("overall_confidence", 0.0):
                seen_texts[key] = p

    valid_plate_results = list(seen_texts.values())

    # Re-index plate IDs
    for idx, p in enumerate(valid_plate_results, start=1):
        p["plate_id"] = idx

    # --- Vehicle attribute detection (Feature 2) ---
    for p in valid_plate_results:
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

    result["total_plates_detected"] = len(valid_plate_results)
    result["timings"]["plate_processing"] = round(time.perf_counter() - t0, 3)

    # --- Annotated image (bounding boxes for vehicles & plates) ---
    try:
        annotated = draw_bounding_boxes(
            image,
            [
                {
                    "plate_id": p["plate_id"],
                    "bbox": p["bbox"],
                    "detection_confidence": p["detection_confidence"],
                    "normalized_plate": p.get("normalized_plate", ""),
                    "validation_status": p.get("validation_status", "UNCERTAIN"),
                }
                for p in valid_plate_results
            ],
            vehicles=[
                {
                    "vehicle_bbox": p.get("vehicle_bbox"),
                    "vehicle_type": p.get("vehicle_type", "car"),
                    "car_color": p.get("car_color"),
                }
                for p in valid_plate_results if p.get("vehicle_bbox")
            ],
        )
        result["processed_image_b64"] = numpy_to_base64(annotated)
    except Exception as e:
        logger.warning(f"Failed to draw bounding boxes: {e}")
        result["processed_image_b64"] = result["original_image_b64"]

    result["plates"] = valid_plate_results
    result["success"] = True
    result["timings"]["total"] = round(time.perf_counter() - pipeline_start, 3)

    logger.info(
        f"Pipeline complete — {len(valid_plate_results)} verified plate(s) in "
        f"{result['timings']['total']:.2f}s"
    )
    return result
