"""
FastAPI routes for the ANPR AI service.
"""

import logging
import time
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
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
