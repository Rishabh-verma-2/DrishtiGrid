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
) -> Dict[str, Any]:
    """
    Government-Grade High-Accuracy Crowd Detection & Density Analysis.

    Parameters
    ----------
    image          : BGR NumPy array
    camera_id      : Unique camera identifier for surge baseline tracking
    conf_threshold : Minimum confidence threshold (default 0.15 / 15%)
    grid_rows      : Density grid row divisions (default 4)
    grid_cols      : Density grid column divisions (default 4)

    Returns
    -------
    Structured JSON with exact people count, detected individuals, density level,
    object inventory, surge tracking, and annotated image.
    """
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

    # Enforce minimum 15% confidence threshold as requested
    target_conf = max(0.15, min(0.85, float(conf_threshold)))
    device = _get_device()

    # Load specialized models
    try:
        m_person = get_crowd_person_model()
        m_head = get_crowd_head_model()
    except Exception as e:
        logger.error(f"[CrowdDetector] Failed to load crowd models: {e}")
        result["error"] = f"Model load error: {e}"
        return result

    raw_persons: List[List[float]] = []
    raw_heads: List[List[float]] = []

    try:
        # Dynamic high-resolution inference size
        max_dim = max(img_w, img_h)
        infer_imgsz = 1280 if max_dim >= 1000 else (960 if max_dim >= 640 else 640)

        # -------------------------------------------------------------------
        # Pass 1: Full-Frame CrowdHuman Person Detection
        # -------------------------------------------------------------------
        res_p = m_person(
            image,
            conf=target_conf,
            iou=0.50,
            max_det=3000,
            imgsz=infer_imgsz,
            device=device,
            verbose=False,
        )
        if res_p and len(res_p) > 0 and res_p[0].boxes is not None:
            for b in res_p.boxes:
                xyxy = b.xyxy[0].cpu().numpy().astype(float)
                c_val = float(b.conf[0].item()) if b.conf is not None else target_conf
                if c_val >= 0.15:
                    raw_persons.append([xyxy[0], xyxy[1], xyxy[2], xyxy[3], c_val])

        # -------------------------------------------------------------------
        # Pass 2: Full-Frame Crowd Head Detection
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
                for b in res_h.boxes:
                    xyxy = b.xyxy[0].cpu().numpy().astype(float)
                    c_val = float(b.conf[0].item()) if b.conf is not None else target_conf
                    if c_val >= 0.15:
                        raw_heads.append([xyxy[0], xyxy[1], xyxy[2], xyxy[3], c_val])

        # -------------------------------------------------------------------
        # Pass 3: Sliced Tile Inference for High-Resolution Scenes
        # -------------------------------------------------------------------
        if img_w >= 800 and img_h >= 480:
            tile_w = int(img_w * 0.60)
            tile_h = int(img_h * 0.60)
            tiles = []
            offsets = []
            for ty in [0, img_h - tile_h]:
                for tx in [0, img_w - tile_w]:
                    crop = image[ty:ty + tile_h, tx:tx + tile_w]
                    tiles.append(crop)
                    offsets.append((tx, ty))

            # Batch infer tiles
            p_tiles = m_person(
                tiles,
                conf=target_conf,
                iou=0.50,
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
                        if c_val >= 0.15:
                            raw_persons.append([xyxy[0] + ox, xyxy[1] + oy, xyxy[2] + ox, xyxy[3] + oy, c_val])

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
                            if c_val >= 0.15:
                                raw_heads.append([xyxy[0] + ox, xyxy[1] + oy, xyxy[2] + ox, xyxy[3] + oy, c_val])

    except Exception as e:
        logger.error(f"[CrowdDetector] Inference pass error: {e}")
        result["error"] = f"YOLO inference error: {e}"
        return result

    # -----------------------------------------------------------------------
    # Pass 4: NMS Deduplication per category
    # -----------------------------------------------------------------------
    # Deduplicate persons
    final_persons: List[Tuple[int, int, int, int, float]] = []
    if raw_persons:
        p_xywh = []
        p_scores = []
        for b in raw_persons:
            bx1 = max(0, min(int(b[0]), img_w - 1))
            by1 = max(0, min(int(b[1]), img_h - 1))
            bx2 = max(bx1 + 1, min(int(b[2]), img_w))
            by2 = max(by1 + 1, min(int(b[3]), img_h))
            pw = bx2 - bx1
            ph = by2 - by1
            if pw >= 5 and ph >= 8:
                p_xywh.append([bx1, by1, pw, ph])
                p_scores.append(float(b[4]))

        if p_xywh:
            nms_p = cv2.dnn.NMSBoxes(p_xywh, p_scores, score_threshold=target_conf, nms_threshold=0.45)
            if len(nms_p) > 0:
                for idx in nms_p.flatten():
                    bw = p_xywh[idx]
                    final_persons.append((bw[0], bw[1], bw[0] + bw[2], bw[1] + bw[3], p_scores[idx]))

    # Deduplicate heads
    final_heads: List[Tuple[int, int, int, int, float]] = []
    if raw_heads:
        h_xywh = []
        h_scores = []
        for b in raw_heads:
            bx1 = max(0, min(int(b[0]), img_w - 1))
            by1 = max(0, min(int(b[1]), img_h - 1))
            bx2 = max(bx1 + 1, min(int(b[2]), img_w))
            by2 = max(by1 + 1, min(int(b[3]), img_h))
            hw = bx2 - bx1
            hh = by2 - by1
            if hw >= 4 and hh >= 4:
                h_xywh.append([bx1, by1, hw, hh])
                h_scores.append(float(b[4]))

        if h_xywh:
            nms_h = cv2.dnn.NMSBoxes(h_xywh, h_scores, score_threshold=target_conf, nms_threshold=0.40)
            if len(nms_h) > 0:
                for idx in nms_h.flatten():
                    bw = h_xywh[idx]
                    final_heads.append((bw[0], bw[1], bw[0] + bw[2], bw[1] + bw[3], h_scores[idx]))

    # -----------------------------------------------------------------------
    # Pass 5: Dual-Modal Spatial Association & Occlusion Resolution
    # -----------------------------------------------------------------------
    # For every detected head, check if it falls inside an already-detected person body.
    # If not, it represents an occluded person in the dense crowd!
    unmatched_heads: List[Tuple[int, int, int, int, float]] = []
    for hx1, hy1, hx2, hy2, hconf in final_heads:
        hcx = (hx1 + hx2) / 2
        hcy = (hy1 + hy2) / 2
        # Check containment inside any body box
        inside_body = any(
            px1 <= hcx <= px2 and py1 <= hcy <= py2
            for px1, py1, px2, py2, _ in final_persons
        )
        if not inside_body:
            unmatched_heads.append((hx1, hy1, hx2, hy2, hconf))

    # -----------------------------------------------------------------------
    # Pass 6: Assemble Final Detections List
    # -----------------------------------------------------------------------
    combined_detections: List[Dict[str, Any]] = []

    # Add full-body detections
    for x1, y1, x2, y2, score in final_persons:
        if score >= 0.15:
            combined_detections.append({
                "type": "body",
                "confidence": round(float(score), 4),
                "bbox": {"x": int(x1), "y": int(y1), "w": int(x2 - x1), "h": int(y2 - y1)},
                "center": {"x": int((x1 + x2) // 2), "y": int((y1 + y2) // 2)},
                "sort_key": (y1 // 30, x1),
            })

    # Add head-only occluded persons
    for x1, y1, x2, y2, score in unmatched_heads:
        if score >= 0.15:
            combined_detections.append({
                "type": "head_visible",
                "confidence": round(float(score), 4),
                "bbox": {"x": int(x1), "y": int(y1), "w": int(x2 - x1), "h": int(y2 - y1)},
                "center": {"x": int((x1 + x2) // 2), "y": int((y1 + y2) // 2)},
                "sort_key": (y1 // 30, x1),
            })

    # Sort spatially (top-to-bottom, left-to-right)
    combined_detections.sort(key=lambda d: d["sort_key"])

    # Re-index
    for idx, d in enumerate(combined_detections, start=1):
        d["id"] = idx
        d["person_id"] = idx
        d["confidence_percent"] = f"{d['confidence'] * 100:.1f}%"
        del d["sort_key"]

    # Calculate exact counts
    total_count = len(combined_detections)
    detected_count = total_count
    body_count = sum(1 for d in combined_detections if d["type"] == "body")
    head_count = sum(1 for d in combined_detections if d["type"] == "head_visible")

    # Determine crowd level
    if total_count == 0:
        crowd_level = "ZERO"
    elif total_count <= 4:
        crowd_level = "LOW"
    elif total_count <= 15:
        crowd_level = "MODERATE"
    elif total_count <= 40:
        crowd_level = "HIGH"
    else:
        crowd_level = "CRITICAL"

    # Normalized density score
    total_box_area = sum(d["bbox"]["w"] * d["bbox"]["h"] for d in combined_detections)
    frame_area = max(1, img_h * img_w)
    density_score = round(min(1.0, float(total_box_area / frame_area * 1.5) + (total_count / 120.0)), 2)

    # -----------------------------------------------------------------------
    # Pass 7: Density Grid & Object Inventory
    # -----------------------------------------------------------------------
    all_boxes_tuples = [
        (d["bbox"]["x"], d["bbox"]["y"], d["bbox"]["x"] + d["bbox"]["w"], d["bbox"]["y"] + d["bbox"]["h"])
        for d in combined_detections
    ]
    zones = _build_density_grid(all_boxes_tuples, img_h, img_w, grid_rows, grid_cols)

    # Object inventory (vehicles, other objects)
    obj_inventory = _build_object_inventory(image, conf_thresh=0.25)

    # Surge detection
    surge_info = _check_surge(camera_id, total_count)

    # -----------------------------------------------------------------------
    # Pass 8: Visual Annotations
    # -----------------------------------------------------------------------
    try:
        annotated = _draw_annotations(
            image=image,
            detections=combined_detections,
            crowd_level=crowd_level,
            total_count=total_count,
            body_count=body_count,
            head_count=head_count,
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
        "occluded_est": int(head_count),
        "total_count": int(total_count),
        "crowd_level": crowd_level,
        "density_score": float(density_score),
        "zones": zones,
        "person_detections": combined_detections,
        "object_inventory": obj_inventory,
        "surge": surge_info,
        "annotated_image_b64": annotated_b64,
        "processing_time_ms": round(float(elapsed_ms), 1),
        "error": None,
    })

    logger.info(
        f"[CrowdDetector] cam='{camera_id}' EXACT_COUNT={total_count} "
        f"(body={body_count}, occluded_heads={head_count}) "
        f"level={crowd_level} time={elapsed_ms:.1f}ms"
    )
    return result


def reset_camera_baseline(camera_id: str) -> None:
    """Clear the surge detection baseline for a specific camera."""
    global _camera_baselines
    if camera_id in _camera_baselines:
        del _camera_baselines[camera_id]
        logger.info(f"[CrowdDetector] Baseline reset for camera: {camera_id}")
