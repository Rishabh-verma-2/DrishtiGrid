"""
Crowd Detection & Density Analysis Module — High-Accuracy Ensemble Edition
==========================================================================

Government-grade crowd detection system combining:
1. Specialized CrowdHuman YOLO model (trained specifically on dense, heavily occluded crowds).
2. Dedicated Crowd Head YOLO model (resolves people whose bodies are occluded by crowds or obstacles).
3. Sliced Multi-Scale Tile Inference (SAHI-style) for resolving distant/small pedestrians in high-res CCTV frames.
4. Dual-Modal Spatial Fusion (merges body and head detections without double counting).
5. Strict Confidence Enforcement (only counts individuals with confidence >= 15%).
6. Auxiliary COCO Model for vehicles and scene object inventory.
7. Spatial Density Grid and Rolling Surge Baseline tracking.
"""

import logging
import time
from collections import deque, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

from app.config.settings import MODEL_CONFIG
from app.utils.image_utils import numpy_to_base64

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# COCO class catalogue
# ---------------------------------------------------------------------------
PERSON_CLASS_ID = 0

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

VEHICLE_CLASS_IDS = {1, 2, 3, 5, 6, 7, 8}

# ---------------------------------------------------------------------------
# Crowd level thresholds
# ---------------------------------------------------------------------------
CROWD_THRESHOLDS = {
    "LOW":       0,    # 0–9
    "MEDIUM":   10,    # 10–29
    "HIGH":     30,    # 30–59
    "CRITICAL": 60,    # 60+
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

# Per-camera baselines
_camera_baselines: Dict[str, deque] = {}

# Cached models
_crowd_person_model: Optional[YOLO] = None
_crowd_head_model: Optional[YOLO] = None
_coco_vehicle_model: Optional[YOLO] = None


def _get_device() -> str:
    try:
        import torch
        if MODEL_CONFIG.get("USE_GPU", True) and torch.cuda.is_available():
            return "0"
    except Exception:
        pass
    return "cpu"


def get_crowd_person_model() -> YOLO:
    global _crowd_person_model
    if _crowd_person_model is None:
        weights_path = Path(__file__).resolve().parent.parent.parent / "model_weights" / "crowdhuman_yolov8n.pt"
        if weights_path.exists():
            _crowd_person_model = YOLO(str(weights_path))
            logger.info(f"[CrowdDetector] Loaded CrowdHuman person model from {weights_path}")
        else:
            from app.detection.yolo_detector import get_coco_model, get_yolo_model
            _crowd_person_model = get_coco_model() or get_yolo_model()
            logger.warning("[CrowdDetector] Using fallback YOLO model for crowd person detection")
    return _crowd_person_model


def get_crowd_head_model() -> Optional[YOLO]:
    global _crowd_head_model
    if _crowd_head_model is None:
        weights_path = Path(__file__).resolve().parent.parent.parent / "model_weights" / "crowd_head_yolov8n.pt"
        if weights_path.exists():
            _crowd_head_model = YOLO(str(weights_path))
            logger.info(f"[CrowdDetector] Loaded Crowd Head model from {weights_path}")
        else:
            logger.warning("[CrowdDetector] Crowd head weights not found, head detection pass skipped")
    return _crowd_head_model


def get_coco_vehicle_model() -> Optional[YOLO]:
    global _coco_vehicle_model
    if _coco_vehicle_model is None:
        from app.detection.yolo_detector import get_coco_model, get_yolo_model
        _coco_vehicle_model = get_coco_model() or get_yolo_model()
    return _coco_vehicle_model


# ---------------------------------------------------------------------------
# Density grid
# ---------------------------------------------------------------------------
def _build_density_grid(
    boxes: List[Tuple[int, int, int, int]],
    img_h: int,
    img_w: int,
    grid_rows: int = DEFAULT_GRID_ROWS,
    grid_cols: int = DEFAULT_GRID_COLS,
) -> List[Dict]:
    """Partition frame into grid; count persons per cell using box centroids."""
    cell_h = img_h / max(1, grid_rows)
    cell_w = img_w / max(1, grid_cols)
    grid = [[0] * grid_cols for _ in range(grid_rows)]

    for b in boxes:
        cx = (b[0] + b[2]) // 2
        cy = (b[1] + b[3]) // 2
        r = min(int(cy / cell_h), grid_rows - 1)
        c = min(int(cx / cell_w), grid_cols - 1)
        grid[r][c] += 1

    zones: List[Dict] = []
    for r in range(grid_rows):
        for c in range(grid_cols):
            cnt = grid[r][c]
            if cnt >= ZONE_THRESHOLDS["critical"]:
                level = "critical"
            elif cnt >= ZONE_THRESHOLDS["dense"]:
                level = "dense"
            elif cnt >= ZONE_THRESHOLDS["moderate"]:
                level = "moderate"
            else:
                level = "clear"
            zones.append({
                "row": r,
                "col": c,
                "count": cnt,
                "level": level,
                "bbox": {
                    "x": int(c * cell_w),
                    "y": int(r * cell_h),
                    "w": int(cell_w),
                    "h": int(cell_h),
                },
            })
    return zones


# ---------------------------------------------------------------------------
# Surge detection
# ---------------------------------------------------------------------------
def _check_surge(camera_id: str, current_count: int) -> Dict[str, Any]:
    global _camera_baselines
    if camera_id not in _camera_baselines:
        _camera_baselines[camera_id] = deque(maxlen=BASELINE_WINDOW_SIZE)

    window = _camera_baselines[camera_id]
    surge_detected = False
    baseline_avg = 0.0
    surge_percent = 0.0

    if len(window) >= 5:
        baseline_avg = float(np.mean(list(window)))
        if baseline_avg > 0:
            surge_percent = ((current_count - baseline_avg) / baseline_avg) * 100.0
            surge_detected = surge_percent >= SURGE_THRESHOLD_PERCENT

    window.append(current_count)
    return {
        "surge_detected": surge_detected,
        "baseline_avg": round(baseline_avg, 1),
        "surge_percent": round(surge_percent, 1),
    }


# ---------------------------------------------------------------------------
# Vehicle / object inventory
# ---------------------------------------------------------------------------
def _build_object_inventory(image: np.ndarray, conf_thresh: float = 0.25) -> Dict[str, Any]:
    """Detect non-person objects (vehicles, infrastructure) using COCO model."""
    empty_inv = {
        "vehicles": {},
        "vehicle_total": 0,
        "other_objects": {},
        "detections": [],
    }
    model = get_coco_vehicle_model()
    if model is None:
        return empty_inv

    try:
        results = model(
            image,
            conf=conf_thresh,
            iou=0.45,
            device=_get_device(),
            verbose=False,
            imgsz=640,
        )
        if not results or results[0].boxes is None:
            return empty_inv

        class_counts: Dict[int, int] = defaultdict(int)
        class_boxes: Dict[int, List] = defaultdict(list)

        for box in results[0].boxes:
            if box.cls is None or len(box.cls) == 0:
                continue
            cid = int(box.cls[0].item())
            if cid == PERSON_CLASS_ID:
                continue  # Skip persons, handled by specialized crowd model

            conf_val = float(box.conf[0].item()) if box.conf is not None else conf_thresh
            xyxy = box.xyxy[0].cpu().numpy().astype(int)
            class_counts[cid] += 1
            class_boxes[cid].append({
                "x1": int(xyxy[0]),
                "y1": int(xyxy[1]),
                "x2": int(xyxy[2]),
                "y2": int(xyxy[3]),
                "conf": round(conf_val, 3),
            })

        vehicles: Dict[str, int] = {}
        other: Dict[str, int] = {}

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
                "class": name,
                "class_id": cid,
                "count": cnt,
                "is_vehicle": cid in VEHICLE_CLASS_IDS,
                "boxes": class_boxes[cid][:20],
            })

        return {
            "vehicles": vehicles,
            "vehicle_total": sum(vehicles.values()),
            "other_objects": other,
            "detections": detections_list,
        }
    except Exception as e:
        logger.warning(f"[CrowdDetector] Object inventory error: {e}")
        return empty_inv


# ---------------------------------------------------------------------------
# Visual annotations
# ---------------------------------------------------------------------------
def _draw_annotations(
    image: np.ndarray,
    detections: List[Dict[str, Any]],
    crowd_level: str,
    total_count: int,
    body_count: int,
    head_count: int,
    grid_rows: int = DEFAULT_GRID_ROWS,
    grid_cols: int = DEFAULT_GRID_COLS,
) -> np.ndarray:
    """Produce clean, government-grade annotated visualization frame."""
    out = image.copy()
    img_h, img_w = out.shape[:2]

    # Subtle zone grid lines
    if grid_rows > 1 and grid_cols > 1:
        cell_h = img_h / max(1, grid_rows)
        cell_w = img_w / max(1, grid_cols)
        for r in range(1, grid_rows):
            y = int(r * cell_h)
            cv2.line(out, (0, y), (img_w, y), (35, 40, 50), 1, cv2.LINE_AA)
        for c in range(1, grid_cols):
            x = int(c * cell_w)
            cv2.line(out, (x, 0), (x, img_h), (35, 40, 50), 1, cv2.LINE_AA)

    # Color tokens
    BODY_BOX_COLOR = (0, 230, 115)      # Emerald green for full person
    HEAD_BOX_COLOR = (0, 195, 255)      # Amber / Gold for occluded head
    PILL_BG_COLOR  = (15, 20, 30)       # Dark pill background

    for det in detections:
        x = det["bbox"]["x"]
        y = det["bbox"]["y"]
        w = det["bbox"]["w"]
        h = det["bbox"]["h"]
        pid = det["person_id"]
        score = det["confidence"]
        det_type = det.get("type", "body")

        x1 = max(0, min(img_w - 1, x))
        y1 = max(0, min(img_h - 1, y))
        x2 = max(0, min(img_w, x + w))
        y2 = max(0, min(img_h, y + h))

        if det_type == "head_visible":
            color = HEAD_BOX_COLOR
            label = f"#{pid} Head {score:.0%}"
        else:
            color = BODY_BOX_COLOR
            label = f"#{pid} {score:.0%}"

        # Bounding box
        thickness = 2 if max(img_w, img_h) >= 1200 else 1
        cv2.rectangle(out, (x1, y1), (x2, y2), color, thickness)

        # Label pill
        font_scale = 0.38 if max(img_w, img_h) < 1000 else 0.44
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
        tag_y1 = max(0, y1 - th - 5)
        tag_y2 = y1
        tag_x1 = x1
        tag_x2 = min(img_w, x1 + tw + 6)

        cv2.rectangle(out, (tag_x1, tag_y1), (tag_x2, tag_y2), PILL_BG_COLOR, -1)
        cv2.rectangle(out, (tag_x1, tag_y1), (tag_x2, tag_y2), color, 1)
        cv2.putText(
            out, label, (tag_x1 + 3, tag_y2 - 3),
            cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), 1, cv2.LINE_AA
        )

    # Tactical Top Banner
    lvl_colors = {
        "ZERO": (160, 160, 160),
        "LOW": (80, 200, 80),
        "MODERATE": (0, 210, 240),
        "HIGH": (0, 140, 255),
        "CRITICAL": (0, 40, 235),
    }
    status_color = lvl_colors.get(crowd_level, (0, 200, 120))

    banner_h = 42
    banner_w = min(img_w, 640)
    if banner_w > 160 and img_h > banner_h:
        overlay = out[0:banner_h, 0:banner_w].copy()
        cv2.rectangle(overlay, (0, 0), (banner_w, banner_h), (10, 14, 22), -1)
        cv2.addWeighted(overlay, 0.88, out[0:banner_h, 0:banner_w], 0.12, 0, out[0:banner_h, 0:banner_w])
        cv2.rectangle(out, (0, 0), (banner_w, banner_h), status_color, 2)

        main_text = f"PEOPLE COUNT: {total_count}"
        breakdown_text = f"({body_count} Body + {head_count} Head-Occluded)" if head_count > 0 else "All Bodies"
        status_text = f"DENSITY: {crowd_level}"

        cv2.putText(out, main_text, (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(out, breakdown_text, (205, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (180, 200, 220), 1, cv2.LINE_AA)
        cv2.putText(out, status_text, (banner_w - 145, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.48, status_color, 1, cv2.LINE_AA)

    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def detect_crowd(
    image: np.ndarray,
    camera_id: str = "default",
    conf_threshold: float = 0.15,
    grid_rows: int = DEFAULT_GRID_ROWS,
    grid_cols: int = DEFAULT_GRID_COLS,
    roi: Optional[Any] = None,
    perspective_zones: Optional[List[Dict[str, Any]]] = None,
    is_video: bool = False,
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Government-Grade High-Accuracy Crowd Detection & Density Analysis.
    Upgraded with multi-pass tiled inference, class filtering, geometric sanity
    validation, cross-source deduplication, anatomical head-body association,
    optional ROI filtering, and temporal stabilization.

    Parameters
    ----------
    image             : BGR NumPy array
    camera_id         : Unique camera identifier for surge baseline & temporal tracking
    conf_threshold    : Minimum candidate confidence threshold (default 0.15 / 15%)
    grid_rows         : Density grid row divisions (default 4)
    grid_cols         : Density grid column divisions (default 4)
    roi               : Optional camera ROI ([x1,y1,x2,y2] or [[x1,y1],...])
    perspective_zones : Optional perspective zones configuration
    is_video          : Enable temporal stabilization across sequential video frames
    debug             : Include pipeline diagnostics (debug_info) in response

    Returns
    -------
    Structured JSON with exact people count, detected individuals, density level,
    object inventory, surge tracking, annotated image, and optional debug_info.
    """
    from app.detection.crowd_postprocess import (
        filter_person_class,
        validate_bbox_geometry,
        deduplicate_detections,
        associate_heads_to_bodies,
        apply_roi_filter,
        assign_zones,
        compute_crowd_level,
        compute_density_score,
        get_camera_tracker,
        reset_camera_tracker,
        CROWD_MIN_CONF,
    )

    t_start = time.perf_counter()

    result: Dict[str, Any] = {
        "success": False,
        "detected_count": 0,
        "occluded_est": 0,
        "total_count": 0,
        "crowd_level": "ZERO",
        "density_score": 0.0,
        "zones": [],
        "person_detections": [],
        "object_inventory": {
            "vehicles": {},
            "vehicle_total": 0,
            "other_objects": {},
            "detections": [],
        },
        "surge": {"surge_detected": False, "baseline_avg": 0.0, "surge_percent": 0.0},
        "annotated_image_b64": "",
        "processing_time_ms": 0.0,
        "error": None,
    }

    if image is None or image.size == 0:
        result["error"] = "Empty or null image provided."
        return result

    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif len(image.shape) == 3 and image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)

    img_h, img_w = image.shape[:2]

    # Enforce minimum 15% confidence threshold as strictly required
    target_conf = max(CROWD_MIN_CONF, min(0.85, float(conf_threshold)))
    device = _get_device()

    # Load specialized models
    try:
        m_person = get_crowd_person_model()
        m_head = get_crowd_head_model()
    except Exception as e:
        logger.error(f"[CrowdDetector] Failed to load crowd models: {e}")
        result["error"] = f"Model load error: {e}"
        return result

    raw_body_cands: List[Dict[str, Any]] = []
    raw_head_cands: List[Dict[str, Any]] = []

    debug_tracker: Dict[str, Any] = {
        "raw_detections": 0,
        "person_candidates": 0,
        "head_candidates": 0,
        "geometry_valid": 0,
        "tile_detections": 0,
        "merged_detections": 0,
        "head_body_matches": 0,
        "unmatched_heads": 0,
        "validated_persons": 0,
        "rejected": {
            "non_person": 0,
            "too_small": 0,
            "too_large": 0,
            "bad_aspect_ratio": 0,
            "low_confidence_invalid": 0,
            "duplicate": 0,
            "head_body_duplicate": 0,
            "outside_roi": 0,
            "perspective_mismatch": 0,
        },
    }

    try:
        # Dynamic high-resolution inference size
        max_dim = max(img_w, img_h)
        infer_imgsz = 1280 if max_dim >= 1000 else (960 if max_dim >= 640 else 640)

        # Check if m_person has COCO classes (where class 0 is person)
        is_coco_model = hasattr(m_person, "names") and len(m_person.names) > 10
        classes_filter = [0] if is_coco_model else None

        # -------------------------------------------------------------------
        # Pass 1: Full-Frame Person Detection (with strict class filtering)
        # -------------------------------------------------------------------
        res_p = m_person(
            image,
            conf=target_conf,
            iou=0.50,
            classes=classes_filter,
            max_det=3000,
            imgsz=infer_imgsz,
            device=device,
            verbose=False,
        )
        if res_p and len(res_p) > 0 and res_p[0].boxes is not None:
            for b in res_p[0].boxes:
                xyxy = b.xyxy[0].cpu().numpy().astype(float)
                c_val = float(b.conf[0].item()) if b.conf is not None else target_conf
                cls_id = int(b.cls[0].item()) if b.cls is not None else 0
                if c_val >= CROWD_MIN_CONF:
                    raw_body_cands.append({
                        "box": [float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])],
                        "confidence": c_val,
                        "class_id": cls_id,
                        "source": "full_frame",
                        "type": "body",
                    })

        # -------------------------------------------------------------------
        # Pass 2: Full-Frame Crowd Head Detection (if model available)
        # -------------------------------------------------------------------
        if m_head is not None:
            res_h = m_head(
                image,
                conf=target_conf,
                iou=0.45,
                max_det=3000,
                imgsz=infer_imgsz,
                device=device,
                verbose=False,
            )
            if res_h and len(res_h) > 0 and res_h[0].boxes is not None:
                for b in res_h[0].boxes:
                    xyxy = b.xyxy[0].cpu().numpy().astype(float)
                    c_val = float(b.conf[0].item()) if b.conf is not None else target_conf
                    cls_id = int(b.cls[0].item()) if b.cls is not None else 0
                    if c_val >= CROWD_MIN_CONF:
                        raw_head_cands.append({
                            "box": [float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])],
                            "confidence": c_val,
                            "class_id": cls_id,
                            "source": "head_model",
                            "type": "head_visible",
                        })

        # -------------------------------------------------------------------
        # Pass 3: Sliced Overlapping Tile Inference for Small/Distant People
        # -------------------------------------------------------------------
        tile_det_count = 0
        if img_w >= 800 and img_h >= 480:
            tile_w = int(img_w * 0.58)
            tile_h = int(img_h * 0.58)
            tiles = []
            offsets = []
            for ty in [0, img_h - tile_h]:
                for tx in [0, img_w - tile_w]:
                    crop = image[ty : ty + tile_h, tx : tx + tile_w]
                    tiles.append(crop)
                    offsets.append((tx, ty))

            # Batch infer tiles
            p_tiles = m_person(
                tiles,
                conf=target_conf,
                iou=0.50,
                classes=classes_filter,
                max_det=1000,
                imgsz=640,
                device=device,
                verbose=False,
            )
            for idx, res in enumerate(p_tiles):
                ox, oy = offsets[idx]
                if res.boxes is not None:
                    for b in res.boxes:
                        xyxy = b.xyxy[0].cpu().numpy().astype(float)
                        c_val = float(b.conf[0].item()) if b.conf is not None else target_conf
                        cls_id = int(b.cls[0].item()) if b.cls is not None else 0
                        if c_val >= CROWD_MIN_CONF:
                            tile_det_count += 1
                            raw_body_cands.append({
                                "box": [float(xyxy[0] + ox), float(xyxy[1] + oy), float(xyxy[2] + ox), float(xyxy[3] + oy)],
                                "confidence": c_val,
                                "class_id": cls_id,
                                "source": f"tile_{idx}",
                                "type": "body",
                            })

            if m_head is not None:
                h_tiles = m_head(
                    tiles,
                    conf=target_conf,
                    iou=0.45,
                    max_det=1000,
                    imgsz=640,
                    device=device,
                    verbose=False,
                )
                for idx, res in enumerate(h_tiles):
                    ox, oy = offsets[idx]
                    if res.boxes is not None:
                        for b in res.boxes:
                            xyxy = b.xyxy[0].cpu().numpy().astype(float)
                            c_val = float(b.conf[0].item()) if b.conf is not None else target_conf
                            cls_id = int(b.cls[0].item()) if b.cls is not None else 0
                            if c_val >= CROWD_MIN_CONF:
                                raw_head_cands.append({
                                    "box": [float(xyxy[0] + ox), float(xyxy[1] + oy), float(xyxy[2] + ox), float(xyxy[3] + oy)],
                                    "confidence": c_val,
                                    "class_id": cls_id,
                                    "source": f"head_tile_{idx}",
                                    "type": "head_visible",
                                })

        debug_tracker["raw_detections"] = len(raw_body_cands) + len(raw_head_cands)
        debug_tracker["person_candidates"] = len(raw_body_cands)
        debug_tracker["head_candidates"] = len(raw_head_cands)
        debug_tracker["tile_detections"] = tile_det_count

    except Exception as e:
        logger.error(f"[CrowdDetector] Inference pass error: {e}")
        result["error"] = f"YOLO inference error: {e}"
        return result

    # -----------------------------------------------------------------------
    # Pass 4: Defensive Class Filtering (Phase 3)
    # -----------------------------------------------------------------------
    person_candidates = filter_person_class(raw_body_cands, expected_class_id=0, debug_tracker=debug_tracker)

    # -----------------------------------------------------------------------
    # Pass 5: Bounding Box Geometry Sanity Validation (Phase 4)
    # -----------------------------------------------------------------------
    valid_bodies: List[Dict[str, Any]] = []
    for cand in person_candidates:
        is_valid, _ = validate_bbox_geometry(
            candidate=cand,
            img_w=img_w,
            img_h=img_h,
            perspective_zones=perspective_zones,
            debug_tracker=debug_tracker,
        )
        if is_valid:
            valid_bodies.append(cand)

    valid_heads: List[Dict[str, Any]] = []
    for cand in raw_head_cands:
        is_valid, _ = validate_bbox_geometry(
            candidate=cand,
            img_w=img_w,
            img_h=img_h,
            perspective_zones=perspective_zones,
            debug_tracker=debug_tracker,
        )
        if is_valid:
            valid_heads.append(cand)

    debug_tracker["geometry_valid"] = len(valid_bodies) + len(valid_heads)

    # -----------------------------------------------------------------------
    # Pass 6: Cross-Tile & Cross-Source Deduplication (Phase 6)
    # -----------------------------------------------------------------------
    merged_bodies = deduplicate_detections(valid_bodies, debug_tracker=debug_tracker)
    debug_tracker["merged_detections"] = len(merged_bodies)

    # -----------------------------------------------------------------------
    # Pass 7: Anatomical Head-to-Body Association (Phase 7)
    # -----------------------------------------------------------------------
    final_bodies, unmatched_heads = associate_heads_to_bodies(
        body_detections=merged_bodies,
        head_detections=valid_heads,
        debug_tracker=debug_tracker,
    )

    # -----------------------------------------------------------------------
    # Pass 8: Optional ROI Filtering (Phase 8)
    # -----------------------------------------------------------------------
    if roi is not None:
        final_bodies = apply_roi_filter(final_bodies, roi=roi, img_w=img_w, img_h=img_h, debug_tracker=debug_tracker)
        unmatched_heads = apply_roi_filter(unmatched_heads, roi=roi, img_w=img_w, img_h=img_h, debug_tracker=debug_tracker)

    # -----------------------------------------------------------------------
    # Pass 9: Assemble Final Validated Detections List
    # -----------------------------------------------------------------------
    validated_raw: List[Dict[str, Any]] = []
    for b in final_bodies:
        b["type"] = "body"
        validated_raw.append(b)
    for h in unmatched_heads:
        h["type"] = "head_visible"
        validated_raw.append(h)

    # Sort spatially (top-to-bottom, left-to-right)
    validated_raw.sort(key=lambda d: ((d["box"][1] // 30), d["box"][0]))

    detected_count = len(final_bodies)
    occluded_est = len(unmatched_heads)
    total_count = detected_count + occluded_est
    debug_tracker["validated_persons"] = total_count

    # -----------------------------------------------------------------------
    # Pass 10: Video Temporal Stabilization & Tracking (Phase 13 & 14)
    # -----------------------------------------------------------------------
    tracker = get_camera_tracker(camera_id)
    stabilized_detections, stabilized_count, surge_info = tracker.update(
        detections=validated_raw,
        raw_count=total_count,
    )

    if is_video and stabilized_count != total_count and total_count > 0:
        scale_factor = stabilized_count / float(total_count)
        detected_count = int(round(len(final_bodies) * scale_factor))
        occluded_est = max(0, stabilized_count - detected_count)
        total_count = detected_count + occluded_est

    # -----------------------------------------------------------------------
    # Pass 11: Zone Assignment & Mathematical Consistency (Phase 11 & 12)
    # -----------------------------------------------------------------------
    zones = assign_zones(stabilized_detections, img_h, img_w, grid_rows, grid_cols)
    density_score = compute_density_score(stabilized_detections, img_w, img_h, total_count)
    crowd_level = compute_crowd_level(total_count)

    # Format person_detections for API
    formatted_detections: List[Dict[str, Any]] = []
    for idx, p in enumerate(stabilized_detections, start=1):
        bx1, by1, bx2, by2 = p["box"]
        conf_f = float(p.get("confidence", 0.15))
        formatted_detections.append({
            "id": idx,
            "person_id": idx,
            "type": p.get("type", "body"),
            "confidence": round(conf_f, 4),
            "confidence_percent": f"{conf_f * 100:.1f}%",
            "bbox": {
                "x": int(round(bx1)),
                "y": int(round(by1)),
                "w": int(round(max(1.0, bx2 - bx1))),
                "h": int(round(max(1.0, by2 - by1))),
            },
            "center": {
                "x": int(round((bx1 + bx2) / 2.0)),
                "y": int(round((by1 + by2) / 2.0)),
            },
            "track_id": p.get("track_id"),
        })

    # Object inventory (vehicles, other objects)
    obj_inventory = _build_object_inventory(image, conf_thresh=0.25)

    # -----------------------------------------------------------------------
    # Pass 12: Visual Annotations (Phase 21)
    # -----------------------------------------------------------------------
    try:
        annotated = _draw_annotations(
            image=image,
            detections=formatted_detections,
            crowd_level=crowd_level,
            total_count=total_count,
            body_count=detected_count,
            head_count=occluded_est,
            grid_rows=grid_rows,
            grid_cols=grid_cols,
        )
        annotated_b64 = numpy_to_base64(annotated)
    except Exception as draw_err:
        logger.warning(f"[CrowdDetector] Annotation drawing error: {draw_err}")
        annotated_b64 = numpy_to_base64(image)

    elapsed_ms = (time.perf_counter() - t_start) * 1000.0

    result.update({
        "success": True,
        "detected_count": int(detected_count),
        "occluded_est": int(occluded_est),
        "total_count": int(total_count),
        "crowd_level": crowd_level,
        "density_score": float(density_score),
        "zones": zones,
        "person_detections": formatted_detections,
        "object_inventory": obj_inventory,
        "surge": surge_info,
        "annotated_image_b64": annotated_b64,
        "processing_time_ms": round(float(elapsed_ms), 1),
        "error": None,
    })

    if debug:
        result["debug_info"] = debug_tracker

    logger.info(
        f"[CrowdDetector] cam='{camera_id}' EXACT_COUNT={total_count} "
        f"(body={detected_count}, occluded_heads={occluded_est}) "
        f"level={crowd_level} time={elapsed_ms:.1f}ms"
    )
    return result


def reset_camera_baseline(camera_id: str) -> None:
    """Clear the surge detection baseline and temporal tracker for a specific camera."""
    global _camera_baselines
    if camera_id in _camera_baselines:
        del _camera_baselines[camera_id]
    from app.detection.crowd_postprocess import reset_camera_tracker
    reset_camera_tracker(camera_id)
    logger.info(f"[CrowdDetector] Baseline and tracker reset for camera: {camera_id}")

