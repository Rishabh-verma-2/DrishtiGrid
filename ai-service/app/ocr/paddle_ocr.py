"""
Universal OCR engine for license plate text extraction.
Supports PaddleOCR (primary for production ANPR) and EasyOCR (fallback/alternative).
Loaded ONCE at startup to ensure fast real-time inference without crashes.
"""

import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG

logger = logging.getLogger(__name__)

# Global state & diagnostics
_ocr_engine = None
OCR_ENGINE_NAME: str = "none"
OCR_ENGINE_STATUS: str = "uninitialized"
OCR_ENGINE_VERSION: str = "unknown"
OCR_ENGINE_AVAILABLE: bool = False


class UniversalOCREngine:
    """
    Unified OCR Engine supporting both PaddleOCR and EasyOCR backends
    with an identical `.ocr(img, cls=True)` interface returning:
    [[ [pts, (text, float(conf))], ... ]]
    """
    def __init__(self, engine_type: str = "paddle", lang: str = "en", use_gpu: bool = False):
        self.engine_type = engine_type.lower().strip()
        self.lang = lang
        self.use_gpu = use_gpu
        self.reader = None
        self.status = "uninitialized"
        self.version = "unknown"

        if self.engine_type == "paddle":
            self._init_paddle()
            if self.reader is None:
                logger.warning("PaddleOCR failed to initialize. Attempting EasyOCR fallback...")
                self.engine_type = "easyocr"
                self._init_easyocr()
        elif self.engine_type == "easyocr":
            self._init_easyocr()
            if self.reader is None:
                logger.warning("EasyOCR failed to initialize. Attempting PaddleOCR fallback...")
                self.engine_type = "paddle"
                self._init_paddle()
        else:
            logger.error(f"Unsupported OCR_ENGINE='{engine_type}'. Supported: 'paddle', 'easyocr'.")
            self._init_paddle()
            if self.reader is None:
                self._init_easyocr()

    def _init_paddle(self):
        try:
            import paddleocr
            from paddleocr import PaddleOCR
            self.version = getattr(paddleocr, "__version__", "unknown")
            logger.info(f"Initializing PaddleOCR (v{self.version}, lang={self.lang}, gpu={self.use_gpu})...")
            # In PaddleOCR 3.7+, use_textline_orientation is preferred
            try:
                self.reader = PaddleOCR(lang=self.lang, use_gpu=self.use_gpu, show_log=False)
            except Exception:
                self.reader = PaddleOCR(lang=self.lang)
            self.engine_type = "paddle"
            self.status = f"PaddleOCR v{self.version} initialized successfully"
            logger.info(f"[OCR] {self.status}")
        except Exception as e:
            logger.error(f"[OCR] Failed to initialize PaddleOCR: {e}")
            self.reader = None
            self.status = f"PaddleOCR initialization failed: {e}"

    def _init_easyocr(self):
        try:
            import easyocr
            self.version = getattr(easyocr, "__version__", "unknown")
            logger.info(f"Initializing EasyOCR (v{self.version}, lang={self.lang}, gpu={self.use_gpu})...")
            self.reader = easyocr.Reader([self.lang], gpu=self.use_gpu)
            self.engine_type = "easyocr"
            self.status = f"EasyOCR v{self.version} initialized successfully"
            logger.info(f"[OCR] {self.status}")
        except Exception as e:
            logger.error(f"[OCR] Failed to initialize EasyOCR: {e}")
            self.reader = None
            self.status = f"EasyOCR initialization failed: {e}"

    def ocr(self, img: np.ndarray, cls: bool = True, **kwargs) -> List[List]:
        """
        Unified OCR execution.
        Returns:
            [[ [pts, (text_str, float_conf)], ... ]]
        """
        if self.reader is None or img is None or img.size == 0:
            return [[]]

        try:
            # Ensure RGB format
            if len(img.shape) == 2:
                rgb = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
            elif img.shape[2] == 4:
                rgb = cv2.cvtColor(img, cv2.COLOR_BGRA2RGB)
            else:
                rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

            lines = []

            if self.engine_type == "paddle":
                raw = self.reader.ocr(rgb)
                if raw and len(raw) > 0:
                    first = raw[0]
                    # PaddleOCR v3 dict output format
                    if isinstance(first, dict):
                        texts = first.get("rec_texts", [])
                        scores = first.get("rec_scores", [])
                        polys = first.get("rec_polys", [])
                        boxes = first.get("rec_boxes", [])
                        for i in range(len(texts)):
                            txt = str(texts[i]).strip()
                            if not txt:
                                continue
                            conf = float(scores[i]) if i < len(scores) else 0.5
                            poly = []
                            if i < len(polys) and hasattr(polys[i], "tolist"):
                                poly = polys[i].tolist()
                            elif i < len(boxes) and hasattr(boxes[i], "tolist"):
                                b = boxes[i].tolist()
                                poly = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]
                            lines.append([poly, (txt, conf)])
                    # PaddleOCR v2 classic list output format
                    elif isinstance(first, list):
                        for item in first:
                            if not item or len(item) < 2:
                                continue
                            bbox_pts, text_conf = item[0], item[1]
                            if isinstance(text_conf, (list, tuple)) and len(text_conf) >= 2:
                                lines.append([bbox_pts, (str(text_conf[0]).strip(), float(text_conf[1]))])

            elif self.engine_type == "easyocr":
                results = self.reader.readtext(rgb)
                for item in results:
                    bbox_pts, text, conf = item[0], item[1], item[2]
                    pts = [[float(p[0]), float(p[1])] for p in bbox_pts]
                    txt_str = str(text).strip()
                    if txt_str:
                        lines.append([pts, (txt_str, float(conf))])

            return [lines]

        except Exception as err:
            logger.debug(f"[OCR] Inference internal error: {err}")
            return [[]]


def get_ocr_engine(engine_name: Optional[str] = None) -> Optional[UniversalOCREngine]:
    """
    Factory function to retrieve or lazily initialize the configured OCR engine.
    Supported: 'paddle', 'easyocr'.
    """
    global _ocr_engine, OCR_ENGINE_NAME, OCR_ENGINE_STATUS, OCR_ENGINE_VERSION, OCR_ENGINE_AVAILABLE

    if _ocr_engine is not None and engine_name is None:
        return _ocr_engine

    target_engine = (
        engine_name
        or os.getenv("OCR_ENGINE")
        or MODEL_CONFIG.get("OCR_ENGINE")
        or "paddle"
    ).lower().strip()

    lang = MODEL_CONFIG.get("OCR_LANG", "en")
    use_gpu = MODEL_CONFIG.get("OCR_USE_GPU", False)

    logger.info(f"[OCR] get_ocr_engine requested: '{target_engine}' (lang={lang}, gpu={use_gpu})")
    engine = UniversalOCREngine(engine_type=target_engine, lang=lang, use_gpu=use_gpu)

    if engine.reader is not None:
        _ocr_engine = engine
        OCR_ENGINE_NAME = engine.engine_type
        OCR_ENGINE_STATUS = engine.status
        OCR_ENGINE_VERSION = engine.version
        OCR_ENGINE_AVAILABLE = True
    else:
        OCR_ENGINE_NAME = target_engine
        OCR_ENGINE_STATUS = f"Unavailable: {engine.status}"
        OCR_ENGINE_AVAILABLE = False
        logger.error(f"[OCR] CRITICAL: No OCR engine could be initialized ({OCR_ENGINE_STATUS})")

    return _ocr_engine


def get_ocr_diagnostics() -> Dict[str, Any]:
    """Retrieve runtime diagnostics for the active OCR engine."""
    global _ocr_engine, OCR_ENGINE_NAME, OCR_ENGINE_STATUS, OCR_ENGINE_VERSION, OCR_ENGINE_AVAILABLE
    if _ocr_engine is None:
        get_ocr_engine()
    return {
        "ocr_engine": OCR_ENGINE_NAME,
        "ocr_status": OCR_ENGINE_STATUS,
        "ocr_version": OCR_ENGINE_VERSION,
        "ocr_available": OCR_ENGINE_AVAILABLE,
    }


def load_ocr_engine():
    """Startup initialization helper."""
    return get_ocr_engine()


def run_ocr_on_crop(crop: np.ndarray) -> Dict[str, Any]:
    """
    Run OCR on a BGR plate crop.

    Returns:
    {
        "raw_ocr": str,
        "ocr_confidence": float,
        "success": bool,
        "error": str or None,
        "lines": list
    }
    """
    if crop is None or crop.size == 0:
        return {
            "raw_ocr": "",
            "ocr_confidence": 0.0,
            "success": True,
            "error": None,
            "lines": [],
        }

    engine = get_ocr_engine()
    if engine is None or engine.reader is None:
        return {
            "raw_ocr": "",
            "ocr_confidence": 0.0,
            "success": False,
            "error": f"OCR engine unavailable ({OCR_ENGINE_STATUS})",
            "lines": [],
        }

    t0 = time.perf_counter()
    try:
        result = engine.ocr(crop, cls=True)
        elapsed = time.perf_counter() - t0
        logger.debug(f"[OCR] Single crop OCR in {elapsed:.3f}s")

        if not result or result == [None] or not result[0]:
            return {
                "raw_ocr": "",
                "ocr_confidence": 0.0,
                "success": True,
                "error": None,
                "lines": [],
            }

        valid_lines = []
        for line in result[0]:
            if line is None:
                continue
            bbox_pts, (text, conf) = line
            text_str = text.strip() if text else ""
            if not text_str:
                continue
            # Ignore standalone IND badge marker box if separate from the plate text
            if text_str.upper() in ("IND", "IN", "INDIA"):
                continue
            valid_lines.append((bbox_pts, text_str, float(conf)))

        # Sort by vertical bucket (Y / 20px) then horizontal position (X)
        def get_box_sort_key(item):
            pts = item[0]
            if pts and len(pts) > 0:
                avg_y = sum(p[1] for p in pts) / len(pts)
                min_x = min(p[0] for p in pts)
                return (round(avg_y / 20.0), min_x)
            return (0, 0)

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
            "lines": valid_lines,
        }

    except Exception as e:
        logger.error(f"[OCR] Inference failed: {e}")
        return {
            "raw_ocr": "",
            "ocr_confidence": 0.0,
            "success": False,
            "error": str(e),
            "lines": [],
        }
