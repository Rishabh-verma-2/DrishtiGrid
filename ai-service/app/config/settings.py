"""
Centralized configuration for the ANPR AI Service.
All model paths, thresholds, and pipeline parameters live here.
"""

import os
from pathlib import Path
from typing import Any, Dict

# ---------------------------------------------------------------------------
# Base Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # ai-service/
WEIGHTS_DIR = BASE_DIR / "model_weights"
TEMP_DIR = BASE_DIR / "temp"

# Ensure directories exist
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Model Paths
# ---------------------------------------------------------------------------
MODEL_CONFIG: Dict[str, Any] = {
    # ---- Detection ----
    "YOLO_MODEL_PATH": str(WEIGHTS_DIR / "yolov8n.pt"),
    # Dedicated license-plate YOLOv8 weights (preferred if downloaded)
    "YOLO_LP_MODEL_PATH": str(WEIGHTS_DIR / "license_plate_detector.pt"),
    # Which YOLO model to prefer: "lp" = dedicated LP model, "coco" = generic
    "YOLO_MODEL_PREFERENCE": os.getenv("YOLO_MODEL_PREFERENCE", "lp"),

    # ---- Zero-DCE ----
    "ZERO_DCE_WEIGHTS_PATH": str(WEIGHTS_DIR / "zero_dce.pth"),

    # ---- Real-ESRGAN ----
    "REALESRGAN_MODEL_NAME": "RealESRGAN_x4plus",
    "REALESRGAN_WEIGHTS_PATH": str(WEIGHTS_DIR / "RealESRGAN_x4plus.pth"),
    "REALESRGAN_SCALE": int(os.getenv("REALESRGAN_SCALE", "4")),  # 2 or 4

    # ---- OCR ----
    "OCR_LANG": "en",
    "OCR_USE_ANGLE_CLS": True,
    "OCR_USE_GPU": False,  # PaddleOCR GPU flag (separate from torch GPU)

    # ---- GPU / CPU ----
    "USE_GPU": os.getenv("USE_GPU", "true").lower() == "true",
    "DEVICE": None,  # Set dynamically at startup based on USE_GPU + availability

    # ---- Detection Thresholds ----
    "YOLO_CONFIDENCE_THRESHOLD": float(os.getenv("YOLO_CONF", "0.25")),
    "YOLO_IOU_THRESHOLD": float(os.getenv("YOLO_IOU", "0.45")),

    # ---- Enhancement Thresholds ----
    # Mean brightness below which Zero-DCE is applied (0–255)
    "ZERO_DCE_BRIGHTNESS_THRESHOLD": int(os.getenv("ZERO_DCE_THRESHOLD", "80")),
    # Apply CLAHE always? Set to True for testing full pipeline
    "FORCE_FULL_PIPELINE": os.getenv("FORCE_FULL_PIPELINE", "false").lower() == "true",

    # ---- Image Constraints ----
    "MAX_IMAGE_SIZE_BYTES": int(os.getenv("MAX_IMAGE_SIZE_MB", "20")) * 1024 * 1024,
    "ALLOWED_MIME_TYPES": {"image/jpeg", "image/jpg", "image/png"},
    "ALLOWED_EXTENSIONS": {".jpg", ".jpeg", ".png"},

    # ---- CLAHE ----
    "CLAHE_CLIP_LIMIT": float(os.getenv("CLAHE_CLIP", "2.0")),
    "CLAHE_TILE_GRID_SIZE": (8, 8),

    # ---- Temp Storage ----
    "TEMP_DIR": str(TEMP_DIR),
    # Seconds before temp session directories are eligible for cleanup
    "TEMP_RETENTION_SECONDS": int(os.getenv("TEMP_RETENTION_SEC", "3600")),

    # ---- API ----
    "AI_SERVICE_HOST": os.getenv("AI_SERVICE_HOST", "0.0.0.0"),
    "AI_SERVICE_PORT": int(os.getenv("AI_SERVICE_PORT", "8000")),
}
