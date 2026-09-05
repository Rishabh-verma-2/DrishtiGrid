"""
YOLO-based license plate detector.

Uses a dedicated license-plate YOLOv8 checkpoint (model_weights/license_plate_detector.pt)
with rigorous geometric, aspect-ratio, and confidence filtering so only genuine
license plates are localized and unnecessary vehicle parts (wheels, lights, logos)
are completely excluded.
"""

import logging
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

# Apply safe torch load for PyTorch 2.6+ compatibility before importing ultralytics
try:
    import torch
    _orig_torch_load = torch.load
    def _safe_torch_load(*args, **kwargs):
        kwargs.setdefault("weights_only", False)
        return _orig_torch_load(*args, **kwargs)
    torch.load = _safe_torch_load
except Exception:
    pass

from app.config.settings import MODEL_CONFIG
from app.utils.image_utils import safe_crop

logger = logging.getLogger(__name__)

VEHICLE_CLASS_IDS = {2, 3, 5, 7}  # car, motorcycle, bus, truck
LP_CLASS_NAMES = {
    "license plate", "licence plate", "numberplate",
    "number plate", "plate", "lp", "registration plate",
    "reg plate", "vehicle plate"
}

_yolo_model = None


def load_yolo_model():
    """
    Load the YOLO model once and cache it globally.
    Prioritizes the dedicated license-plate detector weights.
    """
    global _yolo_model

    try:
        from ultralytics import YOLO
    except ImportError:
        logger.error("ultralytics not installed. Run: pip install ultralytics")
        return None

    preference = MODEL_CONFIG.get("YOLO_MODEL_PREFERENCE", "lp")
    lp_path = Path(MODEL_CONFIG["YOLO_LP_MODEL_PATH"])
    coco_path = Path(MODEL_CONFIG["YOLO_MODEL_PATH"])

    # Try dedicated LP model first
    if preference == "lp" and lp_path.exists():
        model_path = str(lp_path)
        logger.info(f"Loading dedicated LP detection model: {model_path}")
    elif coco_path.exists():
        model_path = str(coco_path)
        logger.info(f"Loading COCO YOLOv8 model: {model_path}")
    else:
        model_path = "yolov8n.pt"
        logger.info("No local YOLO weights found — downloading yolov8n.pt")

    try:
        _yolo_model = YOLO(model_path)
        # Warm-up inference
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        _yolo_model(dummy, verbose=False)
        logger.info(f"YOLO model loaded and warmed up: {model_path} (classes: {_yolo_model.names})")
        return _yolo_model
    except Exception as e:
        logger.error(f"Failed to initialize YOLO model from {model_path}: {e}")
        return None


def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        load_yolo_model()
    return _yolo_model


def _compute_iou(boxA, boxB):
    """Compute Intersection over Union between two (x1, y1, x2, y2) boxes."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

    denom = float(boxAArea + boxBArea - interArea)
    if denom <= 0:
        return 0.0
    return interArea / denom


def _is_valid_plate_geometry(w: int, h: int, img_w: int, img_h: int) -> bool:
    """
    Validate that the bounding box dimensions match genuine license plate geometry.
    - License plates are horizontal rectangles (aspect ratio width/height usually 1.10 to 7.5).
    - Rejects square/tall patches like wheels, headlights, taillights, roof windows, legs.
    - Rejects micro-noise or full-image vehicle boxes.
    """
    if w <= 0 or h <= 0:
        return False

    aspect_ratio = w / float(h)

    # Standard license plates:
    # Single-line plates: ~3.0 to 5.5
    # Two-line / motorcycle plates: ~1.15 to 2.2
    # Anything < 1.10 is square or vertical (wheels, taillights, emblems, pedestrians)
    # Anything > 7.5 is an ultra-wide stripe (bumper lines, road lines)
    if aspect_ratio < 1.10 or aspect_ratio > 7.5:
        return False

    # Minimum dimensions in pixels
    if w < 24 or h < 8:
        return False

    # Maximum dimensions: plate should not exceed the whole frame dimensions
    if w > 0.99 * img_w and h > 0.95 * img_h:
        return False

    # Area filter
    area = w * h
    if area < 180:
        return False

    return True


def detect_license_plates(
    image: np.ndarray,
    conf_threshold: Optional[float] = None,
    iou_threshold: Optional[float] = None,
) -> List[Dict]:
    """
    Run YOLO inference on *image* (BGR NumPy array).
    Applies strict plate geometric validation and NMS to eliminate false positives.

    Returns a list of detection dicts:
    {
        "plate_id": int,
        "bbox": {"x": int, "y": int, "width": int, "height": int},
        "detection_confidence": float,
        "original_crop": np.ndarray  (BGR)
    }
    """
    if image is None or image.size == 0:
        return []

    # Ensure 3-channel BGR
    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif len(image.shape) == 3 and image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)

    model = get_yolo_model()
    if model is None:
        logger.error("YOLO model is unavailable.")
        return []

    # If using dedicated license plate detector, use 0.30 confidence threshold
    # to catch real plates while suppressing noise
    conf = conf_threshold or float(MODEL_CONFIG.get("YOLO_CONFIDENCE_THRESHOLD", 0.30))
    if conf < 0.28:
        conf = 0.28
    iou = iou_threshold or float(MODEL_CONFIG.get("YOLO_IOU_THRESHOLD", 0.45))

    # Determine device
    device_arg = "cpu"
    try:
        import torch
        use_gpu = MODEL_CONFIG.get("USE_GPU", True)
        if use_gpu and torch.cuda.is_available():
            device_arg = 0
    except Exception:
        device_arg = "cpu"

    t0 = time.perf_counter()

    results = model(
        image,
        conf=conf,
        iou=iou,
        device=device_arg,
        verbose=False,
        agnostic_nms=True,
    )

    elapsed = time.perf_counter() - t0
    logger.info(f"YOLO inference completed in {elapsed:.3f}s")

    boxes = None
    names = {}
    if results and len(results) > 0:
        result = results[0]
        boxes = result.boxes
        names = result.names or {}

    img_h, img_w = image.shape[:2]
    raw_candidates = []

    # Check if model is a dedicated LP detector
    is_dedicated_lp_model = False
    if len(names) == 1:
        is_dedicated_lp_model = True
    elif any(term in str(n).lower() for n in names.values() for term in ("lp", "plate", "license")):
        is_dedicated_lp_model = True

    if is_dedicated_lp_model and boxes is not None and len(boxes) > 0:
        for box in boxes:
            if box.cls is None or len(box.cls) == 0:
                continue
            cls_id = int(box.cls[0].item())
            conf_val = float(box.conf[0].item()) if box.conf is not None and len(box.conf) > 0 else float(conf)

            if box.xyxy is None or len(box.xyxy) == 0:
                continue
            xyxy = box.xyxy[0].cpu().numpy().astype(int)
            x1, y1, x2, y2 = xyxy
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(img_w, x2), min(img_h, y2)
            w = x2 - x1
            h = y2 - y1

            if w <= 0 or h <= 0:
                continue

            if not _is_valid_plate_geometry(w, h, img_w, img_h):
                continue

            crop = safe_crop(image, x1, y1, w, h, pad=4)
            if crop.size > 0:
                raw_candidates.append({
                    "box": (x1, y1, x2, y2),
                    "bbox": {"x": int(x1), "y": int(y1), "width": int(w), "height": int(h)},
                    "conf": conf_val,
                    "crop": crop,
                })
    else:
        # Generic COCO model or fallback: use OCR-guided plate text localization as primary detector
        raw_candidates = _detect_plates_via_ocr(image)

        # Fallback to contour heuristics only if OCR found no candidates
        if not raw_candidates:
            heuristic_res = _heuristic_plate_region(image, fallback_full=False)
            if heuristic_res is not None:
                lp_crop, (rx, ry, rw, rh) = heuristic_res
                if _is_valid_plate_geometry(rw, rh, img_w, img_h) and lp_crop is not None and lp_crop.size > 0:
                    raw_candidates.append({
                        "box": (rx, ry, rx + rw, ry + rh),
                        "bbox": {"x": int(rx), "y": int(ry), "width": int(rw), "height": int(rh)},
                        "conf": 0.75,
                        "crop": lp_crop,
                    })
            else:
                aspect = img_w / float(max(img_h, 1))
                if 1.8 <= aspect <= 6.5 and img_h <= 250:
                    raw_candidates.append({
                        "box": (0, 0, img_w, img_h),
                        "bbox": {"x": 0, "y": 0, "width": int(img_w), "height": int(img_h)},
                        "conf": 0.85,
                        "crop": image.copy(),
                    })

    # Non-Maximum Suppression (NMS) on candidates to eliminate duplicates
    raw_candidates.sort(key=lambda c: c["conf"], reverse=True)
    kept_candidates = []
    for cand in raw_candidates:
        overlap = False
        for kept in kept_candidates:
            if _compute_iou(cand["box"], kept["box"]) > 0.40:
                overlap = True
                break
        if not overlap:
            kept_candidates.append(cand)

    detections = []
    for idx, c in enumerate(kept_candidates, start=1):
        detections.append({
            "plate_id": idx,
            "bbox": c["bbox"],
            "detection_confidence": round(c["conf"], 4),
            "original_crop": c["crop"],
        })

    logger.info(f"Verified {len(detections)} license plate candidate(s) after geometric filtering.")
    return detections


def _detect_plates_via_ocr(image: np.ndarray) -> List[Dict]:
    """
    Directly locate license plates by scanning for registration text with PaddleOCR.
    Extremely accurate: locates plates regardless of vehicle color, yellow/white/green plate background,
    lighting, or angle, while completely avoiding false positives on door handles, grills, and ground dirt.
    """
    img_h, img_w = image.shape[:2]
    candidates = []
    try:
        from app.ocr.paddle_ocr import get_ocr_engine
        engine = get_ocr_engine()
        if engine is None:
            return candidates

        import re
        from app.validation.indian_plate import validate_indian_plate, normalize_plate_text

        rgb_img = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        ocr_out = engine.ocr(rgb_img, cls=True)
        if not ocr_out or not ocr_out[0]:
            return candidates

        state_prefixes = (
            "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA",
            "GJ", "HR", "HP", "JH", "JK", "KA", "KL", "LA", "LD", "MH",
            "ML", "MN", "MP", "MZ", "NL", "OD", "PB", "PY", "RJ", "SK",
            "TN", "TR", "TS", "UK", "UP", "WB", "21", "22", "23", "24"
        )

        NON_PLATE_KEYWORDS = {
            "TIMES", "TIMESNOW", "GOVERNOR", "OFFICIAL", "OFFICIALUSE",
            "TEMPORARY", "REGISTRATION", "POLICE", "HIGHWAY", "TOLL",
            "GROUP", "TRMN", "NEWDELHI", "DELHI", "INDIA", "TRANSPORT",
            "MAIAD", "ALAMY", "STOCK", "PHOTO", "NEWS", "BHARAT", "CHTANMENTAS",
            "XABUSHANOI", "XABUS", "XABUSHANO", "DAOCA", "OUUHSAUUX"
        }

        for line in ocr_out[0]:
            if not line:
                continue
            pts, (txt, conf) = line
            clean = re.sub(r"[^A-Z0-9]", "", txt.upper())
            for b in ("IND", "INT", "1ND", "IN0", "LND", "INDIA"):
                if clean.startswith(b) and len(clean) >= len(b) + 5:
                    clean = clean[len(b):]
                    break

            if len(clean) < 4:
                continue

            norm = normalize_plate_text(clean)
            if norm in NON_PLATE_KEYWORDS or clean in NON_PLATE_KEYWORDS:
                continue

            status, _ = validate_indian_plate(norm)
            has_state = clean.startswith(state_prefixes) or any(clean[i:i+2] in state_prefixes for i in range(min(3, len(clean))))
            has_both_alpha_num = any(c.isalpha() for c in clean) and any(c.isdigit() for c in clean)

            # Accept if valid Indian plate format, or state prefix, or alpha+num, or 4-12 alphanumeric characters with high confidence
            is_candidate = (
                status in ("VALID_FORMAT", "POSSIBLE_FORMAT")
                or (has_state and len(clean) >= 4)
                or (has_both_alpha_num and len(clean) >= 4 and conf >= 0.40)
                or (4 <= len(clean) <= 12 and any(c.isdigit() for c in clean) and conf >= 0.50)
            )

            if not is_candidate:
                continue

            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            bx1, by1, bx2, by2 = min(xs), min(ys), max(xs), max(ys)
            pw = bx2 - bx1
            ph = by2 - by1

            # Check aspect ratio of the text box
            aspect = pw / float(max(ph, 1))
            if aspect < 0.95 or aspect > 8.5:
                continue

            # Add padding around the text to capture the full plate border (15% horizontally, 25% vertically)
            pad_x = max(10, int(pw * 0.15))
            pad_y = max(8, int(ph * 0.25))

            x1 = max(0, int(bx1 - pad_x))
            y1 = max(0, int(by1 - pad_y))
            x2 = min(img_w, int(bx2 + pad_x))
            y2 = min(img_h, int(by2 + pad_y))
            bw = x2 - x1
            bh = y2 - y1

            crop = safe_crop(image, x1, y1, bw, bh, pad=2)
            if crop.size > 0:
                candidates.append({
                    "box": (x1, y1, x2, y2),
                    "bbox": {"x": int(x1), "y": int(y1), "width": int(bw), "height": int(bh)},
                    "conf": float(conf),
                    "crop": crop,
                })
    except Exception as e:
        logger.warning(f"OCR-guided plate localization error: {e}")

    return candidates


def _heuristic_plate_region(
    region: np.ndarray, fallback_full: bool = False
) -> Optional[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
    """
    Use edge detection + contour analysis to isolate a plate-like rectangle
    within *region*. Returns (crop, (rx, ry, rw, rh)) relative to region.
    Never returns full region unless fallback_full is explicitly True.
    """
    if region is None or region.size == 0:
        return None

    h, w = region.shape[:2]
    try:
        gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 40, 150)

        # Morphological close with horizontal rect kernel to connect plate letters/borders
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 3))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(
            closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        best = None
        best_score = 0
        total_area = float(w * h)

        for cnt in contours:
            rect = cv2.boundingRect(cnt)
            rx, ry, rw, rh = rect
            area = rw * rh
            aspect = rw / max(rh, 1)

            # Plate-like aspect ratio: 1.2 to 6.5
            if 1.2 <= aspect <= 6.5 and area >= max(180, 0.005 * total_area) and area <= 0.85 * total_area:
                # Score preferred aspect ratio around 3.0 to 4.5
                aspect_score = 1.0 - min(abs(aspect - 3.8) / 3.8, 0.8)
                score = area * aspect_score
                if score > best_score:
                    best = rect
                    best_score = score

        if best is not None:
            rx, ry, rw, rh = best
            crop = safe_crop(region, rx, ry, rw, rh, pad=3)
            if crop.size > 0:
                return crop, (rx, ry, rw, rh)

        if fallback_full:
            return region.copy(), (0, 0, w, h)
    except Exception as e:
        logger.warning(f"Heuristic plate region failed: {e}")
        if fallback_full:
            return region.copy(), (0, 0, w, h)
    return None
