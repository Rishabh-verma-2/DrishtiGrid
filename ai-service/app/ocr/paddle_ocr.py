"""
PaddleOCR wrapper for license plate text extraction.
The OCR engine is loaded ONCE at startup.
"""

import logging
import time
from typing import Dict, Optional, Tuple

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG

logger = logging.getLogger(__name__)

_ocr_engine = None


def load_ocr_engine():
    """Initialize PaddleOCR engine once at startup."""
    global _ocr_engine

    try:
        from paddleocr import PaddleOCR
    except ImportError:
        logger.error(
            "PaddleOCR not installed. Run: pip install paddleocr paddlepaddle"
        )
        raise

    lang = MODEL_CONFIG.get("OCR_LANG", "en")
    use_angle_cls = MODEL_CONFIG.get("OCR_USE_ANGLE_CLS", True)
    use_gpu = MODEL_CONFIG.get("OCR_USE_GPU", False)

    logger.info(
        f"Loading PaddleOCR (lang={lang}, angle_cls={use_angle_cls}, gpu={use_gpu})"
    )
    _ocr_engine = PaddleOCR(
        use_angle_cls=use_angle_cls,
        lang=lang,
        use_gpu=use_gpu,
        show_log=False,
    )
    logger.info("PaddleOCR engine loaded.")
    return _ocr_engine


def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        load_ocr_engine()
    return _ocr_engine


def run_ocr_on_crop(crop: np.ndarray) -> Dict:
    """
    Run PaddleOCR on a BGR plate crop.

    Returns:
    {
        "raw_ocr": str,          # concatenated OCR output
        "ocr_confidence": float, # average confidence across detected text boxes
        "success": bool,
        "error": str or None
    }
    """
    if crop is None or crop.size == 0:
        return {
            "raw_ocr": "",
            "ocr_confidence": 0.0,
            "success": True,
            "error": None,
        }

    engine = get_ocr_engine()
    if engine is None:
        return {
            "raw_ocr": "",
            "ocr_confidence": 0.0,
            "success": False,
            "error": "OCR engine not loaded",
        }

    t0 = time.perf_counter()
    try:
        if len(crop.shape) == 2:
            rgb_crop = cv2.cvtColor(crop, cv2.COLOR_GRAY2RGB)
        else:
            rgb_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)

        result = engine.ocr(rgb_crop, cls=True)

        elapsed = time.perf_counter() - t0
        logger.debug(f"PaddleOCR completed in {elapsed:.3f}s")

        if not result or result == [None] or result[0] is None:
            return {
                "raw_ocr": "",
                "ocr_confidence": 0.0,
                "success": True,
                "error": None,
            }

        # Filter and sort lines geometrically: top-to-bottom (rows), then left-to-right
        valid_lines = []
        for line in result[0]:
            if line is None:
                continue
            bbox_pts, (text, conf) = line
            text_str = text.strip() if text else ""
            if not text_str:
                continue
            # Ignore standalone IND badge marker box if separate from the plate text
            if text_str.upper() == "IND":
                continue
            valid_lines.append((bbox_pts, text_str, float(conf)))

        # Sort by vertical bucket (Y / 25px) then horizontal position (X)
        def get_box_sort_key(item):
            pts = item[0]
            avg_y = sum(p[1] for p in pts) / len(pts)
            min_x = min(p[0] for p in pts)
            return (round(avg_y / 25.0), min_x)

        valid_lines.sort(key=get_box_sort_key)

        texts = [item[1] for item in valid_lines]
        confidences = [item[2] for item in valid_lines]

        raw_ocr = " ".join(texts)
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

        return {
            "raw_ocr": raw_ocr,
            "ocr_confidence": round(avg_conf, 4),
            "success": True,
            "error": None,
        }

    except Exception as e:
        logger.error(f"PaddleOCR inference failed: {e}")
        return {
            "raw_ocr": "",
            "ocr_confidence": 0.0,
            "success": False,
            "error": str(e),
        }
