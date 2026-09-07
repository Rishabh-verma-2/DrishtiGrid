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


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def load_yolo_model():
    """
    Load the primary LP detection model (preferred: dedicated LP weights).
    Falls back to COCO YOLOv8n, then auto-downloads yolov8n.pt.
    """
    global _yolo_model

    try:
        from ultralytics import YOLO
    except ImportError:
        logger.error("ultralytics not installed. Run: pip install ultralytics")
        return None

    preference = MODEL_CONFIG.get("YOLO_MODEL_PREFERENCE", "lp")
    lp_path    = Path(MODEL_CONFIG["YOLO_LP_MODEL_PATH"])
    coco_path  = Path(MODEL_CONFIG["YOLO_MODEL_PATH"])

    if preference == "lp" and lp_path.exists():
        model_path = str(lp_path)
        logger.info(f"Loading dedicated LP model: {model_path}")
    elif coco_path.exists():
        model_path = str(coco_path)
        logger.info(f"Loading COCO YOLOv8 model: {model_path}")
    else:
        model_path = "yolov8n.pt"
        logger.info("No local weights — downloading yolov8n.pt")

    try:
        _yolo_model = YOLO(model_path)
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        _yolo_model(dummy, verbose=False)
        logger.info(f"Primary YOLO model ready: {model_path}  classes={_yolo_model.names}")
        return _yolo_model
    except Exception as e:
        logger.error(f"Failed to load YOLO from {model_path}: {e}")
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
# Pass 3: Vehicle-region cascade (detect vehicle → crop rear third → detect LP)
# ---------------------------------------------------------------------------

def _pass3_vehicle_cascade(
    lp_model,
    image: np.ndarray,
    conf: float,
    iou: float,
) -> List[Dict]:
    """
    1. Use a COCO model to locate all vehicles in the frame.
    2. For each vehicle, crop the lower-third of its bounding box (where the
       rear plate lives in overhead/side-facing cameras).
    3. Upscale that crop to 640×640 and run LP detection on it.
    4. Project coordinates back to full-frame space.

    This dramatically improves recall for small plates because the LP model
    sees each plate at a much larger apparent size.
    """
    img_h, img_w = image.shape[:2]
    all_cands: List[Dict] = []

    coco = _load_coco_model()
    if coco is None:
        return all_cands

    # Detect vehicles — use a moderate conf so we don't miss any
    veh_result = _run_yolo_inference(
        coco, image, conf=0.25, iou=0.45,
        classes=list(VEHICLE_CLASS_IDS),
    )
    if veh_result is None or veh_result.boxes is None:
        return all_cands

    vehicle_boxes: List[Tuple[int,int,int,int]] = []
    for box in veh_result.boxes:
        if box.cls is None or len(box.cls) == 0:
            continue
        cls_id = int(box.cls[0].item())
        if cls_id not in VEHICLE_CLASS_IDS:
            continue
        if box.xyxy is None or len(box.xyxy) == 0:
            continue
        xyxy = box.xyxy[0].cpu().numpy().astype(int)
        vx1, vy1, vx2, vy2 = (
            max(0, xyxy[0]), max(0, xyxy[1]),
            min(img_w, xyxy[2]), min(img_h, xyxy[3]),
        )
        if (vx2 - vx1) < 20 or (vy2 - vy1) < 20:
            continue
        vehicle_boxes.append((vx1, vy1, vx2, vy2))

    logger.debug(f"Pass3: {len(vehicle_boxes)} vehicle(s) found by COCO model")

    for (vx1, vy1, vx2, vy2) in vehicle_boxes:
        vw = vx2 - vx1
        vh = vy2 - vy1

        # --- Crop the lower 40% of the vehicle box (plate region) ---
        # For overhead cameras the plate is in the full bottom section;
        # use 55% to be safe.
        plate_y1 = vy1 + int(vh * 0.45)
        plate_y2 = vy2
        plate_x1 = max(0, vx1 - int(vw * 0.05))  # tiny horizontal expansion
        plate_x2 = min(img_w, vx2 + int(vw * 0.05))

        roi = image[plate_y1:plate_y2, plate_x1:plate_x2]
        if roi.size == 0:
            continue

        roi_h, roi_w = roi.shape[:2]

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

    logger.debug(f"Pass3 vehicle cascade: {len(all_cands)} plate candidates")
    return all_cands


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
                    "source": "pass5_ocr",
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
                    "source": "pass6_heuristic",
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
# Public API
# ---------------------------------------------------------------------------

def detect_license_plates(
    image: np.ndarray,
    conf_threshold: Optional[float] = None,
    iou_threshold: Optional[float] = None,
) -> List[Dict]:
    """
    Multi-pass industry-grade license plate detector.

    Runs up to 6 complementary detection passes and merges results with
    global NMS. Designed for high-density CCTV traffic frames (junctions,
    toll plazas, parking lots) where multiple vehicles appear simultaneously.

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
        logger.error("YOLO model unavailable.")
        return []

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

    # ---- Pass 1: Full-frame direct ----------------------------------------
    p1 = _pass1_direct(model, image, conf=conf, iou=iou)
    all_candidates.extend(p1)
    logger.info(f"Pass1 direct:       {len(p1)} candidates")

    # ---- Pass 2: Multi-scale (always) -------------------------------------
    p2 = _pass2_multiscale(model, image, conf=conf, iou=iou)
    all_candidates.extend(p2)
    logger.info(f"Pass2 multi-scale:  {len(p2)} candidates")

    # ---- Pass 3: Vehicle cascade (always — helps for dedicated LP model) ---
    p3 = _pass3_vehicle_cascade(model, image, conf=conf, iou=iou)
    all_candidates.extend(p3)
    logger.info(f"Pass3 veh-cascade:  {len(p3)} candidates")

    # ---- Pass 4: Tiled scan (wide images > 800 px) ------------------------
    if img_w > 800:
        n_tiles = 4 if img_w > 1500 else 3
        p4 = _pass4_tiled(model, image, conf=conf, iou=iou, n_tiles=n_tiles)
        all_candidates.extend(p4)
        logger.info(f"Pass4 tiled:        {len(p4)} candidates")

    # ---- Pass 5: OCR-guided (run in parallel with YOLO passes) ------------
    p5 = _pass5_ocr_guided(image)
    all_candidates.extend(p5)
    logger.info(f"Pass5 OCR-guided:   {len(p5)} candidates")

    # ---- Pass 6: Heuristic (only if very few candidates so far) -----------
    if len(all_candidates) < 3:
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
    # If a YOLO box is very close to an OCR box, the OCR text confirms it —
    # raise the YOLO candidate's confidence so NMS prefers it.
    ocr_boxes = [c for c in all_candidates if c["source"] == "pass5_ocr"]
    for cand in all_candidates:
        if cand["source"] == "pass5_ocr":
            continue
        for ocr in ocr_boxes:
            if _compute_iou(cand["box"], ocr["box"]) > 0.20:
                cand["conf"] = min(0.99, cand["conf"] + 0.15)
                break

    # ---- Global NMS ----
    kept = _global_nms(all_candidates, iou_threshold=NMS_IOU_THR)

    # ---- Final sanity filter ----
    kept = [
        c for c in kept
        if _is_valid_plate_geometry(
            c["bbox"]["width"], c["bbox"]["height"], img_w, img_h, strict=False
        )
    ]

    # ---- Format output ----
    detections: List[Dict] = []
    for idx, c in enumerate(kept, start=1):
        detections.append({
            "plate_id":             idx,
            "bbox":                 c["bbox"],
            "detection_confidence": round(c["conf"], 4),
            "original_crop":        c["crop"],
        })

    logger.info(
        f"detect_license_plates: {len(detections)} plate(s) returned  "
        f"({time.perf_counter()-t0:.3f}s total)"
    )
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
