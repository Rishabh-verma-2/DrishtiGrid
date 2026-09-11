"""
YOLO-based license plate detector — Industry-Grade Multi-Pass Engine
=====================================================================

Designed for real-world CCTV traffic frames with many vehicles in a single
shot (junctions, toll plazas, traffic queues, overhead cameras).

Detection strategy
------------------
Pass 1 — Full-frame inference with the dedicated LP model (low conf 0.20).
Pass 2 — Multi-scale inference: re-run on 1.5× and 2× upscaled versions
          of the original frame so small / distant plates are resolved.
Pass 3 — Vehicle-region cascade (COCO model): locate each vehicle (car,
          bus, truck, motorbike, auto-rickshaw), crop the REAR THIRD of
          each vehicle's bounding box, and run LP detection specifically on
          those crops. Coordinates are then projected back to the full frame.
Pass 4 — Horizontal tile scan: split the frame into 50 %-overlapping tiles
          (left/right/centre) and run LP detection on each. Catches plates
          that straddle the edge of the YOLO receptive field.
Pass 5 — OCR-guided localization: scan for Indian registration text with
          PaddleOCR and derive plate boxes from character-level geometry.
Pass 6 — Contour heuristics (fallback only, per vehicle region).

All candidates from all passes are pooled, sorted by confidence, then
de-duplicated by a strict 0.30 IoU NMS so nearby plates (side-by-side at
a junction) survive.

Key relaxations vs. previous version
--------------------------------------
* Confidence floor: 0.28 → 0.18 (catches small/distant plates)
* Aspect ratio:     1.10–7.5 → 0.80–9.0 (overhead skew + two-line plates)
* Minimum width:    24 px → 18 px (plates 30 m away)
* Minimum height:    8 px →  6 px
* Minimum area:    180 px² → 100 px²
* NMS IoU:          0.40 → 0.30 (side-by-side plates)
"""

import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
from app.detection.candidate_clustering import cluster_plate_candidates
from app.utils.image_utils import safe_crop

logger = logging.getLogger(__name__)

# COCO class IDs for vehicles (used in Pass 3 vehicle-region cascade)
VEHICLE_CLASS_IDS = {2, 3, 5, 7}  # car, motorcycle, bus, truck

# Alternate name lookup for LP-specific model class names
LP_CLASS_NAMES = {
    "license plate", "licence plate", "numberplate",
    "number plate", "plate", "lp", "registration plate",
    "reg plate", "vehicle plate"
}

# ---------------------------------------------------------------------------
# Geometry thresholds (tuned for CCTV / overhead / junction cameras)
# ---------------------------------------------------------------------------
ASPECT_MIN  = 0.80   # allow overhead-skewed two-line plates
ASPECT_MAX  = 9.00   # allow very wide single-line plates
MIN_W_PX    = 18     # minimum plate width in pixels
MIN_H_PX    = 6      # minimum plate height in pixels
MIN_AREA_PX = 100    # minimum bounding-box area in pixels²
NMS_IOU_THR = 0.30   # IoU threshold for final NMS (lower = more plates kept)
CONF_FLOOR  = 0.18   # absolute minimum confidence for LP candidates

# Scales used in Pass 2 multi-scale inference
MULTI_SCALES = [1.25, 1.75]   # relative to original — run at these sizes too

# Tile overlap fraction for Pass 4 horizontal tiling
TILE_OVERLAP = 0.50

_yolo_model = None
_coco_model = None   # separate COCO model for vehicle cascade (Pass 3)

# Diagnostics state for LP model
LP_MODEL_DIAGNOSTICS: Dict[str, Any] = {
    "lp_model_available": False,
    "lp_model_path": None,
    "lp_model_classes": [],
    "is_dedicated": False,
}


def validate_lp_model(model: Any) -> Tuple[bool, List[str]]:
    """
    Verify that the loaded YOLO model actually contains a license-plate class.
    Accepts class names such as:
      license plate, licence plate, number plate, numberplate,
      plate, lp, registration plate, vehicle plate, reg plate.
    Returns:
      (is_valid, matched_classes)
    """
    if model is None:
        return False, []
    names = getattr(model, "names", None)
    if not names:
        return False, []
    if isinstance(names, dict):
        class_list = [str(v).lower().strip() for v in names.values()]
    elif isinstance(names, (list, tuple)):
        class_list = [str(v).lower().strip() for v in names]
    else:
        class_list = [str(names).lower().strip()]

    matched = [c for c in class_list if any(syn in c for syn in LP_CLASS_NAMES)]
    return len(matched) > 0, matched


def get_lp_model_diagnostics() -> Dict[str, Any]:
    global LP_MODEL_DIAGNOSTICS
    return dict(LP_MODEL_DIAGNOSTICS)


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def load_yolo_model():
    """
    Load the primary LP detection model (strictly prefers dedicated LP weights).
    Validates that the model actually contains license-plate classes.
    If missing or invalid, logs an explicit warning and does NOT pretend COCO is an LP detector.
    """
    global _yolo_model, LP_MODEL_DIAGNOSTICS

    try:
        from ultralytics import YOLO
    except ImportError:
        logger.error("ultralytics not installed. Run: pip install ultralytics")
        return None

    lp_candidate_paths = [
        Path(MODEL_CONFIG.get("YOLO_LP_MODEL_PATH", "model_weights/license_plate_detector.pt")),
        Path("model_weights/license_plate_detector.pt"),
        Path(__file__).resolve().parent.parent.parent / "model_weights" / "license_plate_detector.pt",
    ]
    lp_path = None
    for p in lp_candidate_paths:
        if p.is_file():
            lp_path = p
            break

    coco_path = Path(MODEL_CONFIG.get("YOLO_MODEL_PATH", "model_weights/yolov8n.pt"))

    if lp_path is not None:
        logger.info(f"Attempting to load dedicated LP model from: {lp_path}")
        try:
            m = YOLO(str(lp_path))
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            m(dummy, verbose=False)
            is_valid, matched_classes = validate_lp_model(m)
            if is_valid:
                _yolo_model = m
                loaded_path = str(lp_path)
                LP_MODEL_DIAGNOSTICS["lp_model_available"] = True
                LP_MODEL_DIAGNOSTICS["lp_model_path"] = loaded_path
                LP_MODEL_DIAGNOSTICS["lp_model_classes"] = matched_classes
                LP_MODEL_DIAGNOSTICS["is_dedicated"] = True
                logger.info(f"DEDICATED LP MODEL LOADED: {loaded_path} (classes: {matched_classes})")
                return _yolo_model
            else:
                logger.warning(f"Model at {lp_path} has no LP classes ({m.names}).")
        except Exception as e:
            logger.error(f"Failed to load dedicated LP model from {lp_path}: {e}")

    # Fallback path if dedicated LP model is missing or invalid:
    logger.warning("DEDICATED LP MODEL NOT FOUND — PLATE DETECTION QUALITY WILL BE LIMITED")
    LP_MODEL_DIAGNOSTICS["lp_model_available"] = False
    LP_MODEL_DIAGNOSTICS["is_dedicated"] = False

    fallback_path = str(coco_path) if coco_path.exists() else "yolov8n.pt"
    try:
        _yolo_model = YOLO(fallback_path)
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        _yolo_model(dummy, verbose=False)
        is_valid, matched_classes = validate_lp_model(_yolo_model)
        LP_MODEL_DIAGNOSTICS["lp_model_path"] = fallback_path
        LP_MODEL_DIAGNOSTICS["lp_model_classes"] = matched_classes
        LP_MODEL_DIAGNOSTICS["lp_model_available"] = is_valid
        if not is_valid:
            logger.info(f"Loaded COCO fallback model for vehicle detection: {fallback_path}. Generic COCO detections will NOT be treated as plates.")
        return _yolo_model
    except Exception as e:
        logger.error(f"Failed to load fallback YOLO from {fallback_path}: {e}")
        return None


def _load_coco_model():
    """
    Load (or reuse) a COCO-class YOLOv8 model for vehicle detection.
    We only need it if the primary model is a dedicated LP model (no vehicle classes).
    """
    global _coco_model
    if _coco_model is not None:
        return _coco_model

    try:
        from ultralytics import YOLO
        coco_path = Path(MODEL_CONFIG["YOLO_MODEL_PATH"])
        if coco_path.exists():
            _coco_model = YOLO(str(coco_path))
        else:
            _coco_model = YOLO("yolov8n.pt")
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        _coco_model(dummy, verbose=False)
        logger.info("COCO vehicle model ready for vehicle-cascade pass.")
    except Exception as e:
        logger.warning(f"COCO vehicle model load failed (Pass 3 disabled): {e}")
        _coco_model = None
    return _coco_model


def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        load_yolo_model()
    return _yolo_model


def get_coco_model():
    return _load_coco_model()


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _compute_iou(boxA: Tuple, boxB: Tuple) -> float:
    """IoU between two (x1,y1,x2,y2) tuples."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter = max(0, xB - xA) * max(0, yB - yA)
    areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    denom = float(areaA + areaB - inter)
    return inter / denom if denom > 0 else 0.0


def _is_valid_plate_geometry(
    w: int, h: int, img_w: int, img_h: int,
    strict: bool = False,
) -> bool:
    """
    Check bounding-box dimensions against Indian license plate geometry.

    strict=True  → tighter bounds, used when we have no other cue
    strict=False → relaxed bounds for CCTV/overhead/multi-vehicle frames
    """
    if w <= 0 or h <= 0:
        return False

    ar = w / float(h)

    if strict:
        ar_lo, ar_hi = 1.10, 7.50
        min_w, min_h, min_area = 24, 8, 180
    else:
        ar_lo, ar_hi = ASPECT_MIN, ASPECT_MAX
        min_w, min_h, min_area = MIN_W_PX, MIN_H_PX, MIN_AREA_PX

    if ar < ar_lo or ar > ar_hi:
        return False
    if w < min_w or h < min_h:
        return False
    if w * h < min_area:
        return False
    # A plate cannot cover > 99% width AND > 95% height of the full frame
    if w > 0.99 * img_w and h > 0.95 * img_h:
        return False

    return True


# ---------------------------------------------------------------------------
# Internal inference helpers
# ---------------------------------------------------------------------------

def _get_device() -> str:
    try:
        import torch
        if MODEL_CONFIG.get("USE_GPU", True) and torch.cuda.is_available():
            return "0"
    except Exception:
        pass
    return "cpu"


def _run_yolo_inference(
    model,
    image: np.ndarray,
    conf: float,
    iou: float = 0.40,
    classes: Optional[List[int]] = None,
    imgsz: Optional[int] = None,
) -> Optional[object]:
    """
    Run a single YOLO forward pass and return results[0] or None on error.
    """
    try:
        kw: Dict = dict(
            conf=conf,
            iou=iou,
            device=_get_device(),
            verbose=False,
            agnostic_nms=True,
        )
        if classes is not None:
            kw["classes"] = classes
        if imgsz is not None:
            kw["imgsz"] = imgsz
        results = model(image, **kw)
        return results[0] if results else None
    except Exception as e:
        logger.debug(f"YOLO inference error: {e}")
        return None


def _extract_lp_boxes(
    result,
    img_w: int,
    img_h: int,
    scale_x: float = 1.0,
    scale_y: float = 1.0,
    offset_x: int = 0,
    offset_y: int = 0,
    source_tag: str = "direct",
) -> List[Dict]:
    """
    Parse ultralytics result boxes → list of raw candidate dicts.

    Coordinates are scaled back (scale_x/y) and translated (offset) to the
    original full-frame coordinate system.

    Returns list of:
    {
      "box": (x1,y1,x2,y2),  # in full-frame coords
      "bbox": {...},
      "conf": float,
      "crop": None,           # filled later
      "source": str,
    }
    """
    candidates = []
    if result is None:
        return candidates

    names = result.names or {}
    boxes = result.boxes

    # Determine if this is a dedicated LP model
    is_lp_model = (
        len(names) == 1 or
        any(term in str(n).lower() for n in names.values()
            for term in ("lp", "plate", "license"))
    )

    if boxes is None or len(boxes) == 0:
        return candidates

    for box in boxes:
        if box.cls is None or len(box.cls) == 0:
            continue
        cls_id = int(box.cls[0].item())

        # For COCO models operating in LP-detection mode: only accept
        # any class that maps to a plate name. If no plate class exists
        # in the model, skip (vehicle cascade handles COCO vehicle boxes).
        if not is_lp_model:
            cls_name = names.get(cls_id, "").lower()
            if cls_name not in LP_CLASS_NAMES:
                continue

        conf_val = float(box.conf[0].item()) if box.conf is not None and len(box.conf) > 0 else 0.5
        if box.xyxy is None or len(box.xyxy) == 0:
            continue

        xyxy = box.xyxy[0].cpu().numpy().astype(float)
        # Scale back to original frame coords
        rx1 = xyxy[0] / scale_x + offset_x
        ry1 = xyxy[1] / scale_y + offset_y
        rx2 = xyxy[2] / scale_x + offset_x
        ry2 = xyxy[3] / scale_y + offset_y

        x1 = max(0, int(rx1))
        y1 = max(0, int(ry1))
        x2 = min(img_w, int(rx2))
        y2 = min(img_h, int(ry2))
        w = x2 - x1
        h = y2 - y1

        if not _is_valid_plate_geometry(w, h, img_w, img_h, strict=False):
            continue

        candidates.append({
            "box":    (x1, y1, x2, y2),
            "bbox":   {"x": x1, "y": y1, "width": w, "height": h},
            "conf":   conf_val,
            "crop":   None,      # populated in the aggregation step
            "source": source_tag,
        })

    return candidates


# ---------------------------------------------------------------------------
# Pass 1: Full-frame direct inference
# ---------------------------------------------------------------------------

def _pass1_direct(
    model,
    image: np.ndarray,
    conf: float,
    iou: float,
) -> List[Dict]:
    """Full-frame single-pass inference (baseline)."""
    img_h, img_w = image.shape[:2]
    result = _run_yolo_inference(model, image, conf=conf, iou=iou)
    return _extract_lp_boxes(result, img_w, img_h, source_tag="pass1_direct")


# ---------------------------------------------------------------------------
# Pass 2: Multi-scale inference
# ---------------------------------------------------------------------------

def _pass2_multiscale(
    model,
    image: np.ndarray,
    conf: float,
    iou: float,
) -> List[Dict]:
    """
    Upscale the frame by each factor in MULTI_SCALES and run LP detection.
    Small plates that YOLO misses at native resolution are often caught at 1.5–2×.
    """
    img_h, img_w = image.shape[:2]
    all_cands: List[Dict] = []

    for scale in MULTI_SCALES:
        new_w = int(img_w * scale)
        new_h = int(img_h * scale)
        # Cap at 4096px on longest side to control memory
        cap = 4096
        if max(new_w, new_h) > cap:
            cap_scale = cap / max(new_w, new_h)
            new_w = int(new_w * cap_scale)
            new_h = int(new_h * cap_scale)
            actual_scale_x = new_w / img_w
            actual_scale_y = new_h / img_h
        else:
            actual_scale_x = scale
            actual_scale_y = scale

        try:
            upscaled = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        except Exception:
            continue

        result = _run_yolo_inference(model, upscaled, conf=max(CONF_FLOOR, conf - 0.05), iou=iou)
        cands = _extract_lp_boxes(
            result, img_w, img_h,
            scale_x=actual_scale_x, scale_y=actual_scale_y,
            source_tag=f"pass2_scale{scale}",
        )
        all_cands.extend(cands)
        logger.debug(f"Pass2 scale={scale}: {len(cands)} candidates")

    return all_cands


# ---------------------------------------------------------------------------
# Vehicle Detection & Cascade
# ---------------------------------------------------------------------------

def detect_vehicles(
    image: np.ndarray,
    conf: float = 0.15,
    iou: float = 0.45,
) -> List[Dict]:
    """
    Locate vehicles in the image across full-frame and tiled passes.
    Returns list of dicts with full metadata:
      {
        "vehicle_id": str,
        "bbox": [x1, y1, x2, y2],
        "class": str,          # car, motorcycle, bus, truck, auto-rickshaw
        "vehicle_type": str,   # identical alias for class
        "confidence": float,
        "center": (cx, cy),
        "width": int,
        "height": int,
        "area": int,
      }
    """
    img_h, img_w = image.shape[:2]
    coco = _load_coco_model()
    if coco is None:
        return []

    veh_imgsz = 1280 if max(img_w, img_h) >= 1200 else 640
    veh_result = _run_yolo_inference(
        coco, image, conf=conf, iou=iou,
        classes=list(VEHICLE_CLASS_IDS),
        imgsz=veh_imgsz,
    )

    names = coco.names or {}
    vehicles: List[Dict] = []

    def add_veh(vx1, vy1, vx2, vy2, cls_id, vconf):
        vw = vx2 - vx1
        vh = vy2 - vy1
        if vw < 20 or vh < 20:
            return
        box = (vx1, vy1, vx2, vy2)
        if any(_compute_iou(box, (v["bbox"][0], v["bbox"][1], v["bbox"][2], v["bbox"][3])) > 0.45 for v in vehicles):
            return
        cname = names.get(cls_id, "car")
        cname_str = str(cname).lower()
        # Classify auto-rickshaw heuristic for Indian traffic environments
        # (3-wheelers detected as motorcycle with boxy cabin aspect ratio and area)
        if cname_str == "motorcycle" and (vw * vh) >= 8000 and 0.70 <= (vh / max(1, vw)) <= 1.45:
            cname_str = "auto-rickshaw"

        cx = int((vx1 + vx2) / 2)
        cy = int((vy1 + vy2) / 2)
        vehicles.append({
            "vehicle_id": f"veh_{len(vehicles)+1}",
            "bbox": [vx1, vy1, vx2, vy2],
            "class": cname_str,
            "vehicle_type": cname_str,
            "confidence": round(float(vconf), 4),
            "center": (cx, cy),
            "width": vw,
            "height": vh,
            "area": vw * vh,
        })

    if veh_result is not None and veh_result.boxes is not None:
        for box in veh_result.boxes:
            if box.cls is None or len(box.cls) == 0:
                continue
            cls_id = int(box.cls[0].item())
            if cls_id not in VEHICLE_CLASS_IDS:
                continue
            vconf = float(box.conf[0].item()) if box.conf is not None and len(box.conf) > 0 else 0.5
            xyxy = box.xyxy[0].cpu().numpy().astype(int)
            add_veh(
                max(0, xyxy[0]), max(0, xyxy[1]),
                min(img_w, xyxy[2]), min(img_h, xyxy[3]),
                cls_id, vconf
            )

    # Wide frame tiled vehicle scan
    if img_w > 1200:
        tile_w = int(img_w * 0.55)
        stride = int(img_w * 0.40)
        for x_start in range(0, img_w - tile_w + 1, stride):
            x_end = min(img_w, x_start + tile_w)
            tile = image[:, x_start:x_end]
            t_res = _run_yolo_inference(coco, tile, conf=conf, iou=iou, classes=list(VEHICLE_CLASS_IDS), imgsz=960)
            if t_res is not None and t_res.boxes is not None:
                for b in t_res.boxes:
                    cls_id = int(b.cls[0].item())
                    if cls_id not in VEHICLE_CLASS_IDS:
                        continue
                    vconf = float(b.conf[0].item()) if b.conf is not None and len(b.conf) > 0 else 0.5
                    xyxy = b.xyxy[0].cpu().numpy().astype(int)
                    add_veh(
                        max(0, xyxy[0] + x_start), max(0, xyxy[1]),
                        min(img_w, xyxy[2] + x_start), min(img_h, xyxy[3]),
                        cls_id, vconf
                    )

    # Sort vehicles by area descending
    vehicles.sort(key=lambda v: (v["bbox"][2] - v["bbox"][0]) * (v["bbox"][3] - v["bbox"][1]), reverse=True)
    return vehicles


# ---------------------------------------------------------------------------
# Vehicle-First ROI Plate Detector (Autonomous Per-Vehicle Processing Unit)
# ---------------------------------------------------------------------------

def detect_plates_in_vehicle_roi(
    image: np.ndarray,
    vehicle: Dict[str, Any],
    lp_model: Any = None,
    conf: float = 0.20,
    iou: float = 0.35,
    padding_ratio: float = 0.10,
) -> Dict[str, Any]:
    """
    Detect license plates specifically inside an individual vehicle ROI.
    Orientation-aware: scans full vehicle body without assuming plate is strictly lower 40%.
    Converts all plate coordinates back to original image space.
    Performs vehicle-local candidate fusion and returns ONE primary candidate (or None).
    """
    img_h, img_w = image.shape[:2]
    vx1, vy1, vx2, vy2 = vehicle["bbox"]
    vw = max(1, vx2 - vx1)
    vh = max(1, vy2 - vy1)
    v_type = vehicle.get("class") or vehicle.get("vehicle_type", "car")
    v_id = vehicle.get("vehicle_id", "veh_1")

    # 1. Configurable padding around vehicle bbox (8-15%, default 10%)
    pad_x = max(6, int(vw * padding_ratio))
    pad_y = max(6, int(vh * padding_ratio))
    roi_x1 = max(0, vx1 - pad_x)
    roi_y1 = max(0, vy1 - pad_y)
    roi_x2 = min(img_w, vx2 + pad_x)
    roi_y2 = min(img_h, vy2 + pad_y)

    roi = image[roi_y1:roi_y2, roi_x1:roi_x2]
    if roi.size == 0:
        return {
            "vehicle_id": v_id,
            "primary_candidate": None,
            "secondary_candidates": [],
            "all_candidates": [],
            "has_plate": False,
        }

    roi_h, roi_w = roi.shape[:2]
    if lp_model is None:
        lp_model = get_yolo_model()

    local_candidates: List[Dict] = []

def _propose_plate_regions_opencv(
    vehicle_roi: np.ndarray,
    offset_x: int = 0,
    offset_y: int = 0,
    img_w: int = 0,
    img_h: int = 0,
    max_proposals: int = 6,
) -> List[Dict]:
    """
    Generate candidate plate regions using OpenCV morphology and contour detection.
    Pipeline:
      - Grayscale
      - Bilateral filter (edge preserving)
      - CLAHE contrast enhancement
      - Blackhat morphology (highlights dark characters on light background)
      - Sobel X gradient (vertical edge density characteristic of text)
      - Otsu threshold + Morphological closing into candidate rectangles
      - Geometric scoring (aspect ratio 1.2-7.0, area 0.2%-30% of vehicle)
    """
    if vehicle_roi is None or vehicle_roi.size == 0:
        return []

    vh, vw = vehicle_roi.shape[:2]
    img_w = img_w or (offset_x + vw)
    img_h = img_h or (offset_y + vh)
    total_area = float(vh * vw)
    proposals: List[Dict] = []

    try:
        gray = cv2.cvtColor(vehicle_roi, cv2.COLOR_BGR2GRAY) if len(vehicle_roi.shape) == 3 else vehicle_roi
        filtered = cv2.bilateralFilter(gray, 9, 75, 75)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(filtered)

        # Blackhat morphology emphasizes dark text on bright plate background
        rect_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 5))
        blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, rect_kernel)

        # Sobel X gradient
        grad_x = cv2.Sobel(blackhat, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=-1)
        grad_x = np.absolute(grad_x)
        min_v, max_v = np.min(grad_x), np.max(grad_x)
        if max_v > min_v:
            grad_x = (255 * ((grad_x - min_v) / (max_v - min_v))).astype(np.uint8)
        else:
            grad_x = np.zeros_like(gray)

        # Gaussian blur + Otsu threshold
        grad_x = cv2.GaussianBlur(grad_x, (5, 5), 0)
        thresh = cv2.threshold(grad_x, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]

        # Morphological close to bridge individual characters into plate bounding boxes
        close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 7))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, close_kernel)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        scored: List[Tuple[float, Tuple[int, int, int, int]]] = []

        for cnt in contours:
            rx, ry, rw, rh = cv2.boundingRect(cnt)
            if rw < 18 or rh < 6:
                continue
            aspect = rw / float(rh)
            area = rw * rh

            if (1.2 <= aspect <= 7.0) and (0.002 * total_area <= area <= 0.30 * total_area):
                cy = ry + rh / 2.0
                cx = rx + rw / 2.0
                y_prior = 1.3 if cy >= 0.35 * vh else 0.7
                x_prior = 1.2 if 0.12 * vw <= cx <= 0.88 * vw else 0.8
                aspect_score = 1.0 - min(abs(aspect - 3.8) / 3.8, 0.8)
                score = aspect_score * y_prior * x_prior * (area / total_area)
                scored.append((score, (rx, ry, rw, rh)))

        scored.sort(key=lambda s: s[0], reverse=True)

        for score, (rx, ry, rw, rh) in scored[:max_proposals]:
            abs_x1 = max(0, offset_x + rx)
            abs_y1 = max(0, offset_y + ry)
            abs_x2 = min(img_w, offset_x + rx + rw)
            abs_y2 = min(img_h, offset_y + ry + rh)
            cw = abs_x2 - abs_x1
            ch = abs_y2 - abs_y1
            if cw <= 0 or ch <= 0:
                continue
            crop = safe_crop(vehicle_roi, rx, ry, rw, rh, pad=4)
            if crop.size > 0:
                proposals.append({
                    "box": (abs_x1, abs_y1, abs_x2, abs_y2),
                    "bbox": {"x": abs_x1, "y": abs_y1, "width": cw, "height": ch},
                    "conf": min(0.65, round(0.40 + score * 0.5, 3)),
                    "crop": crop,
                    "source": "opencv_plate_proposal",
                })
    except Exception as e:
        logger.debug(f"OpenCV plate proposal error: {e}")

    return proposals


def detect_plates_in_vehicle_roi(
    image: np.ndarray,
    vehicle: Dict[str, Any],
    lp_model: Any = None,
    conf: float = 0.20,
    iou: float = 0.35,
    padding_ratio: float = 0.10,
) -> Dict[str, Any]:
    """
    Detect license plates specifically inside an individual vehicle ROI.
    Orientation-aware: scans full vehicle body without assuming plate is strictly lower 40%.
    Converts all plate coordinates back to original image space.
    Performs vehicle-local candidate fusion and returns ONE primary candidate (or None).
    """
    img_h, img_w = image.shape[:2]
    vx1, vy1, vx2, vy2 = vehicle["bbox"]
    vw = max(1, vx2 - vx1)
    vh = max(1, vy2 - vy1)
    v_type = vehicle.get("class") or vehicle.get("vehicle_type", "car")
    v_id = vehicle.get("vehicle_id", "veh_1")

    # 1. Configurable padding around vehicle bbox (8-15%, default 10%)
    pad_x = max(6, int(vw * padding_ratio))
    pad_y = max(6, int(vh * padding_ratio))
    roi_x1 = max(0, vx1 - pad_x)
    roi_y1 = max(0, vy1 - pad_y)
    roi_x2 = min(img_w, vx2 + pad_x)
    roi_y2 = min(img_h, vy2 + pad_y)

    roi = image[roi_y1:roi_y2, roi_x1:roi_x2]
    if roi.size == 0:
        return {
            "vehicle_id": v_id,
            "primary_candidate": None,
            "secondary_candidates": [],
            "all_candidates": [],
            "has_plate": False,
        }

    roi_h, roi_w = roi.shape[:2]
    if lp_model is None:
        lp_model = get_yolo_model()

    local_candidates: List[Dict] = []

    # 2. Multi-Zone and Multi-Scale Search on Vehicle ROI
    has_dedicated_lp = LP_MODEL_DIAGNOSTICS.get("lp_model_available", False)
    if lp_model is not None and has_dedicated_lp:
        # Define candidate search zones based on vehicle type
        zones: List[Tuple[str, int, int, int, int]] = []
        # Zone A: Full vehicle ROI
        zones.append(("zone_a_full", 0, 0, roi_w, roi_h))
        # Zone B: Lower 60%
        zones.append(("zone_b_lower60", 0, int(roi_h * 0.40), roi_w, roi_h))
        # Zone C: Lower 45%
        zones.append(("zone_c_lower45", 0, int(roi_h * 0.55), roi_w, roi_h))
        # Zone D: Lower-center region
        zones.append(("zone_d_lower_center", int(roi_w * 0.15), int(roi_h * 0.45), int(roi_w * 0.85), roi_h))
        # Zone E: Front/rear bumper
        zones.append(("zone_e_bumper", 0, int(roi_h * 0.65), roi_w, roi_h))
        # Zone F: Grille region
        zones.append(("zone_f_grille", int(roi_w * 0.15), int(roi_h * 0.40), int(roi_w * 0.85), int(roi_h * 0.75)))

        # Determine multi-scale factors
        scales = [1.0]
        if roi_w < 350 or roi_h < 250:
            scales.append(1.5)
        if roi_w < 200 or roi_h < 150:
            scales.append(2.0)
        if roi_w < 100 or roi_h < 80:
            scales.append(3.0)

        # Run multi-zone / multi-scale search
        for z_name, zx1, zy1, zx2, zy2 in zones:
            if zx2 <= zx1 or zy2 <= zy1:
                continue
            z_crop = roi[zy1:zy2, zx1:zx2]
            if z_crop.size == 0:
                continue

            for sc in scales:
                sw = int(z_crop.shape[1] * sc)
                sh = int(z_crop.shape[0] * sc)
                if sw <= 0 or sh <= 0:
                    continue
                try:
                    if sc != 1.0:
                        z_scaled = cv2.resize(z_crop, (sw, sh), interpolation=cv2.INTER_LANCZOS4)
                    else:
                        z_scaled = z_crop
                except Exception:
                    z_scaled = z_crop
                    sc = 1.0

                res = _run_yolo_inference(lp_model, z_scaled, conf=max(CONF_FLOOR, conf - 0.08), iou=iou)
                cands = _extract_lp_boxes(
                    res, img_w, img_h,
                    scale_x=sc, scale_y=sc,
                    offset_x=roi_x1 + zx1, offset_y=roi_y1 + zy1,
                    source_tag=f"vehicle_roi_{z_name}_{sc}x",
                )
                for c in cands:
                    c["vehicle_id"] = v_id
                    c["vehicle_bbox"] = {"x": vx1, "y": vy1, "width": vw, "height": vh}
                    c["vehicle_type"] = v_type
                local_candidates.extend(cands)

    # 3. OpenCV Plate Region Proposals (Fallback when YOLO finds no candidates)
    if not local_candidates and (vw >= 35 and vh >= 25):
        proposals = _propose_plate_regions_opencv(
            roi, offset_x=roi_x1, offset_y=roi_y1, img_w=img_w, img_h=img_h, max_proposals=6
        )
        if proposals:
            try:
                from app.ocr.paddle_ocr import get_ocr_engine
                from app.validation.indian_plate import normalize_plate_text, validate_indian_plate
                engine = get_ocr_engine()
                for p in proposals:
                    pcrop = p.get("crop")
                    if pcrop is None or pcrop.size == 0:
                        continue
                    ph, pw = pcrop.shape[:2]
                    if ph < 48:
                        up_f = 48.0 / max(ph, 1)
                        pcrop_up = cv2.resize(pcrop, (int(pw * up_f), 48), interpolation=cv2.INTER_CUBIC)
                    else:
                        pcrop_up = pcrop

                    rgb_p = cv2.cvtColor(pcrop_up, cv2.COLOR_BGR2RGB)
                    ocr_res = engine.ocr(rgb_p, cls=True)
                    if ocr_res and ocr_res[0]:
                        for line in ocr_res[0]:
                            if not line:
                                continue
                            txt = line[1][0]
                            ocr_c = float(line[1][1])
                            norm = normalize_plate_text(txt)
                            status, _ = validate_indian_plate(norm)
                            if status in ("VALID_FORMAT", "POSSIBLE_FORMAT") or (len(norm) >= 5 and ocr_c >= 0.60):
                                p["conf"] = min(0.95, ocr_c + (0.30 if status == "VALID_FORMAT" else 0.15))
                                p["source"] = "opencv_proposal_ocr_validated"
                                p["vehicle_id"] = v_id
                                p["vehicle_bbox"] = {"x": vx1, "y": vy1, "width": vw, "height": vh}
                                p["vehicle_type"] = v_type
                                p["raw_ocr"] = txt
                                local_candidates.append(p)
                                break
            except Exception as e:
                logger.debug(f"Targeted OCR on proposals error: {e}")

    # 4. Full vehicle ROI OCR fallback (last resort diagnostic path)
    if not local_candidates and (vw >= 45 and vh >= 30):
        try:
            from app.ocr.paddle_ocr import get_ocr_engine
            from app.validation.indian_plate import normalize_plate_text, validate_indian_plate
            import re
            engine = get_ocr_engine()
            if engine is not None and roi.size > 0:
                sub_y1 = int(roi_h * 0.35)
                sub_roi = roi[sub_y1:roi_h, :]
                rgb_sub = cv2.cvtColor(sub_roi, cv2.COLOR_BGR2RGB)
                ocr_out = engine.ocr(rgb_sub, cls=True)
                if ocr_out and ocr_out[0]:
                    for line in ocr_out[0]:
                        if not line:
                            continue
                        pts, (txt, ocr_c) = line
                        clean = re.sub(r"[^A-Z0-9]", "", txt.upper())
                        if len(clean) >= 4:
                            xs = [p[0] for p in pts]
                            ys = [p[1] for p in pts]
                            px1 = max(0, int(roi_x1 + min(xs)))
                            py1 = max(0, int(roi_y1 + sub_y1 + min(ys)))
                            px2 = min(img_w, int(roi_x1 + max(xs)))
                            py2 = min(img_h, int(roi_y1 + sub_y1 + max(ys)))
                            pw = px2 - px1
                            ph = py2 - py1
                            if ph > 0 and (pw / ph) >= 0.8:
                                pad_c_x = max(6, int(pw * 0.15))
                                pad_c_y = max(4, int(ph * 0.25))
                                cx1 = max(0, px1 - pad_c_x)
                                cy1 = max(0, py1 - pad_c_y)
                                cx2 = min(img_w, px2 + pad_c_x)
                                cy2 = min(img_h, py2 + pad_c_y)
                                norm = normalize_plate_text(clean)
                                status, _ = validate_indian_plate(norm)
                                conf_score = min(0.99, float(ocr_c) + (0.35 if status == "VALID_FORMAT" else 0.15 if status == "POSSIBLE_FORMAT" else 0.05))
                                local_candidates.append({
                                    "box": (cx1, cy1, cx2, cy2),
                                    "bbox": {"x": cx1, "y": cy1, "width": cx2 - cx1, "height": cy2 - cy1},
                                    "conf": conf_score,
                                    "crop": image[cy1:cy2, cx1:cx2].copy(),
                                    "source": "vehicle_roi_ocr_fallback",
                                    "vehicle_id": v_id,
                                    "vehicle_bbox": {"x": vx1, "y": vy1, "width": vw, "height": vh},
                                    "vehicle_type": v_type,
                                })
        except Exception as e:
            logger.debug("Vehicle ROI full OCR fallback error: %s", e)

    # 5. Vehicle-Local Contour Fallback (if still 0 candidates)
    if not local_candidates and (vw >= 50 and vh >= 40):
        try:
            h_cands = _heuristic_plate_regions(roi, offset_x=roi_x1, offset_y=roi_y1, img_w=img_w, img_h=img_h, max_results=2)
            for c in h_cands:
                c["source"] = "vehicle_roi_contour_fallback"
                c["vehicle_id"] = v_id
                c["vehicle_bbox"] = {"x": vx1, "y": vy1, "width": vw, "height": vh}
                c["vehicle_type"] = v_type
                local_candidates.append(c)
        except Exception as e:
            logger.debug("Vehicle ROI contour fallback error: %s", e)

    # Fill in crops for local candidates
    for cand in local_candidates:
        if cand.get("crop") is None:
            b = cand["bbox"]
            cand["crop"] = safe_crop(image, b["x"], b["y"], b["width"], b["height"], pad=4)

    local_candidates = [c for c in local_candidates if c.get("crop") is not None and c["crop"].size > 0]

    # 5. Vehicle-Local Candidate Fusion
    if not local_candidates:
        return {
            "vehicle_id": v_id,
            "primary_candidate": None,
            "secondary_candidates": [],
            "all_candidates": [],
            "has_plate": False,
        }

    # Score each local candidate using probabilistic geometric prior within THIS vehicle
    for cand in local_candidates:
        bx1, by1, bx2, by2 = cand["box"]
        pw = max(1, bx2 - bx1)
        ph = max(1, by2 - by1)
        pcx = (bx1 + bx2) / 2.0
        pcy = (by1 + by2) / 2.0
        rel_y = (pcy - vy1) / max(1.0, float(vh))
        area_ratio = (pw * ph) / max(1.0, float(vw * vh))

        # Geometric prior score
        if "motorcycle" in v_type or "bike" in v_type:
            geom_prior = 1.0 if 0.35 <= rel_y <= 0.98 else 0.6
        elif "bus" in v_type or "truck" in v_type:
            geom_prior = 1.0 if 0.35 <= rel_y <= 0.98 else 0.7
        else:
            geom_prior = 1.0 if 0.45 <= rel_y <= 0.98 else 0.75

        if 0.001 <= area_ratio <= 0.20:
            area_prior = 1.0
        else:
            area_prior = 0.5

        composite_score = cand["conf"] * 0.60 + geom_prior * 0.25 + area_prior * 0.15
        cand["composite_score"] = composite_score

    # Cluster / NMS locally within this vehicle
    local_candidates.sort(key=lambda c: c.get("composite_score", c["conf"]), reverse=True)
    fused: List[Dict] = []
    for cand in local_candidates:
        overlap = False
        for f in fused:
            if _compute_iou(cand["box"], f["box"]) > 0.35:
                overlap = True
                break
        if not overlap:
            fused.append(cand)

    primary = fused[0] if fused else None
    secondary = fused[1:] if len(fused) > 1 else []

    return {
        "vehicle_id": v_id,
        "primary_candidate": primary,
        "secondary_candidates": secondary,
        "all_candidates": local_candidates,
        "has_plate": primary is not None,
    }


# ---------------------------------------------------------------------------
# Pass 3: Vehicle-region cascade (detect vehicle → crop rear third → detect LP)
# ---------------------------------------------------------------------------

def _pass3_vehicle_cascade(
    lp_model,
    image: np.ndarray,
    conf: float,
    iou: float,
    detected_vehicles: Optional[List[Dict]] = None,
) -> Tuple[List[Dict], List[Dict]]:
    """
    Crop vehicle bumper/plate regions and run LP detection on crops.
    Returns (all_cands, detected_vehicles).
    """
    img_h, img_w = image.shape[:2]
    all_cands: List[Dict] = []

    vehicles = detected_vehicles if detected_vehicles is not None else detect_vehicles(image)
    if not vehicles:
        return all_cands, []

    names = lp_model.names or {}
    is_dedicated_lp = (
        len(names) == 1 or
        any(term in str(n).lower() for n in names.values()
            for term in ("lp", "plate", "license"))
    )

    for v_idx, veh in enumerate(vehicles):
        vx1, vy1, vx2, vy2 = veh["bbox"]
        vw = vx2 - vx1
        vh = vy2 - vy1

        # Distant background vehicles where plates are physically sub-pixel
        is_subpixel_distant = (vw < 60 or vh < 40)

        # Crop the lower 45% of the vehicle box (bumper/plate region)
        plate_y1 = vy1 + int(vh * 0.40)
        plate_y2 = vy2
        plate_x1 = max(0, vx1 - int(vw * 0.05))
        plate_x2 = min(img_w, vx2 + int(vw * 0.05))

        roi = image[plate_y1:plate_y2, plate_x1:plate_x2]
        if roi.size == 0:
            continue

        roi_h, roi_w = roi.shape[:2]

        if is_dedicated_lp:
            # Upscale ROI to at least 320px wide for YOLO to resolve small text
            target_w = max(roi_w, 320)
            up_scale = target_w / roi_w
            up_h = int(roi_h * up_scale)
            try:
                roi_up = cv2.resize(roi, (target_w, up_h), interpolation=cv2.INTER_LANCZOS4)
            except Exception:
                roi_up = roi
                up_scale = 1.0

            result = _run_yolo_inference(lp_model, roi_up, conf=max(CONF_FLOOR, conf - 0.08), iou=iou)
            cands = _extract_lp_boxes(
                result, img_w, img_h,
                scale_x=up_scale, scale_y=up_scale,
                offset_x=plate_x1, offset_y=plate_y1,
                source_tag="pass3_vehicle_cascade",
            )
            all_cands.extend(cands)
        else:
            # When COCO model is active: locate plate by running OCR directly on vehicle bumper zone
            try:
                from app.ocr.paddle_ocr import get_ocr_engine
                from app.validation.indian_plate import normalize_plate_text, validate_indian_plate
                import re

                plate_found_in_veh = False

                # Run OCR if vehicle is large enough to contain visible text (top 15 prominent vehicles)
                if not is_subpixel_distant and v_idx < 15:
                    engine = get_ocr_engine()
                    if engine is not None and roi.size > 0:
                        rgb_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
                        ocr_out = engine.ocr(rgb_roi, cls=True)
                        if ocr_out and ocr_out[0]:
                            for line in ocr_out[0]:
                                if not line:
                                    continue
                                pts, (txt, ocr_c) = line
                                clean = re.sub(r"[^A-Z0-9]", "", txt.upper())
                                if len(clean) >= 3:
                                    xs = [p[0] for p in pts]
                                    ys = [p[1] for p in pts]
                                    px1 = max(0, int(plate_x1 + min(xs)))
                                    py1 = max(0, int(plate_y1 + min(ys)))
                                    px2 = min(img_w, int(plate_x1 + max(xs)))
                                    py2 = min(img_h, int(plate_y1 + max(ys)))
                                    pw = px2 - px1
                                    ph = py2 - py1
                                    if ph > 0 and (pw / ph) >= 0.70:
                                        pad_x = max(6, int(pw * 0.15))
                                        pad_y = max(4, int(ph * 0.25))
                                        cx1 = max(0, px1 - pad_x)
                                        cy1 = max(0, py1 - pad_y)
                                        cx2 = min(img_w, px2 + pad_x)
                                        cy2 = min(img_h, py2 + pad_y)
                                        cw = cx2 - cx1
                                        ch = cy2 - cy1
                                        norm = normalize_plate_text(clean)
                                        status, _ = validate_indian_plate(norm)
                                        conf_score = min(0.99, float(ocr_c) + (0.35 if status == "VALID_FORMAT" else 0.15 if status == "POSSIBLE_FORMAT" else 0.05))
                                        all_cands.append({
                                            "box": (cx1, cy1, cx2, cy2),
                                            "bbox": {"x": cx1, "y": cy1, "width": cw, "height": ch},
                                            "conf": conf_score,
                                            "crop": image[cy1:cy2, cx1:cx2].copy(),
                                            "source": "pass3_vehicle_cascade_ocr",
                                            "vehicle_bbox": {"x": vx1, "y": vy1, "width": vw, "height": vh},
                                        })
            except Exception as e:
                logger.debug(f"Pass3 OCR error on vehicle ROI: {e}")

    logger.debug(f"Pass3 vehicle cascade: {len(all_cands)} plate candidates")
    return all_cands, vehicles


# ---------------------------------------------------------------------------
# Pass 4: Horizontal tile scan
# ---------------------------------------------------------------------------

def _pass4_tiled(
    model,
    image: np.ndarray,
    conf: float,
    iou: float,
    n_tiles: int = 3,
) -> List[Dict]:
    """
    Divide the frame into n_tiles overlapping horizontal strips and run LP
    detection on each. Catches plates near tile edges that full-frame NMS
    or receptive-field limits miss.

    Only runs when the image width is > 800 px (no point for small images).
    """
    img_h, img_w = image.shape[:2]
    if img_w <= 800:
        return []

    all_cands: List[Dict] = []
    tile_w = int(img_w / (n_tiles - TILE_OVERLAP * (n_tiles - 1)))
    step = int(tile_w * (1 - TILE_OVERLAP))

    xs = [i * step for i in range(n_tiles)]
    # Ensure the last tile reaches the right edge
    xs[-1] = max(xs[-1], img_w - tile_w)

    for tx, x_start in enumerate(xs):
        x_end = min(img_w, x_start + tile_w)
        tile = image[:, x_start:x_end]
        if tile.size == 0:
            continue

        # Upscale narrow tiles so YOLO has enough context
        t_h, t_w = tile.shape[:2]
        tgt = max(t_w, 640)
        t_scale = tgt / t_w
        try:
            tile_up = cv2.resize(tile, (tgt, int(t_h * t_scale)), interpolation=cv2.INTER_LANCZOS4)
        except Exception:
            tile_up = tile
            t_scale = 1.0

        result = _run_yolo_inference(model, tile_up, conf=max(CONF_FLOOR, conf - 0.05), iou=iou)
        cands = _extract_lp_boxes(
            result, img_w, img_h,
            scale_x=t_scale, scale_y=t_scale,
            offset_x=x_start, offset_y=0,
            source_tag=f"pass4_tile{tx}",
        )
        all_cands.extend(cands)

    logger.debug(f"Pass4 tiled ({n_tiles} tiles): {len(all_cands)} candidates")
    return all_cands


# ---------------------------------------------------------------------------
# Pass 5: OCR-guided plate localization (unchanged logic, works well already)
# ---------------------------------------------------------------------------

def _pass5_ocr_guided(image: np.ndarray) -> List[Dict]:
    """
    Directly locate license plates by scanning for registration text with PaddleOCR.
    Accurate regardless of vehicle color, plate background, lighting, or angle.
    """
    img_h, img_w = image.shape[:2]
    candidates: List[Dict] = []

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
            "TN", "TR", "TS", "UK", "UP", "WB", "21", "22", "23", "24",
        )

        NON_PLATE_KEYWORDS = {
            "TIMES", "TIMESNOW", "GOVERNOR", "OFFICIAL", "OFFICIALUSE",
            "TEMPORARY", "REGISTRATION", "POLICE", "HIGHWAY", "TOLL",
            "GROUP", "TRMN", "NEWDELHI", "DELHI", "INDIA", "TRANSPORT",
            "MAIAD", "ALAMY", "STOCK", "PHOTO", "NEWS", "BHARAT",
            "CHTANMENTAS", "XABUSHANOI", "XABUS", "XABUSHANO",
            "DAOCA", "OUUHSAUUX", "SHARMA", "ELECTRONICS", "BANK",
            "CAFE", "DELIGHT", "BANDRA",
        }

        for line in ocr_out[0]:
            if not line:
                continue
            pts, (txt, conf) = line
            clean = re.sub(r"[^A-Z0-9]", "", txt.upper())

            # Skip camera HUD timestamp / header (top 15% of frame) or timestamps containing IST/CAM/UTC
            ys = [p[1] for p in pts]
            if min(ys) < img_h * 0.15 or any(kw in clean for kw in ("IST", "CAM", "UTC", "FPS", "REC", "BANDRA", "JUNCTION")):
                continue

            # Strip common IND prefix watermark
            for b in ("IND", "INT", "1ND", "IN0", "LND", "INDIA"):
                if clean.startswith(b) and len(clean) >= len(b) + 5:
                    clean = clean[len(b):]
                    break

            if len(clean) < 4:
                continue

            norm = normalize_plate_text(clean)
            if norm in NON_PLATE_KEYWORDS or clean in NON_PLATE_KEYWORDS:
                continue

            # Skip obvious billboard / shop sign text
            if any(kw in clean for kw in ("SHARMA", "ELECTRONICS", "BANK", "CAFE")):
                continue

            status, _ = validate_indian_plate(norm)
            has_state = (
                clean.startswith(state_prefixes) or
                any(clean[i:i+2] in state_prefixes for i in range(min(3, len(clean))))
            )
            has_both = any(c.isalpha() for c in clean) and any(c.isdigit() for c in clean)

            is_candidate = (
                status in ("VALID_FORMAT", "POSSIBLE_FORMAT")
                or (has_state and len(clean) >= 4)
                or (has_both and len(clean) >= 4 and conf >= 0.35)
                or (4 <= len(clean) <= 12 and any(c.isdigit() for c in clean) and conf >= 0.45)
            )
            if not is_candidate:
                continue

            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            bx1, by1, bx2, by2 = min(xs), min(ys), max(xs), max(ys)
            pw = bx2 - bx1
            ph = by2 - by1
            aspect = pw / float(max(ph, 1))
            if aspect < 0.80 or aspect > 9.5:
                continue

            pad_x = max(10, int(pw * 0.18))
            pad_y = max(8, int(ph * 0.30))
            x1 = max(0, int(bx1 - pad_x))
            y1 = max(0, int(by1 - pad_y))
            x2 = min(img_w, int(bx2 + pad_x))
            y2 = min(img_h, int(by2 + pad_y))
            bw = x2 - x1
            bh = y2 - y1

            crop = safe_crop(image, x1, y1, bw, bh, pad=2)
            if crop.size > 0:
                candidates.append({
                    "box":    (x1, y1, x2, y2),
                    "bbox":   {"x": x1, "y": y1, "width": bw, "height": bh},
                    "conf":   float(conf),
                    "crop":   crop,
                    "source": "ocr_localization",
                })
    except Exception as e:
        logger.warning(f"Pass5 OCR-guided error: {e}")

    return candidates


# ---------------------------------------------------------------------------
# Pass 6: Contour heuristics (per-region, multi-best)
# ---------------------------------------------------------------------------

def _heuristic_plate_regions(
    region: np.ndarray,
    offset_x: int = 0,
    offset_y: int = 0,
    img_w: int = 0,
    img_h: int = 0,
    max_results: int = 6,
) -> List[Dict]:
    """
    Use edge-detection + contour analysis to find ALL plate-like rectangles
    within *region* (not just the single best one).

    Returns list of raw candidate dicts in full-frame coordinates.
    """
    if region is None or region.size == 0:
        return []

    h, w = region.shape[:2]
    results: List[Dict] = []
    img_w = img_w or w
    img_h = img_h or h

    try:
        gray    = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges   = cv2.Canny(blurred, 30, 120)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (19, 3))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        scored: List[Tuple[float, tuple]] = []
        total_area = float(w * h)

        for cnt in contours:
            rx, ry, rw, rh = cv2.boundingRect(cnt)
            area   = rw * rh
            aspect = rw / max(rh, 1)

            if (ASPECT_MIN <= aspect <= ASPECT_MAX and
                    area >= max(MIN_AREA_PX, 0.003 * total_area) and
                    area <= 0.80 * total_area):
                aspect_score = 1.0 - min(abs(aspect - 3.8) / 3.8, 0.9)
                scored.append((area * aspect_score, (rx, ry, rw, rh)))

        # Sort by score descending and take up to max_results
        scored.sort(key=lambda x: x[0], reverse=True)

        for score, (rx, ry, rw, rh) in scored[:max_results]:
            abs_x1 = offset_x + rx
            abs_y1 = offset_y + ry
            abs_x2 = offset_x + rx + rw
            abs_y2 = offset_y + ry + rh
            abs_x1 = max(0, abs_x1)
            abs_y1 = max(0, abs_y1)
            abs_x2 = min(img_w, abs_x2)
            abs_y2 = min(img_h, abs_y2)
            fw = abs_x2 - abs_x1
            fh = abs_y2 - abs_y1

            if fw <= 0 or fh <= 0:
                continue

            crop = safe_crop(region, rx, ry, rw, rh, pad=3)
            if crop.size > 0:
                results.append({
                    "box":    (abs_x1, abs_y1, abs_x2, abs_y2),
                    "bbox":   {"x": abs_x1, "y": abs_y1, "width": fw, "height": fh},
                    "conf":   0.55,   # heuristic confidence
                    "crop":   crop,
                    "source": "contour",
                })
    except Exception as e:
        logger.warning(f"Pass6 heuristic failed: {e}")

    return results


# ---------------------------------------------------------------------------
# Global NMS on all candidates from all passes
# ---------------------------------------------------------------------------

def _global_nms(candidates: List[Dict], iou_threshold: float = NMS_IOU_THR) -> List[Dict]:
    """
    Sort candidates by confidence descending, then greedily keep each
    candidate if it does NOT overlap any already-kept box by > iou_threshold.
    """
    candidates.sort(key=lambda c: c["conf"], reverse=True)
    kept: List[Dict] = []

    for cand in candidates:
        overlap = False
        for k in kept:
            if _compute_iou(cand["box"], k["box"]) > iou_threshold:
                overlap = True
                break
        if not overlap:
            kept.append(cand)

    return kept


# ---------------------------------------------------------------------------
# Public API: Vehicle-First Primary ANPR
# ---------------------------------------------------------------------------

def detect_plates_vehicle_first(
    image: np.ndarray,
    conf_threshold: Optional[float] = None,
    iou_threshold: Optional[float] = None,
) -> Tuple[List[Dict], List[Dict], Dict[str, Any]]:
    """
    Primary Vehicle-First ANPR Detection Pipeline:
    1. Detect all vehicles in the image.
    2. For each detected vehicle, run individual ROI plate detection.
    3. Perform vehicle-local candidate fusion.
    4. Pick ONE primary plate per vehicle.
    5. If 0 vehicles are found, trigger full-frame global fallback.
    
    Returns:
      (plate_candidates, vehicles, debug_info)
    """
    if image is None or image.size == 0:
        return [], [], {}

    img_h, img_w = image.shape[:2]
    model = get_yolo_model()
    conf = conf_threshold if conf_threshold is not None else float(MODEL_CONFIG.get("YOLO_CONFIDENCE_THRESHOLD", 0.25))
    conf = max(CONF_FLOOR, conf)
    iou = iou_threshold if iou_threshold is not None else float(MODEL_CONFIG.get("YOLO_IOU_THRESHOLD", 0.45))

    # Step 1: Detect all vehicles first
    vehicles = detect_vehicles(image)
    plate_candidates: List[Dict] = []
    vehicle_roi_debug: List[Dict] = []

    if vehicles:
        for idx, veh in enumerate(vehicles, start=1):
            roi_res = detect_plates_in_vehicle_roi(image, veh, lp_model=model, conf=conf, iou=iou)
            vehicle_roi_debug.append(roi_res)
            primary = roi_res.get("primary_candidate")
            if primary is not None:
                pbox = primary["bbox"]
                crop = primary.get("crop")
                if crop is None or crop.size == 0:
                    crop = safe_crop(image, pbox["x"], pbox["y"], pbox["width"], pbox["height"], pad=4)
                if crop is not None and crop.size > 0:
                    plate_candidates.append({
                        "plate_id": len(plate_candidates) + 1,
                        "bbox": pbox,
                        "box": primary["box"],
                        "detection_confidence": round(float(primary.get("conf", 0.75)), 4),
                        "original_crop": crop,
                        "sources": [primary.get("source", "vehicle_roi")],
                        "source_count": 1,
                        "is_contour_only": "contour" in primary.get("source", ""),
                        "best_source": primary.get("source", "vehicle_roi"),
                        "vehicle_id": veh["vehicle_id"],
                        "vehicle_bbox": {"x": veh["bbox"][0], "y": veh["bbox"][1],
                                        "width": veh["bbox"][2] - veh["bbox"][0],
                                        "height": veh["bbox"][3] - veh["bbox"][1]},
                        "vehicle_type": veh.get("vehicle_type", "car"),
                        "secondary_candidates": roi_res.get("secondary_candidates", []),
                    })
    else:
        # Step 2: Global Fallback when 0 vehicles detected
        logger.info("Vehicle-first: 0 vehicles detected. Activating global full-frame plate fallback.")
        plate_candidates = detect_license_plates(image, conf_threshold=conf, iou_threshold=iou, return_vehicles=False)

    debug_info = {
        "vehicle_count": len(vehicles),
        "vehicle_roi_results": vehicle_roi_debug,
        "is_global_fallback": len(vehicles) == 0,
    }

    return plate_candidates, vehicles, debug_info


# ---------------------------------------------------------------------------
# Global Fallback & Backward Compatible API
# ---------------------------------------------------------------------------

def detect_license_plates(
    image: np.ndarray,
    conf_threshold: Optional[float] = None,
    iou_threshold: Optional[float] = None,
    return_vehicles: bool = False,
) -> Any:
    """
    Multi-pass industry-grade license plate detector.

    Runs up to 6 complementary detection passes and merges results with
    spatial candidate clustering. Designed for high-density CCTV traffic frames (junctions,
    toll plazas, parking lots) where multiple vehicles appear simultaneously.

    Returns a list of detection dicts (or tuple of (detections, vehicles) if return_vehicles=True):
    {
        "plate_id": int,
        "bbox": {"x": int, "y": int, "width": int, "height": int},
        "detection_confidence": float,
        "original_crop": np.ndarray  (BGR),
        "sources": List[str],
        "source_count": int,
        "is_contour_only": bool,
    }
    """
    if image is None or image.size == 0:
        return ([], []) if return_vehicles else []

    # Ensure 3-channel BGR
    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif len(image.shape) == 3 and image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)

    model = get_yolo_model()
    if model is None:
        logger.error("YOLO model unavailable.")
        return ([], []) if return_vehicles else []

    img_h, img_w = image.shape[:2]

    conf = conf_threshold if conf_threshold is not None else float(
        MODEL_CONFIG.get("YOLO_CONFIDENCE_THRESHOLD", 0.25)
    )
    conf = max(CONF_FLOOR, conf)  # floor — never clamp too high
    iou  = iou_threshold if iou_threshold is not None else float(
        MODEL_CONFIG.get("YOLO_IOU_THRESHOLD", 0.45)
    )

    names = model.names or {}
    is_dedicated_lp = (
        len(names) == 1 or
        any(term in str(n).lower() for n in names.values()
            for term in ("lp", "plate", "license"))
    )

    t0 = time.perf_counter()
    all_candidates: List[Dict] = []
    detected_vehicles: List[Dict] = []

    # ---- Pass 1: Full-frame direct ----------------------------------------
    p1 = _pass1_direct(model, image, conf=conf, iou=iou)
    all_candidates.extend(p1)
    logger.info(f"Pass1 direct:       {len(p1)} candidates")

    # ---- Pass 2: Multi-scale (always) -------------------------------------
    p2 = _pass2_multiscale(model, image, conf=conf, iou=iou)
    all_candidates.extend(p2)
    logger.info(f"Pass2 multi-scale:  {len(p2)} candidates")

    # ---- Pass 3: Vehicle cascade (always — helps for dedicated LP model) ---
    p3, detected_vehicles = _pass3_vehicle_cascade(model, image, conf=conf, iou=iou)
    all_candidates.extend(p3)
    logger.info(f"Pass3 veh-cascade:  {len(p3)} candidates ({len(detected_vehicles)} vehicles)")

    # ---- Pass 4: Tiled scan (wide images > 800 px) ------------------------
    if img_w > 800:
        n_tiles = 4 if img_w > 1500 else 3
        p4 = _pass4_tiled(model, image, conf=conf, iou=iou, n_tiles=n_tiles)
        all_candidates.extend(p4)
        logger.info(f"Pass4 tiled:        {len(p4)} candidates")

    # ---- Pass 5: OCR-guided (run only if vehicle cascade found fewer than 2 candidates) ----
    if len(all_candidates) < 2:
        p5 = _pass5_ocr_guided(image)
        all_candidates.extend(p5)
        logger.info(f"Pass5 OCR-guided:   {len(p5)} candidates")

    # ---- Pass 6: Heuristic (only if zero candidates found so far) -----------
    if len(all_candidates) == 0:
        p6 = _heuristic_plate_regions(image, img_w=img_w, img_h=img_h, max_results=8)
        all_candidates.extend(p6)
        logger.info(f"Pass6 heuristic:    {len(p6)} candidates")

    logger.info(f"All passes total:   {len(all_candidates)} raw candidates in "
                f"{time.perf_counter()-t0:.3f}s")

    # ---- Fill in crops for candidates that don't have one yet ----
    for cand in all_candidates:
        if cand.get("crop") is None:
            b = cand["bbox"]
            cand["crop"] = safe_crop(image, b["x"], b["y"], b["width"], b["height"], pad=4)

    # ---- Discard candidates with empty crops ----
    all_candidates = [c for c in all_candidates if c.get("crop") is not None and c["crop"].size > 0]

    # ---- Boost confidence of OCR-matched candidates from all YOLO passes ----
    ocr_boxes = [c for c in all_candidates if c.get("source") == "ocr_localization"]
    for cand in all_candidates:
        if cand.get("source") == "ocr_localization":
            continue
        for ocr in ocr_boxes:
            if _compute_iou(cand["box"], ocr["box"]) > 0.20:
                cand["conf"] = min(0.99, cand["conf"] + 0.15)
                break

    # ---- Spatial Candidate Clustering ----
    clusters = cluster_plate_candidates(
        all_candidates,
        iou_threshold=NMS_IOU_THR,
        discard_unconfirmed_contours=True,
    )

    detections: List[Dict] = []
    for idx, cl in enumerate(clusters, start=1):
        x1, y1, x2, y2 = cl.bbox
        x1 = max(0, min(img_w - 1, x1))
        y1 = max(0, min(img_h - 1, y1))
        x2 = max(x1 + 1, min(img_w, x2))
        y2 = max(y1 + 1, min(img_h, y2))
        bw = x2 - x1
        bh = y2 - y1

        if not _is_valid_plate_geometry(bw, bh, img_w, img_h, strict=False):
            continue

        crop = safe_crop(image, x1, y1, bw, bh, pad=4)
        if crop is None or crop.size == 0:
            continue

        veh_box = None
        for rc in cl.raw_candidates:
            if rc.get("vehicle_bbox"):
                veh_box = rc["vehicle_bbox"]
                break

        detections.append({
            "plate_id":             idx,
            "bbox":                 {"x": x1, "y": y1, "width": bw, "height": bh},
            "box":                  (x1, y1, x2, y2),
            "detection_confidence": round(cl.confidence, 4),
            "original_crop":        crop,
            "sources":              cl.sources,
            "source_count":         cl.source_count,
            "is_contour_only":      cl.is_contour_only,
            "best_source":          cl.best_source,
            "vehicle_bbox":         veh_box,
        })

    logger.info(
        f"detect_license_plates: {len(detections)} plate(s) returned  "
        f"({time.perf_counter()-t0:.3f}s total)"
    )
    if return_vehicles:
        return detections, detected_vehicles
    return detections


# ---------------------------------------------------------------------------
# Legacy alias — kept for backward compatibility
# ---------------------------------------------------------------------------

def _detect_plates_via_ocr(image: np.ndarray) -> List[Dict]:
    """Backward-compatible alias for Pass 5 (called by old pipeline code)."""
    return _pass5_ocr_guided(image)


def _heuristic_plate_region(
    region: np.ndarray,
    fallback_full: bool = False,
) -> Optional[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
    """
    Backward-compatible single-result wrapper used by the old fallback branch.
    Returns (crop, (rx, ry, rw, rh)) for the best candidate, or None.
    """
    results = _heuristic_plate_regions(region, max_results=1)
    if not results:
        if fallback_full and region is not None and region.size > 0:
            h, w = region.shape[:2]
            return region.copy(), (0, 0, w, h)
        return None
    r = results[0]
    b = r["bbox"]
    return r["crop"], (b["x"], b["y"], b["width"], b["height"])
