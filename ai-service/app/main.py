"""
FastAPI application entry point.
Models are loaded once at startup via lifespan events.
"""

import logging
import sys
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
    try:
        from app.detection.yolo_detector import load_yolo_model
        load_yolo_model()
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

    # 4. PaddleOCR
    try:
        from app.ocr.paddle_ocr import load_ocr_engine
        load_ocr_engine()
    except Exception as e:
        logger.error(f"PaddleOCR loading failed: {e}")

    # 5. YOLO Vehicle Attributes Model
    try:
        from app.detection.vehicle_attributes import _get_vehicle_model
        _get_vehicle_model()
    except Exception as e:
        logger.warning(f"Vehicle model preloading failed (non-fatal): {e}")

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
