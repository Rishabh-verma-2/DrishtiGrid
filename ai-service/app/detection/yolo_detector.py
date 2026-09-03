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
    - License plates are horizontal rectangles (aspect ratio width/height usually 1.3 to 6.5).
    - Rejects square/tall patches like wheels, headlights, taillights, roof windows, legs.
    - Rejects micro-noise or full-image vehicle boxes.
    """
    if w <= 0 or h <= 0:
        return False

    aspect_ratio = w / float(h)

    # Standard license plates:
    # Single-line plates: ~3.0 to 5.5
    # Two-line / motorcycle plates: ~1.25 to 2.2
    # Anything < 1.15 is square or vertical (wheels, taillights, emblems, pedestrians)
    # Anything > 7.0 is an ultra-wide stripe (bumper lines, road lines)
    if aspect_ratio < 1.15 or aspect_ratio > 7.0:
        return False

    # Minimum dimensions in pixels
    if w < 28 or h < 10:
        return False

    # Maximum dimensions: plate should never occupy more than 85% width or 50% height
    if w > 0.85 * img_w or h > 0.50 * img_h:
        return False

    # Area filter
    area = w * h
    if area < 320:
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

    if not results or len(results) == 0:
        logger.info("No objects detected by YOLO.")
        return []

    result = results[0]
    boxes = result.boxes
    names = result.names or {}

    if boxes is None or len(boxes) == 0:
        logger.info("No bounding boxes found by YOLO.")
        return []

    img_h, img_w = image.shape[:2]
    raw_candidates = []

    # Check if model is a dedicated LP detector
    is_dedicated_lp_model = False
    if len(names) == 1:
        is_dedicated_lp_model = True
    elif any(lp in str(n).lower() for n in names.values()):
        is_dedicated_lp_model = True

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

        # Class name lookup
        class_name = ""
        if isinstance(names, dict):
            class_name = str(names.get(cls_id, names.get(str(cls_id), ""))).lower()
        elif isinstance(names, (list, tuple)) and 0 <= cls_id < len(names):
            class_name = str(names[cls_id]).lower()

        norm_name = class_name.replace("_", " ").replace("-", " ").strip()
        is_lp_class = any(lp in norm_name for lp in LP_CLASS_NAMES)
        is_vehicle_class = cls_id in VEHICLE_CLASS_IDS or any(v in norm_name for v in ("car", "truck", "bus", "motorcycle", "vehicle"))

        if is_dedicated_lp_model and not is_vehicle_class:
            is_lp_class = True

        if is_lp_class:
            # Check geometry: must be plate-shaped rectangle
            if not _is_valid_plate_geometry(w, h, img_w, img_h):
                logger.debug(f"Discarding box ({w}x{h}, conf={conf_val:.2f}) failed geometry check")
                continue

            crop = safe_crop(image, x1, y1, w, h, pad=4)
            if crop.size > 0:
                raw_candidates.append({
                    "box": (x1, y1, x2, y2),
                    "bbox": {"x": int(x1), "y": int(y1), "width": int(w), "height": int(h)},
                    "conf": conf_val,
                    "crop": crop,
                })

        elif is_vehicle_class and not is_dedicated_lp_model:
            # Fallback ONLY for generic COCO model: look for rectangular plate inside lower third
            plate_region_y = y1 + int(h * 0.60)
            pr_h = y2 - plate_region_y
            pr_w = w
            if pr_h <= 0 or pr_w <= 0:
                continue
            plate_region = image[plate_region_y:y2, x1:x2]
            if plate_region.size == 0:
                continue

            # DO NOT fallback to full vehicle region — only keep if actual plate rectangle is found
            heuristic_res = _heuristic_plate_region(plate_region, fallback_full=False)
            if heuristic_res is not None:
                lp_crop, (rx, ry, rw, rh) = heuristic_res
                abs_x1 = x1 + rx
                abs_y1 = plate_region_y + ry
                abs_x2 = abs_x1 + rw
                abs_y2 = abs_y1 + rh

                if _is_valid_plate_geometry(rw, rh, img_w, img_h) and lp_crop is not None and lp_crop.size > 0:
                    raw_candidates.append({
                        "box": (abs_x1, abs_y1, abs_x2, abs_y2),
                        "bbox": {"x": int(abs_x1), "y": int(abs_y1), "width": int(rw), "height": int(rh)},
                        "conf": conf_val * 0.85,
                        "crop": lp_crop,
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
        edges = cv2.Canny(blurred, 50, 150)
        contours, _ = cv2.findContours(
            edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        best = None
        best_area = 0
        for cnt in contours:
            rect = cv2.boundingRect(cnt)
            rx, ry, rw, rh = rect
            area = rw * rh
            aspect = rw / max(rh, 1)
            # Plate-like aspect ratio: 1.4 to 6.0
            if 1.4 < aspect < 6.0 and area > 0.05 * (w * h):
                if area > best_area:
                    best = rect
                    best_area = area

        if best is not None:
            rx, ry, rw, rh = best
            crop = safe_crop(region, rx, ry, rw, rh, pad=2)
            if crop.size > 0:
                return crop, (rx, ry, rw, rh)

        if fallback_full:
            return region.copy(), (0, 0, w, h)
    except Exception as e:
        logger.warning(f"Heuristic plate region failed: {e}")
        if fallback_full:
            return region.copy(), (0, 0, w, h)
    return None
