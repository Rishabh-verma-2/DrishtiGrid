"""
FastAPI application entry point.
Models are loaded once at startup via lifespan events.
"""

import os
import sys
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config.settings import MODEL_CONFIG

# PyTorch 2.6+ compatibility fix for model weights loading
try:
    import torch
    _orig_torch_load = torch.load
    def _compat_torch_load(*args, **kwargs):
        if "weights_only" not in kwargs:
            kwargs["weights_only"] = False
        return _orig_torch_load(*args, **kwargs)
    torch.load = _compat_torch_load
except Exception:
    pass


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Startup / shutdown model loading
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load all ML models at startup, release at shutdown."""
    logger.info("=== ANPR AI Service — Starting up ===")

    # 1. YOLO
    lp_model = None
    try:
        from app.detection.yolo_detector import load_yolo_model, get_lp_model_diagnostics
        lp_model = load_yolo_model()
    except Exception as e:
        logger.error(f"YOLO model loading failed: {e}")

    # 2. Zero-DCE
    try:
        from app.enhancement.zero_dce import load_zero_dce_model
        load_zero_dce_model()
    except Exception as e:
        logger.warning(f"Zero-DCE loading failed (non-fatal): {e}")

    # 3. Real-ESRGAN
    try:
        from app.super_resolution.real_esrgan import load_realesrgan_model
        load_realesrgan_model()
    except Exception as e:
        logger.warning(f"Real-ESRGAN loading failed (non-fatal, bicubic fallback): {e}")

    # 4. OCR Engine (PaddleOCR / EasyOCR)
    try:
        from app.ocr.paddle_ocr import load_ocr_engine, get_ocr_diagnostics
        load_ocr_engine()
    except Exception as e:
        logger.error(f"OCR engine loading failed: {e}")

    # 5. YOLO Vehicle Attributes Model
    try:
        from app.detection.vehicle_attributes import _get_vehicle_model
        _get_vehicle_model()
    except Exception as e:
        logger.warning(f"Vehicle model preloading failed (non-fatal): {e}")

    # 6. Crowd Detector warm-up (reuses the already-loaded YOLO model)
    try:
        from app.detection.crowd_detector import detect_crowd
        import numpy as np
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        detect_crowd(dummy_frame, camera_id="__warmup__")
        logger.info("Crowd detector warmed up successfully.")
    except Exception as e:
        logger.warning(f"Crowd detector warm-up failed (non-fatal): {e}")

    # 7. Comprehensive 10-Point ANPR Diagnostics Logging
    try:
        import torch
        from pathlib import Path
        from app.detection.yolo_detector import get_lp_model_diagnostics
        from app.ocr.paddle_ocr import get_ocr_diagnostics

        lp_diag = get_lp_model_diagnostics()
        ocr_diag = get_ocr_diagnostics()
        cuda_avail = torch.cuda.is_available() if torch else False
        dedicated_path = Path("model_weights/license_plate_detector.pt")
        dedicated_exists = dedicated_path.is_file()

        logger.info("============================================================")
        logger.info("           ANPR RUNTIME STARTUP DIAGNOSTICS                 ")
        logger.info("============================================================")
        logger.info(f" 1. Primary YOLO Model:    {lp_diag.get('lp_model_path') or 'None'}")
        logger.info(f" 2. Dedicated LP Exists:   {dedicated_exists} ({dedicated_path})")
        logger.info(f" 3. Model Path:            {lp_diag.get('lp_model_path')}")
        logger.info(f" 4. Model Class Names:     {list(lp_model.names.values()) if lp_model and hasattr(lp_model, 'names') else 'N/A'}")
        logger.info(f" 5. Has LP Class:          {lp_diag.get('lp_model_available', False)} (matched: {lp_diag.get('lp_model_classes', [])})")
        logger.info(f" 6. Loaded OCR Engine:     {ocr_diag.get('ocr_engine')}")
        logger.info(f" 7. OCR Engine Version:    {ocr_diag.get('ocr_version')}")
        logger.info(f" 8. OCR Initialized:       {ocr_diag.get('ocr_available')} ({ocr_diag.get('ocr_status')})")
        logger.info(f" 9. CUDA / GPU Available:  {cuda_avail}")
        logger.info(f"10. CPU Fallback Active:   {not cuda_avail}")
        logger.info("============================================================")

        if not lp_diag.get("lp_model_available", False):
            logger.warning("DEDICATED LP MODEL NOT FOUND — PLATE DETECTION QUALITY WILL BE LIMITED")

    except Exception as e:
        logger.error(f"Startup diagnostics logging error: {e}")

    logger.info("=== All models loaded. Ready to serve requests. ===")

    yield  # --- Application runs here ---

    logger.info("=== ANPR AI Service — Shutting down ===")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ANPR AI Service",
    description=(
        "Standalone license plate detection, enhancement, "
        "and OCR service for Indian vehicles."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the Node.js backend and local dev frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="")


# ---------------------------------------------------------------------------
# Dev entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=MODEL_CONFIG["AI_SERVICE_HOST"],
        port=MODEL_CONFIG["AI_SERVICE_PORT"],
        reload=False,
        log_level="info",
    )
