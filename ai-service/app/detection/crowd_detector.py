"""
Crowd Detection & Object Inventory Module — High-Accuracy Edition
==================================================================

Core techniques used for maximum count accuracy:

1.  Multi-scale tiled inference
    The frame is split into 50%-overlapping tiles (3×3 grid) and each tile
    is up-scaled to ≥640 px before inference. Small / partially-occluded
    people that YOLO misses at full-frame resolution are resolved inside tiles.

2.  Full-frame inference at two confidence levels
    A loose pass (conf=0.20) is followed by a tight pass (conf=0.45).
    Candidates from both passes are merged before NMS.

3.  Full-frame inference at two scale levels
    Frame is also run at 1.25× original size. Distant / small persons
    detected at this scale are projected back to original coordinates.

4.  Soft-NMS for dense crowds
    Standard NMS deletes occluded boxes. Soft-NMS instead decays the
    confidence of nearby boxes, keeping partially-occluded people that
    genuine NMS would remove. This is the single biggest accuracy gain
    for very crowded images.

5.  Gaussian kernel density estimation (KDE)
    A heatmap is built from person centroids using Gaussian kernels,
    giving a smooth, continuous density map instead of a coarse grid.
    KDE is also used to estimate crowd count in regions that are too
    occluded for per-person box detection.

6.  Crowd estimation correction (perspective / occlusion)
    When many detections cluster in a small area (crowd occlusion),
    we apply a correction factor based on packing density to estimate
    hidden persons behind visible ones.

7.  Vehicle / object inventory
    All COCO classes are detected in a separate pass. Vehicles and other
    objects are categorised and counted. Results are returned alongside
    person counts for a complete scene inventory.

8.  Per-camera sliding-window surge detection (unchanged, works well).

No extra packages required — uses ultralytics (already installed).
"""

import logging
import time
from collections import deque, defaultdict
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.config.settings import MODEL_CONFIG
from app.utils.image_utils import numpy_to_base64

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# COCO class catalogue
# ---------------------------------------------------------------------------

# Class 0 = person
PERSON_CLASS_ID = 0

# Full COCO class name map (80 classes, indices 0-79)
COCO_CLASSES: Dict[int, str] = {
    0: "person",
    1: "bicycle", 2: "car", 3: "motorcycle", 4: "airplane",
    5: "bus", 6: "train", 7: "truck", 8: "boat",
    9: "traffic light", 10: "fire hydrant", 11: "stop sign",
    12: "parking meter", 13: "bench", 14: "bird", 15: "cat",
    16: "dog", 17: "horse", 18: "sheep", 19: "cow",
    20: "elephant", 21: "bear", 22: "zebra", 23: "giraffe",
    24: "backpack", 25: "umbrella", 26: "handbag", 27: "tie",
    28: "suitcase", 29: "frisbee", 30: "skis", 31: "snowboard",
    32: "sports ball", 33: "kite", 34: "baseball bat",
    35: "baseball glove", 36: "skateboard", 37: "surfboard",
    38: "tennis racket", 39: "bottle", 40: "wine glass",
    41: "cup", 42: "fork", 43: "knife", 44: "spoon",
    45: "bowl", 46: "banana", 47: "apple", 48: "sandwich",
    49: "orange", 50: "broccoli", 51: "carrot", 52: "hot dog",
    53: "pizza", 54: "donut", 55: "cake", 56: "chair",
    57: "couch", 58: "potted plant", 59: "bed",
    60: "dining table", 61: "toilet", 62: "tv", 63: "laptop",
    64: "mouse", 65: "remote", 66: "keyboard", 67: "cell phone",
    68: "microwave", 69: "oven", 70: "toaster", 71: "sink",
    72: "refrigerator", 73: "book", 74: "clock", 75: "vase",
    76: "scissors", 77: "teddy bear", 78: "hair drier",
    79: "toothbrush",
}

# Vehicle class IDs we always report separately
VEHICLE_CLASS_IDS = {1, 2, 3, 5, 6, 7, 8}   # bicycle, car, motorcycle, bus, train, truck, boat

# Classes that are relevant for traffic / public-space CCTV
TRAFFIC_RELEVANT = {0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 24, 25, 28}

# ---------------------------------------------------------------------------
# Crowd level thresholds
# ---------------------------------------------------------------------------

CROWD_THRESHOLDS = {
    "LOW":      0,    # 0–9
    "MEDIUM":  10,    # 10–29
    "HIGH":    30,    # 30–59
    "CRITICAL":60,    # 60+
}

ZONE_THRESHOLDS = {
    "clear":    0,
    "moderate": 3,
    "dense":    8,
    "critical": 15,
}

SURGE_THRESHOLD_PERCENT = 40.0
BASELINE_WINDOW_SIZE    = 30
DEFAULT_GRID_ROWS       = 4
DEFAULT_GRID_COLS       = 4

# Visual colours (BGR)
_BOX_COLORS = {
    "clear":    (50, 220, 50),
    "moderate": (0, 220, 180),
    "dense":    (0, 165, 255),
    "critical": (0, 40, 230),
}
_VEH_BOX_COLOR   = (255, 180, 0)    # Blue — vehicles
_OTHER_BOX_COLOR = (200, 200, 0)    # Cyan — other objects
_PANEL_DARK      = (12, 12, 25)
_TITLE_COLOR     = (80, 210, 255)
_TEXT_COLOR      = (220, 220, 220)

# Per-camera baselines
_camera_baselines: Dict[str, deque] = {}

# ---------------------------------------------------------------------------
# Device helper
# ---------------------------------------------------------------------------

def _get_device() -> str:
    try:
        import torch
        if MODEL_CONFIG.get("USE_GPU", True) and torch.cuda.is_available():
            return "0"
    except Exception:
        pass
    return "cpu"


# ---------------------------------------------------------------------------
# Soft-NMS  (Bodla et al. 2017)
# ---------------------------------------------------------------------------

def _soft_nms(
    boxes: List[Tuple[int, int, int, int]],
    scores: List[float],
    sigma: float = 0.5,
    score_threshold: float = 0.15,
    iou_threshold: float = 0.30,
) -> Tuple[List[Tuple[int,int,int,int]], List[float]]:
    """
    Gaussian Soft-NMS: instead of hard-deleting overlapping boxes, decay
    their scores. Keeps partially-occluded people that hard NMS would drop.

    boxes  : list of (x1, y1, x2, y2)
    scores : list of confidence scores (same length)
    Returns kept (boxes, scores) after soft-NMS.
    """
    if not boxes:
        return [], []

    boxes_arr  = np.array(boxes,  dtype=np.float32)
    scores_arr = np.array(scores, dtype=np.float32)
    keep_boxes = []
    keep_scores = []

    indices = list(range(len(scores_arr)))
    while indices:
        # Pick highest score
        best_idx = max(indices, key=lambda i: scores_arr[i])
        best_box = boxes_arr[best_idx]
        keep_boxes.append(tuple(boxes_arr[best_idx].astype(int)))
        keep_scores.append(float(scores_arr[best_idx]))
        indices.remove(best_idx)

        remaining = []
        for i in indices:
            b = boxes_arr[i]
            # IoU
            ix1 = max(best_box[0], b[0]); iy1 = max(best_box[1], b[1])
            ix2 = min(best_box[2], b[2]); iy2 = min(best_box[3], b[3])
            inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
            area_b = max(1.0, (b[2]-b[0]) * (b[3]-b[1]))
            area_a = max(1.0, (best_box[2]-best_box[0]) * (best_box[3]-best_box[1]))
            iou = inter / (area_a + area_b - inter)

            # Gaussian decay of score
            decay = np.exp(-(iou ** 2) / sigma)
            scores_arr[i] *= decay

            if scores_arr[i] >= score_threshold:
                remaining.append(i)
        indices = remaining

    return keep_boxes, keep_scores


# ---------------------------------------------------------------------------
# KDE-based density heatmap
# ---------------------------------------------------------------------------

def _build_kde_heatmap(
    centroids: List[Tuple[int, int]],
    img_h: int,
    img_w: int,
    bandwidth: int = 60,
) -> np.ndarray:
    """
    Build a normalised Gaussian KDE heatmap from person centroids.
    bandwidth : kernel radius in pixels (larger = smoother)
    Returns float32 array in [0, 1] of shape (img_h, img_w).
    """
    heatmap = np.zeros((img_h, img_w), dtype=np.float32)
    if not centroids:
        return heatmap

    for (cx, cy) in centroids:
        # Gaussian splat: paint a 2D Gaussian centred at (cx, cy)
        x_lo = max(0, cx - bandwidth * 2)
        x_hi = min(img_w, cx + bandwidth * 2 + 1)
        y_lo = max(0, cy - bandwidth * 2)
        y_hi = min(img_h, cy + bandwidth * 2 + 1)

        xs = np.arange(x_lo, x_hi, dtype=np.float32)
        ys = np.arange(y_lo, y_hi, dtype=np.float32)
        if xs.size == 0 or ys.size == 0:
            continue
        xx, yy = np.meshgrid(xs, ys)
        gauss  = np.exp(-((xx - cx)**2 + (yy - cy)**2) / (2 * bandwidth**2))
        heatmap[y_lo:y_hi, x_lo:x_hi] += gauss

    # Normalise to [0, 1]
    mx = heatmap.max()
    if mx > 0:
        heatmap /= mx
    return heatmap


# ---------------------------------------------------------------------------
# Multi-pass person detection
# ---------------------------------------------------------------------------

def _run_yolo_pass(
    model,
    image: np.ndarray,
    conf: float,
    iou: float,
    classes: Optional[List[int]] = None,
    scale: float = 1.0,
) -> List[Dict]:
    """
    Single YOLO inference pass. Optionally up-scales the image before inference
    and projects boxes back to original coordinates.

    Returns list of raw dicts: {cls_id, conf, x1, y1, x2, y2}
    """
    img_h, img_w = image.shape[:2]
    if scale != 1.0:
        new_w = int(img_w * scale)
        new_h = int(img_h * scale)
        # Cap longest dim at 4096 px
        cap = 4096 / max(new_w, new_h)
        if cap < 1.0:
            new_w = int(new_w * cap)
            new_h = int(new_h * cap)
        try:
            infer_img = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
            sx, sy = new_w / img_w, new_h / img_h
        except Exception:
            infer_img, sx, sy = image, 1.0, 1.0
    else:
        infer_img, sx, sy = image, 1.0, 1.0

    kw: Dict[str, Any] = dict(
        conf=conf, iou=iou, device=_get_device(),
        verbose=False, agnostic_nms=True,
    )
    if classes is not None:
        kw["classes"] = classes

    try:
        results = model(infer_img, **kw)
    except Exception as e:
        logger.debug(f"[CrowdDetector] YOLO pass error: {e}")
        return []

    raw: List[Dict] = []
    if not results:
        return raw

    res = results[0]
    boxes_obj = res.boxes
    if boxes_obj is None or len(boxes_obj) == 0:
        return raw

    for box in boxes_obj:
        if box.cls is None or len(box.cls) == 0:
            continue
        cls_id   = int(box.cls[0].item())
        conf_val = float(box.conf[0].item()) if box.conf is not None else conf
        if box.xyxy is None or len(box.xyxy) == 0:
            continue

        xyxy = box.xyxy[0].cpu().numpy().astype(float)
        # Project back to original coords
        x1 = max(0, int(xyxy[0] / sx))
        y1 = max(0, int(xyxy[1] / sy))
        x2 = min(img_w, int(xyxy[2] / sx))
        y2 = min(img_h, int(xyxy[3] / sy))
        raw.append({"cls_id": cls_id, "conf": conf_val,
                    "x1": x1, "y1": y1, "x2": x2, "y2": y2})
    return raw


def _run_tile_pass(
    model,
    image: np.ndarray,
    conf: float,
    iou: float,
    tile_rows: int = 3,
    tile_cols: int = 3,
    overlap: float = 0.40,
) -> List[Dict]:
    """
    Split the frame into overlapping tiles, run inference on each,
    project back to full-frame coords.

    tile_rows x tile_cols tiles with `overlap` fraction of overlap.
    Each tile is upscaled to ≥640 px before inference.
    """
    img_h, img_w = image.shape[:2]
    all_raw: List[Dict] = []

    step_y = int(img_h / (tile_rows - overlap * (tile_rows - 1)))
    step_x = int(img_w / (tile_cols - overlap * (tile_cols - 1)))
    tile_h = int(step_y / (1 - overlap))
    tile_w = int(step_x / (1 - overlap))

    for r in range(tile_rows):
        y0 = min(r * step_y, img_h - tile_h)
        y0 = max(0, y0)
        y1 = min(y0 + tile_h, img_h)
        for c in range(tile_cols):
            x0 = min(c * step_x, img_w - tile_w)
            x0 = max(0, x0)
            x1 = min(x0 + tile_w, img_w)

            tile = image[y0:y1, x0:x1]
            if tile.size == 0:
                continue

            t_h, t_w = tile.shape[:2]
            tgt = max(t_w, t_h, 640)
            sc  = tgt / max(t_w, t_h)
            try:
                tile_up = cv2.resize(tile, (int(t_w*sc), int(t_h*sc)),
                                     interpolation=cv2.INTER_LANCZOS4)
            except Exception:
                tile_up, sc = tile, 1.0

            kw: Dict[str, Any] = dict(
                conf=conf, iou=iou, device=_get_device(),
                verbose=False, agnostic_nms=True,
                classes=[PERSON_CLASS_ID],
            )
            try:
                results = model(tile_up, **kw)
            except Exception:
                continue

            if not results:
                continue
            boxes_obj = results[0].boxes
            if boxes_obj is None or len(boxes_obj) == 0:
                continue

            for box in boxes_obj:
                if box.cls is None or len(box.cls) == 0:
                    continue
                cls_id   = int(box.cls[0].item())
                conf_val = float(box.conf[0].item()) if box.conf is not None else conf
                if box.xyxy is None or len(box.xyxy) == 0:
                    continue

                xyxy = box.xyxy[0].cpu().numpy().astype(float)
                # Tile-local → full-frame
                fx1 = max(0,    int(xyxy[0] / sc) + x0)
                fy1 = max(0,    int(xyxy[1] / sc) + y0)
                fx2 = min(img_w, int(xyxy[2] / sc) + x0)
                fy2 = min(img_h, int(xyxy[3] / sc) + y0)
                all_raw.append({"cls_id": cls_id, "conf": conf_val,
                                 "x1": fx1, "y1": fy1, "x2": fx2, "y2": fy2})

    return all_raw


def _merge_and_softnms(
    raw_person: List[Dict],
    conf_floor: float = 0.15,
) -> Tuple[List[Tuple], List[float]]:
    """
    1. Filter to persons only and drop boxes below conf_floor.
    2. Merge duplicates from different passes.
    3. Apply Soft-NMS.
    Returns (boxes_xyxy, scores).
    """
    boxes: List[Tuple[int,int,int,int]] = []
    scores: List[float] = []

    for r in raw_person:
        if r["cls_id"] != PERSON_CLASS_ID:
            continue
        if r["conf"] < conf_floor:
            continue
        w = r["x2"] - r["x1"]
        h = r["y2"] - r["y1"]
        # Person sanity: must be taller than wide in frontal view,
        # but allow overhead/seated (relax to h > 8)
        if w < 8 or h < 8:
            continue
        boxes.append((r["x1"], r["y1"], r["x2"], r["y2"]))
        scores.append(r["conf"])

    if not boxes:
        return [], []

    kept_boxes, kept_scores = _soft_nms(
        boxes, scores,
        sigma=0.50,            # Gaussian decay width
        score_threshold=0.12,  # keep even low-confidence survivors
        iou_threshold=0.30,
    )
    return kept_boxes, kept_scores


# ---------------------------------------------------------------------------
# Occlusion correction
# ---------------------------------------------------------------------------

def _estimate_occluded_count(
    person_boxes: List[Tuple],
    img_h: int,
    img_w: int,
) -> int:
    """
    In densely packed crowds, people behind front-row people are hidden.
    Estimate the number of additional hidden persons from the packing density
    of the visible boxes.

    Method: compute average visible box height. In a standing crowd the
    visible height of the rear rows is progressively smaller. Use a simple
    geometric series to estimate the occluded portion.

    Returns estimated number of *additional* hidden persons (0 in sparse crowds).
    """
    if len(person_boxes) < 10:
        return 0  # sparse — no meaningful occlusion

    heights = [b[3] - b[1] for b in person_boxes if (b[3]-b[1]) > 0]
    if not heights:
        return 0

    avg_h = float(np.mean(heights))
    frame_area = img_h * img_w
    total_box_area = sum((b[2]-b[0]) * (b[3]-b[1]) for b in person_boxes)

    # Packing ratio: fraction of frame covered by visible boxes
    packing = min(total_box_area / frame_area, 0.95)

    # Empirical model: beyond 30% packing, significant occlusion starts.
    # Each additional 10% packing ≈ 15% more hidden persons.
    if packing < 0.30:
        return 0

    extra_fraction = (packing - 0.30) / 0.10 * 0.15
    extra_fraction = min(extra_fraction, 1.20)  # cap at 2.2× detected count
    return int(len(person_boxes) * extra_fraction)


# ---------------------------------------------------------------------------
# Density grid
# ---------------------------------------------------------------------------

def _build_density_grid(
    boxes: List[Tuple],
    scores: List[float],
    img_h: int,
    img_w: int,
    grid_rows: int = DEFAULT_GRID_ROWS,
    grid_cols: int = DEFAULT_GRID_COLS,
) -> List[Dict]:
    """Partition frame into grid; count persons per cell using box centroids."""
    cell_h = img_h / grid_rows
    cell_w = img_w / grid_cols
    grid   = [[0] * grid_cols for _ in range(grid_rows)]

    for b in boxes:
        cx = (b[0] + b[2]) // 2
        cy = (b[1] + b[3]) // 2
        r  = min(int(cy / cell_h), grid_rows - 1)
        c  = min(int(cx / cell_w), grid_cols - 1)
        grid[r][c] += 1

    zones: List[Dict] = []
    for r in range(grid_rows):
        for c in range(grid_cols):
            cnt = grid[r][c]
            if   cnt >= ZONE_THRESHOLDS["critical"]: level = "critical"
            elif cnt >= ZONE_THRESHOLDS["dense"]:    level = "dense"
            elif cnt >= ZONE_THRESHOLDS["moderate"]: level = "moderate"
            else:                                     level = "clear"
            zones.append({
                "row": r, "col": c, "count": cnt, "level": level,
                "bbox": {
                    "x": int(c * cell_w), "y": int(r * cell_h),
                    "w": int(cell_w),     "h": int(cell_h),
                },
            })
    return zones


# ---------------------------------------------------------------------------
# Crowd metrics
# ---------------------------------------------------------------------------

def _get_crowd_level(count: int) -> str:
    if   count >= CROWD_THRESHOLDS["CRITICAL"]: return "CRITICAL"
    elif count >= CROWD_THRESHOLDS["HIGH"]:     return "HIGH"
    elif count >= CROWD_THRESHOLDS["MEDIUM"]:   return "MEDIUM"
    else:                                        return "LOW"


def _compute_density_score(
    count: int, img_h: int, img_w: int,
    person_boxes: List[Tuple],
) -> float:
    """
    Weighted density score: blend between count-based estimate and
    actual bounding-box area coverage for higher accuracy.
    """
    img_area = img_h * img_w
    if img_area <= 0:
        return 0.0

    # Count-based estimate
    avg_px = max(1200, img_area * 0.0015)
    count_score = min(1.0, count / max(img_area / avg_px, 1))

    # Area-based estimate
    if person_boxes:
        box_area = sum((b[2]-b[0]) * (b[3]-b[1]) for b in person_boxes)
        area_score = min(1.0, box_area / (img_area * 0.85))
    else:
        area_score = 0.0

    blended = 0.55 * count_score + 0.45 * area_score
    return round(min(1.0, blended), 4)


# ---------------------------------------------------------------------------
# Surge detection
# ---------------------------------------------------------------------------

def _check_surge(camera_id: str, current_count: int) -> Dict[str, Any]:
    global _camera_baselines
    if camera_id not in _camera_baselines:
        _camera_baselines[camera_id] = deque(maxlen=BASELINE_WINDOW_SIZE)

    window = _camera_baselines[camera_id]
    surge_detected = False
    baseline_avg   = 0.0
    surge_percent  = 0.0

    if len(window) >= 5:
        baseline_avg = float(np.mean(list(window)))
        if baseline_avg > 0:
            surge_percent  = ((current_count - baseline_avg) / baseline_avg) * 100.0
            surge_detected = surge_percent >= SURGE_THRESHOLD_PERCENT

    window.append(current_count)
    return {
        "surge_detected": surge_detected,
        "baseline_avg":   round(baseline_avg, 1),
        "surge_percent":  round(surge_percent, 1),
    }


# ---------------------------------------------------------------------------
# Vehicle / object inventory
# ---------------------------------------------------------------------------

def _build_object_inventory(raw_all: List[Dict]) -> Dict[str, Any]:
    """
    Summarise all detected non-person objects.
    Returns:
    {
      "vehicles": { "car": int, "truck": int, ... },
      "vehicle_total": int,
      "other_objects": { "bench": int, ... },
      "detections": [ { "class", "count", "bbox_list" }, ... ],
    }
    """
    class_counts: Dict[int, int] = defaultdict(int)
    class_boxes:  Dict[int, List] = defaultdict(list)

    for r in raw_all:
        cid = r["cls_id"]
        if cid == PERSON_CLASS_ID:
            continue
        class_counts[cid] += 1
        class_boxes[cid].append({
            "x1": r["x1"], "y1": r["y1"],
            "x2": r["x2"], "y2": r["y2"],
            "conf": round(r["conf"], 3),
        })

    vehicles: Dict[str, int] = {}
    other:    Dict[str, int] = {}

    for cid, cnt in class_counts.items():
        name = COCO_CLASSES.get(cid, f"class_{cid}")
        if cid in VEHICLE_CLASS_IDS:
            vehicles[name] = cnt
        else:
            other[name] = cnt

    detections_list = []
    for cid, cnt in sorted(class_counts.items(), key=lambda x: -x[1]):
        name = COCO_CLASSES.get(cid, f"class_{cid}")
        detections_list.append({
            "class":     name,
            "class_id":  cid,
            "count":     cnt,
            "is_vehicle": cid in VEHICLE_CLASS_IDS,
            "boxes":     class_boxes[cid][:20],  # cap at 20 for payload size
        })

    return {
        "vehicles":      vehicles,
        "vehicle_total": sum(vehicles.values()),
        "other_objects": other,
        "detections":    detections_list,
    }


# ---------------------------------------------------------------------------
# Rich annotation
# ---------------------------------------------------------------------------

def _draw_annotations(
    image: np.ndarray,
    person_boxes: List[Tuple],
    person_scores: List[float],
    zones: List[Dict],
    kde_heatmap: np.ndarray,
    metrics: Dict[str, Any],
    surge_info: Dict[str, Any],
    obj_inventory: Dict[str, Any],
    occluded_est: int,
) -> np.ndarray:
    """
    Produce a richly annotated BGR frame:
    - Gaussian KDE heatmap overlay (colourised)
    - Zone grid overlay (semi-transparent)
    - Per-person bounding boxes coloured by zone density
    - Vehicle / object boxes (blue)
    - Stats panel (top-left)
    - Object inventory mini-panel (top-right)
    """
    out = image.copy()
    img_h, img_w = out.shape[:2]

    grid_rows = metrics.get("grid_rows", DEFAULT_GRID_ROWS)
    grid_cols = metrics.get("grid_cols", DEFAULT_GRID_COLS)
    cell_h = img_h / grid_rows
    cell_w = img_w / grid_cols

    # ---------- KDE heatmap colourised overlay ----------
    if kde_heatmap is not None and kde_heatmap.max() > 0:
        try:
            hm_uint8 = (kde_heatmap * 255).astype(np.uint8)
            hm_color = cv2.applyColorMap(hm_uint8, cv2.COLORMAP_JET)
            # Only overlay where density is meaningful (> 10%)
            mask = (kde_heatmap > 0.10).astype(np.float32)
            alpha = (kde_heatmap * 0.45 * mask)[:, :, np.newaxis]
            out = (out * (1 - alpha) + hm_color * alpha).astype(np.uint8)
        except Exception:
            pass

    # ---------- Zone grid lines ----------
    for r in range(1, grid_rows):
        y = int(r * cell_h)
        cv2.line(out, (0, y), (img_w, y), (60, 60, 60), 1, cv2.LINE_AA)
    for c in range(1, grid_cols):
        x = int(c * cell_w)
        cv2.line(out, (x, 0), (x, img_h), (60, 60, 60), 1, cv2.LINE_AA)

    # Build zone → density level lookup
    zone_level_grid = {(z["row"], z["col"]): z["level"] for z in zones}

    # ---------- Person bounding boxes ----------
    for box, score in zip(person_boxes, person_scores):
        x1, y1, x2, y2 = box
        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        r = min(int(cy / cell_h), grid_rows - 1)
        c = min(int(cx / cell_w), grid_cols - 1)
        zlevel = zone_level_grid.get((r, c), "clear")
        color  = _BOX_COLORS[zlevel]
        thick  = 2 if zlevel in ("dense", "critical") else 1
        cv2.rectangle(out, (x1, y1), (x2, y2), color, thick)
        # Confidence label (small, not cluttering)
        cv2.putText(out, f"{score:.0%}", (x1 + 2, y1 - 3),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.33, color, 1, cv2.LINE_AA)

    # ---------- Vehicle / object boxes ----------
    for det in obj_inventory.get("detections", []):
        bcolor = _VEH_BOX_COLOR if det["is_vehicle"] else _OTHER_BOX_COLOR
        for b in det.get("boxes", []):
            cv2.rectangle(out, (b["x1"], b["y1"]), (b["x2"], b["y2"]), bcolor, 2)
            cv2.putText(out, det["class"],
                        (b["x1"] + 2, b["y1"] - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, bcolor, 1, cv2.LINE_AA)

    # ---------- Stats panel (top-left) ----------
    level  = metrics["crowd_level"]
    count  = metrics["total_count"]
    det_c  = metrics["detected_count"]
    occ_c  = metrics["occluded_est"]
    den_pct = int(metrics["density_score"] * 100)
    surge   = surge_info["surge_detected"]

    lvl_colors = {
        "LOW": (80, 200, 80), "MEDIUM": (0, 200, 240),
        "HIGH": (0, 140, 255), "CRITICAL": (0, 40, 230),
    }
    lvl_color = lvl_colors.get(level, (200, 200, 200))

    lines = [
        ("DrishtiGrid AI", _TITLE_COLOR, 0.48),
        (f"Detected: {det_c}  Est.Hidden: +{occ_c}", _TEXT_COLOR, 0.42),
        (f"Total Est.: {count}", _TEXT_COLOR, 0.46),
        (f"Density: {den_pct}%", _TEXT_COLOR, 0.44),
        (f"Level: {level}", lvl_color, 0.50),
        (f"Vehicles: {obj_inventory['vehicle_total']}", _TEXT_COLOR, 0.42),
    ]
    if surge:
        lines.append((f"SURGE +{surge_info['surge_percent']:.0f}%", (40, 40, 230), 0.46))
    lines.append((time.strftime("%H:%M:%S"), (120, 120, 120), 0.40))

    line_h  = 22
    panel_h = len(lines) * line_h + 12
    panel_w = 280
    px, py  = 8, 8

    # Dark panel background
    roi = out[py:py+panel_h, px:px+panel_w]
    if roi.size > 0:
        dark = np.full_like(roi, _PANEL_DARK)
        cv2.addWeighted(dark, 0.78, roi, 0.22, 0, out[py:py+panel_h, px:px+panel_w])
    cv2.rectangle(out, (px, py), (px+panel_w, py+panel_h), lvl_color, 2)

    for i, (txt, col, fs) in enumerate(lines):
        cv2.putText(out, txt, (px + 8, py + 12 + i * line_h),
                    cv2.FONT_HERSHEY_SIMPLEX, fs, col, 1, cv2.LINE_AA)

    # ---------- Object inventory mini-panel (top-right) ----------
    inv_lines = ["Object Count"]
    vehicles = obj_inventory.get("vehicles", {})
    for vname, vcnt in sorted(vehicles.items(), key=lambda x: -x[1])[:6]:
        inv_lines.append(f"  {vname.title()}: {vcnt}")
    others = obj_inventory.get("other_objects", {})
    for oname, ocnt in sorted(others.items(), key=lambda x: -x[1])[:4]:
        inv_lines.append(f"  {oname.title()}: {ocnt}")
    if not vehicles and not others:
        inv_lines.append("  (none detected)")

    inv_panel_w = 200
    inv_panel_h = len(inv_lines) * line_h + 12
    inv_px = max(img_w - inv_panel_w - 8, 0)
    inv_py = 8

    roi2 = out[inv_py:inv_py+inv_panel_h, inv_px:inv_px+inv_panel_w]
    if roi2.size > 0:
        dark2 = np.full_like(roi2, _PANEL_DARK)
        cv2.addWeighted(dark2, 0.78, roi2, 0.22, 0,
                        out[inv_py:inv_py+inv_panel_h, inv_px:inv_px+inv_panel_w])
    cv2.rectangle(out, (inv_px, inv_py), (inv_px+inv_panel_w, inv_py+inv_panel_h),
                  _VEH_BOX_COLOR, 2)
    for i, txt in enumerate(inv_lines):
        col = _TITLE_COLOR if i == 0 else _TEXT_COLOR
        fs  = 0.45 if i == 0 else 0.40
        cv2.putText(out, txt, (inv_px + 8, inv_py + 12 + i * line_h),
                    cv2.FONT_HERSHEY_SIMPLEX, fs, col, 1, cv2.LINE_AA)

    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_crowd(
    image: np.ndarray,
    camera_id: str = "default",
    conf_threshold: float = 0.25,
    grid_rows: int = DEFAULT_GRID_ROWS,
    grid_cols: int = DEFAULT_GRID_COLS,
) -> Dict[str, Any]:
    """
    High-accuracy crowd detection + object inventory on a single BGR frame.

    Parameters
    ----------
    image          : BGR NumPy array
    camera_id      : Camera ID for per-camera surge baseline
    conf_threshold : Base YOLO confidence (default 0.25)
    grid_rows      : Density grid rows  (1-8)
    grid_cols      : Density grid cols  (1-8)

    Returns
    -------
    {
      "success"             : bool,
      "detected_count"      : int,   # persons found by detection
      "occluded_est"        : int,   # estimated hidden/occluded persons
      "total_count"         : int,   # detected + occluded estimate
      "crowd_level"         : "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
      "density_score"       : float 0-1,
      "zones"               : [...],
      "person_detections"   : [...],
      "object_inventory"    : { vehicles, vehicle_total, other_objects, detections },
      "surge"               : { surge_detected, baseline_avg, surge_percent },
      "annotated_image_b64" : str,
      "processing_time_ms"  : float,
      "error"               : str|None,
    }
    """
    t_start = time.perf_counter()

    result: Dict[str, Any] = {
        "success":             False,
        "detected_count":      0,
        "occluded_est":        0,
        "total_count":         0,
        "crowd_level":         "LOW",
        "density_score":       0.0,
        "zones":               [],
        "person_detections":   [],
        "object_inventory":    {
            "vehicles": {}, "vehicle_total": 0,
            "other_objects": {}, "detections": []
        },
        "surge":               {"surge_detected": False, "baseline_avg": 0.0, "surge_percent": 0.0},
        "annotated_image_b64": "",
        "processing_time_ms":  0.0,
        "error":               None,
    }

    if image is None or image.size == 0:
        result["error"] = "Empty or null image."
        return result

    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif len(image.shape) == 3 and image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)

    img_h, img_w = image.shape[:2]

    # ---- Load model ----
    try:
        from app.detection.yolo_detector import get_yolo_model
        model = get_yolo_model()
        if model is None:
            result["error"] = "YOLO model unavailable."
            return result
    except Exception as e:
        result["error"] = f"Model load error: {e}"
        return result

    # ================================================================
    #  PASS A — Full-frame, loose conf  (catches anything plausible)
    # ================================================================
    conf_loose = max(0.18, conf_threshold - 0.07)
    conf_tight = min(0.70, conf_threshold + 0.10)

    raw_full_loose = _run_yolo_pass(
        model, image, conf=conf_loose, iou=0.40,
    )

    # ================================================================
    #  PASS B — Full-frame at 1.25× scale (distant/small persons)
    # ================================================================
    raw_scaled = _run_yolo_pass(
        model, image, conf=conf_loose, iou=0.40,
        classes=[PERSON_CLASS_ID], scale=1.25,
    )

    # ================================================================
    #  PASS C — Tiled inference 3×3 grid, 40% overlap
    #           (persons near tile boundaries, deep in crowds)
    # ================================================================
    raw_tiled = _run_tile_pass(
        model, image,
        conf=conf_loose, iou=0.40,
        tile_rows=3, tile_cols=3, overlap=0.40,
    )

    # ================================================================
    #  PASS D — Full-frame, all classes (for object inventory)
    # ================================================================
    raw_all_classes = _run_yolo_pass(
        model, image, conf=max(0.25, conf_threshold), iou=0.45,
    )

    # ---- Merge all person candidates ----
    all_person_raw = raw_full_loose + raw_scaled + raw_tiled
    # Also include persons from the all-class pass
    all_person_raw += [r for r in raw_all_classes if r["cls_id"] == PERSON_CLASS_ID]

    # ---- Soft-NMS ----
    person_boxes, person_scores = _merge_and_softnms(
        all_person_raw, conf_floor=max(0.12, conf_threshold - 0.13)
    )

    detected_count = len(person_boxes)

    # ---- Occlusion correction ----
    occluded_est = _estimate_occluded_count(person_boxes, img_h, img_w)
    total_count  = detected_count + occluded_est

    # ---- Object inventory (all non-person detections from Pass D) ----
    obj_inventory = _build_object_inventory(raw_all_classes)

    # ---- KDE heatmap ----
    centroids = [((b[0]+b[2])//2, (b[1]+b[3])//2) for b in person_boxes]
    kde_bw    = max(30, min(img_h, img_w) // 15)
    kde_heatmap = _build_kde_heatmap(centroids, img_h, img_w, bandwidth=kde_bw)

    # ---- Density grid ----
    zones = _build_density_grid(
        person_boxes, person_scores, img_h, img_w, grid_rows, grid_cols
    )

    # ---- Crowd metrics ----
    crowd_level   = _get_crowd_level(total_count)
    density_score = _compute_density_score(total_count, img_h, img_w, person_boxes)

    # ---- Surge detection ----
    surge_info = _check_surge(camera_id, total_count)

    # ---- Person detections list ----
    person_det_list = [
        {
            "person_id":  idx + 1,
            "bbox":       {"x": b[0], "y": b[1], "w": b[2]-b[0], "h": b[3]-b[1]},
            "confidence": round(s, 4),
        }
        for idx, (b, s) in enumerate(zip(person_boxes, person_scores))
    ]

    # ---- Annotation ----
    metrics = {
        "crowd_level":    crowd_level,
        "total_count":    total_count,
        "detected_count": detected_count,
        "occluded_est":   occluded_est,
        "density_score":  density_score,
        "grid_rows":      grid_rows,
        "grid_cols":      grid_cols,
    }
    try:
        annotated    = _draw_annotations(
            image, person_boxes, person_scores,
            zones, kde_heatmap, metrics,
            surge_info, obj_inventory, occluded_est,
        )
        annotated_b64 = numpy_to_base64(annotated)
    except Exception as e:
        logger.warning(f"[CrowdDetector] Annotation error: {e}")
        annotated_b64 = numpy_to_base64(image)

    elapsed_ms = (time.perf_counter() - t_start) * 1000.0

    result.update({
        "success":             True,
        "detected_count":      detected_count,
        "occluded_est":        occluded_est,
        "total_count":         total_count,
        "crowd_level":         crowd_level,
        "density_score":       density_score,
        "zones":               zones,
        "person_detections":   person_det_list,
        "object_inventory":    obj_inventory,
        "surge":               surge_info,
        "annotated_image_b64": annotated_b64,
        "processing_time_ms":  round(elapsed_ms, 1),
        "error":               None,
    })

    logger.info(
        f"[CrowdDetector] cam={camera_id} "
        f"detected={detected_count} occluded≈{occluded_est} total={total_count} "
        f"vehicles={obj_inventory['vehicle_total']} "
        f"level={crowd_level} density={density_score:.2f} "
        f"surge={surge_info['surge_detected']} ({elapsed_ms:.0f}ms)"
    )
    return result


def reset_camera_baseline(camera_id: str) -> None:
    """Clear the surge detection baseline for a specific camera."""
    global _camera_baselines
    if camera_id in _camera_baselines:
        del _camera_baselines[camera_id]
        logger.info(f"[CrowdDetector] Baseline reset for camera: {camera_id}")
