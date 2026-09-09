"""
Universal OCR engine for license plate text extraction.
Provides high-accuracy OCR powered by EasyOCR (PyTorch / Metal / CPU),
with a backward-compatible interface for PaddleOCR call patterns.
Loaded ONCE at startup to ensure fast real-time inference without crashes.
"""

import logging
import re
import time
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG

logger = logging.getLogger(__name__)

_ocr_engine = None


class UniversalOCREngine:
    """
    Unified OCR Engine wrapping EasyOCR with full backward-compatibility
    for PaddleOCR call signatures (.ocr(img, cls=True)).
    """
    def __init__(self, lang: str = "en", use_gpu: bool = False):
        try:
            import easyocr
            self.reader = easyocr.Reader([lang], gpu=use_gpu)
            logger.info("Universal EasyOCR engine initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize EasyOCR engine: {e}")
            self.reader = None

    def ocr(self, img: np.ndarray, cls: bool = True, **kwargs) -> List[List]:
        """
        Mimics PaddleOCR .ocr() output:
        Returns [[ [pts, (text, conf)], [pts, (text, conf)], ... ]]
        where pts is [[x1,y1], [x2,y1], [x2,y2], [x1,y2]].
        """
        if self.reader is None or img is None or img.size == 0:
            return [[]]

        try:
            # Ensure RGB image format
            if len(img.shape) == 2:
                rgb = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
            elif img.shape[2] == 4:
                rgb = cv2.cvtColor(img, cv2.COLOR_BGRA2RGB)
            else:
                rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

            results = self.reader.readtext(rgb)
            lines = []
            for item in results:
                bbox_pts, text, conf = item[0], item[1], item[2]
                pts = [[float(p[0]), float(p[1])] for p in bbox_pts]
                lines.append([pts, (str(text).strip(), float(conf))])
            return [lines]
        except Exception as err:
            logger.debug(f"OCR inference internal error: {err}")
            return [[]]


def load_ocr_engine():
    """Initialize OCR engine once at startup."""
    global _ocr_engine

    lang = MODEL_CONFIG.get("OCR_LANG", "en")
    use_gpu = MODEL_CONFIG.get("OCR_USE_GPU", False)

    logger.info(f"Loading Universal OCR Engine (lang={lang}, gpu={use_gpu})")
    _ocr_engine = UniversalOCREngine(lang=lang, use_gpu=use_gpu)
    logger.info("Universal OCR engine ready.")
    return _ocr_engine


def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        load_ocr_engine()
    return _ocr_engine


def run_ocr_on_crop(crop: np.ndarray) -> Dict:
    """
    Run OCR on a BGR plate crop.

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
        result = engine.ocr(crop, cls=True)

        elapsed = time.perf_counter() - t0
        logger.debug(f"OCR completed in {elapsed:.3f}s")

        if not result or result == [None] or not result[0]:
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
        logger.error(f"OCR inference failed: {e}")
        return {
            "raw_ocr": "",
            "ocr_confidence": 0.0,
            "success": False,
            "error": str(e),
        }

