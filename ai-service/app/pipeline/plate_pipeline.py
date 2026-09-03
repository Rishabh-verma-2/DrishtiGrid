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
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG
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

def _decode_image(image_bytes: bytes) -> Optional[np.ndarray]:
    """Decode raw bytes to a BGR NumPy array. Returns None on failure."""
    try:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
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
        plate_results.append(plate_result)

    # Filter out false positives: if an object has NO alphanumeric OCR text and OCR confidence is 0,
    # it is a false positive (e.g. taillight, wheel, car logo, or road artifact).
    valid_plate_results = []
    for p in plate_results:
        raw = p.get("raw_ocr", "").strip()
        ocr_conf = p.get("ocr_confidence", 0.0)
        det_conf = p.get("detection_confidence", 0.0)
        alnum_chars = [c for c in raw if c.isalnum()]

        if len(alnum_chars) == 0 and ocr_conf == 0.0 and det_conf < 0.70:
            logger.info(
                f"Discarded false positive detection #{p['plate_id']} "
                f"(zero OCR text, conf={det_conf:.2f})"
            )
            continue
        valid_plate_results.append(p)

    # Re-index plate IDs
    for idx, p in enumerate(valid_plate_results, start=1):
        p["plate_id"] = idx

    result["total_plates_detected"] = len(valid_plate_results)
    result["timings"]["plate_processing"] = round(time.perf_counter() - t0, 3)

    # --- Annotated image (bounding boxes) ---
    try:
        annotated = draw_bounding_boxes(image, [
            {
                "plate_id": p["plate_id"],
                "bbox": p["bbox"],
                "detection_confidence": p["detection_confidence"],
                "normalized_plate": p.get("normalized_plate", ""),
            }
            for p in valid_plate_results
        ])
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
