"""
Real-ESRGAN super-resolution for license plate crops.

The model is loaded ONCE at startup and reused.
GPU is used if available; CPU fallback is supported.

Weight download:
  python download_models.py --model realesrgan

References:
  Real-ESRGAN: https://github.com/xinntao/Real-ESRGAN
"""

import logging
import time
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG

logger = logging.getLogger(__name__)

_realesrgan_upsampler = None


def load_realesrgan_model():
    """Load Real-ESRGAN model once. Returns None if weights unavailable."""
    global _realesrgan_upsampler

    weights_path = Path(MODEL_CONFIG["REALESRGAN_WEIGHTS_PATH"])
    model_name = MODEL_CONFIG.get("REALESRGAN_MODEL_NAME", "RealESRGAN_x4plus")
    scale = MODEL_CONFIG.get("REALESRGAN_SCALE", 4)
    use_gpu = MODEL_CONFIG.get("USE_GPU", True)

    if not weights_path.exists():
        logger.warning(
            f"Real-ESRGAN weights not found at {weights_path}. "
            "Run 'python download_models.py --model realesrgan' to download. "
            "Bicubic upscaling fallback will be used."
        )
        return None

    try:
        import torch

        # Try the official realesrgan package first
        try:
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer

            if "x2" in model_name:
                model = RRDBNet(
                    num_in_ch=3, num_out_ch=3, num_feat=64,
                    num_block=23, num_grow_ch=32, scale=2
                )
                scale = 2
            else:
                model = RRDBNet(
                    num_in_ch=3, num_out_ch=3, num_feat=64,
                    num_block=23, num_grow_ch=32, scale=4
                )
                scale = 4

            gpu_id = 0 if (use_gpu and torch.cuda.is_available()) else None
            _realesrgan_upsampler = RealESRGANer(
                scale=scale,
                model_path=str(weights_path),
                model=model,
                tile=0,
                tile_pad=10,
                pre_pad=0,
                half=use_gpu and torch.cuda.is_available(),
                gpu_id=gpu_id,
            )
            logger.info(
                f"Real-ESRGAN loaded (scale={scale}, GPU={gpu_id is not None})"
            )
            return _realesrgan_upsampler

        except ImportError:
            logger.warning(
                "realesrgan package not installed. "
                "Run: pip install realesrgan basicsr. "
                "Falling back to bicubic upscaling."
            )
            return None

    except Exception as e:
        logger.error(f"Failed to load Real-ESRGAN: {e}")
        return None


def get_realesrgan_model():
    global _realesrgan_upsampler
    if _realesrgan_upsampler is None:
        load_realesrgan_model()
    return _realesrgan_upsampler


def upscale_plate_crop(
    crop: np.ndarray,
    scale: Optional[int] = None,
) -> Tuple[np.ndarray, bool]:
    """
    Super-resolve a plate crop using Real-ESRGAN.

    Falls back to OpenCV bicubic upscaling if the model is unavailable.

    Returns
    -------
    (upscaled: np.ndarray, used_esrgan: bool)
    """
    if crop is None or crop.size == 0:
        return crop, False

    upsampler = get_realesrgan_model()
    scale = scale or MODEL_CONFIG.get("REALESRGAN_SCALE", 4)

    # Real-ESRGAN path
    if upsampler is not None:
        t0 = time.perf_counter()
        try:
            # RealESRGANer expects BGR uint8
            output, _ = upsampler.enhance(crop, outscale=scale)
            elapsed = time.perf_counter() - t0
            logger.debug(f"Real-ESRGAN upscale completed in {elapsed:.3f}s")
            return output, True
        except Exception as e:
            logger.error(f"Real-ESRGAN inference failed: {e} — falling back to bicubic")

    # Bicubic fallback
    h, w = crop.shape[:2]
    upscaled = cv2.resize(
        crop, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC
    )
    logger.debug(f"Bicubic x{scale} upscaling applied as fallback.")
    return upscaled, False
