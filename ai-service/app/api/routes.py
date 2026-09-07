"""
FastAPI routes for the ANPR AI service.
"""

import logging
import time
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.config.settings import MODEL_CONFIG
from app.pipeline.plate_pipeline import run_pipeline
from app.utils.image_utils import validate_image_bytes

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_SIZE = MODEL_CONFIG["MAX_IMAGE_SIZE_BYTES"]
ALLOWED_TYPES = MODEL_CONFIG["ALLOWED_MIME_TYPES"]
ALLOWED_EXT = MODEL_CONFIG["ALLOWED_EXTENSIONS"]


@router.get("/health")
async def health_check():
    """Simple health/liveness endpoint."""
    return {"status": "ok", "service": "ANPR AI Service"}


@router.post("/process")
async def process_image(image: UploadFile = File(...)):
    """
    Receive an uploaded image and run the full ANPR pipeline.

    Accepts: JPG, JPEG, PNG (max 20 MB by default)

    Returns a JSON result with all detected plates, crops (base64),
    OCR text, confidence scores, and processing timings.
    """
    # ---- File type validation ----
    content_type = (image.content_type or "").lower()
    filename = (image.filename or "").lower()

    # Extension check
    import os
    _, ext = os.path.splitext(filename)
    if ext not in ALLOWED_EXT and content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported file type '{ext or content_type}'. "
                "Only JPG, JPEG, and PNG images are accepted."
            ),
        )

    # ---- Read bytes ----
    image_bytes = await image.read()

    # ---- Size check ----
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    if len(image_bytes) > MAX_SIZE:
        max_mb = MAX_SIZE // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {max_mb} MB.",
        )

    # ---- Image integrity check ----
    if not validate_image_bytes(image_bytes):
        raise HTTPException(
            status_code=422,
            detail="Uploaded file is not a valid image or is corrupt.",
        )

    # ---- Run pipeline ----
    logger.info(
        f"Processing image: '{image.filename}' "
        f"({len(image_bytes) / 1024:.1f} KB)"
    )

    pipeline_result = run_pipeline(image_bytes)

    if not pipeline_result.get("success") and pipeline_result.get("error"):
        raise HTTPException(status_code=500, detail=pipeline_result["error"])

    # ---- Shape response for frontend ----
    plates_response = []
    for p in pipeline_result.get("plates", []):
        plates_response.append({
            "plate_id": p["plate_id"],
            "bbox": p["bbox"],
            "original_crop": p.get("original_crop_b64", ""),
            "enhanced_crop": p.get("enhanced_crop_b64", ""),
            "original_crop_b64": p.get("original_crop_b64", ""),
            "enhanced_crop_b64": p.get("enhanced_crop_b64", ""),
            "car_color": p.get("car_color"),
            "car_model": p.get("car_model"),
            "vehicle_type": p.get("vehicle_type", "car"),
            "vehicle_bbox": p.get("vehicle_bbox"),
            "raw_ocr": p.get("raw_ocr", ""),
            "normalized_plate": p.get("normalized_plate", ""),
            "detection_confidence": p.get("detection_confidence", 0.0),
            "ocr_confidence": p.get("ocr_confidence", 0.0),
            "overall_confidence": p.get("overall_confidence", 0.0),
            "validation_status": p.get("validation_status", "UNCERTAIN"),
            "validation_note": p.get("validation_note", ""),
            "processing_status": p.get("processing_status", "FAILED"),
            "processing_error": p.get("processing_error"),
            "stages_applied": p.get("stages_applied", []),
            "timings": p.get("timings", {}),
        })

    response = {
        "success": pipeline_result.get("success", False),
        "total_plates_detected": pipeline_result.get("total_plates_detected", 0),
        "original_image": pipeline_result.get("original_image_b64", ""),
        "processed_image": pipeline_result.get("processed_image_b64", ""),
        "plates": plates_response,
        "timings": pipeline_result.get("timings", {}),
    }

    return JSONResponse(content=response)


@router.post("/crowd")
async def crowd_detection(
    image: UploadFile = File(...),
    camera_id: str = Form(default="default"),
    conf_threshold: float = Form(default=0.30),
    grid_rows: int = Form(default=3),
    grid_cols: int = Form(default=4),
):
    """
    Crowd Detection & Density Analysis endpoint.

    Accepts a JPEG/PNG image frame from a CCTV camera and runs:
    - YOLOv8 person detection (COCO class 0)
    - Spatial density grid analysis
    - Crowd level classification (LOW / MEDIUM / HIGH / CRITICAL)
    - Crowd surge detection (vs. per-camera rolling baseline)
    - Annotated image with heatmap overlay and summary panel

    Parameters
    ----------
    image          : Uploaded image file (JPG/PNG, max 20 MB)
    camera_id      : Unique camera identifier for surge baseline tracking
    conf_threshold : YOLO detection confidence threshold (default 0.30)
    grid_rows      : Density grid row divisions (default 3)
    grid_cols      : Density grid column divisions (default 4)

    Returns
    -------
    JSON with crowd metrics, zone breakdown, detections list,
    surge info, and annotated image (base64).
    """
    # ---- Validate file type ----
    content_type = (image.content_type or "").lower()
    filename = (image.filename or "").lower()
    import os
    _, ext = os.path.splitext(filename)
    if ext not in ALLOWED_EXT and content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ext or content_type}'. Only JPG/JPEG/PNG accepted.",
        )

    # ---- Read bytes ----
    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    if len(image_bytes) > MAX_SIZE:
        max_mb = MAX_SIZE // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File too large. Max {max_mb} MB.")

    # ---- Decode image ----
    if not validate_image_bytes(image_bytes):
        raise HTTPException(status_code=422, detail="File is not a valid or readable image.")

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=422, detail="Could not decode image.")

    # ---- Run crowd detection ----
    logger.info(
        f"[Crowd] Analyzing frame from camera='{camera_id}' "
        f"({len(image_bytes)/1024:.1f} KB)"
    )

    try:
        from app.detection.crowd_detector import detect_crowd
        crowd_result = detect_crowd(
            image=frame,
            camera_id=camera_id,
            conf_threshold=max(0.15, min(0.95, conf_threshold)),
            grid_rows=max(1, min(8, grid_rows)),
            grid_cols=max(1, min(8, grid_cols)),
        )
    except Exception as e:
        logger.error(f"[Crowd] Detection error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Crowd detection failed: {e}")

    if not crowd_result.get("success") and crowd_result.get("error"):
        raise HTTPException(status_code=500, detail=crowd_result["error"])

    return JSONResponse(content=crowd_result)


@router.post("/crowd/reset/{camera_id}")
async def crowd_reset_baseline(camera_id: str):
    """
    Reset the in-memory surge detection baseline for a specific camera.
    Call this when a camera is reconfigured or its scene changes significantly.
    """
    try:
        from app.detection.crowd_detector import reset_camera_baseline
        reset_camera_baseline(camera_id)
        return {"success": True, "message": f"Baseline reset for camera '{camera_id}'."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
