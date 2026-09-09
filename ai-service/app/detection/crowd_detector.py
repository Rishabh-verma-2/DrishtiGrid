"""
Crowd Detection & Density Analysis Module — High-Accuracy Ensemble Edition
==========================================================================

Government-grade crowd counting & density analysis system combining:
1. Full-frame YOLO person detection (dynamic imgsz).
2. Dedicated crowd head detection (resolves occluded individuals).
3. Configurable sliding-window multi-scale tiled inference (guaranteed 100% spatial coverage).
4. Adaptive dense-region identification & targeted refinement.
5. Pluggable crowd density estimation (model abstraction with calibrated fallback).
6. Scoring-based Hungarian bipartite head-to-body association.
7. Contextual validation profiles (NORMAL, SMALL, OCCLUDED, HEAD_ONLY, EDGE_TRUNCATED).
8. Source-aware cross-tile deduplication with local density protection.
9. Confidence-aware multi-signal hybrid count fusion exposing explicit uncertainty.
10. Video temporal tracking with hysteresis (strictly bypassed for still images).
11. Clean government-dashboard visual annotations.
"""

from __future__ import annotations

import logging
import time
from collections import deque, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

from app.config.settings import MODEL_CONFIG
from app.utils.image_utils import numpy_to_base64
from app.detection.crowd_density import get_density_estimator
from app.detection.crowd_tiling import (
    generate_sliding_window_tiles,
    analyze_frame_regions,
    generate_dense_region_tiles,
    CROWD_TILE_OVERLAP,
    CROWD_TILE_IMGSZ,
    CROWD_MAX_TILES,
)
from app.detection.crowd_postprocess import (
    filter_person_class,
    validate_candidate_profile,
    validate_bbox_geometry,
    deduplicate_detections,
    associate_heads_to_bodies,
    apply_roi_filter,
    fuse_crowd_estimates,
    assign_zones,
    compute_crowd_level,
    compute_density_score,
    get_camera_tracker,
    reset_camera_tracker,
    CROWD_MIN_CONF,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# COCO class catalog
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
    "LOW":       0,
    "MEDIUM":   10,
    "HIGH":     30,
    "CRITICAL": 60,
}

DEFAULT_GRID_ROWS = 4
DEFAULT_GRID_COLS = 4

# Cached models
_crowd_person_model: Optional[Any] = None
_crowd_head_model: Optional[Any] = None
_coco_vehicle_model: Optional[Any] = None


def _get_device() -> str:
    try:
        import torch
        if MODEL_CONFIG.get("USE_GPU", True) and torch.cuda.is_available():
            return "0"
    except Exception:
        pass
    return "cpu"


def get_crowd_person_model() -> Optional[Any]:
    global _crowd_person_model
    if _crowd_person_model is None:
        if YOLO is None:
            logger.warning("[CrowdDetector] ultralytics not installed; YOLO models unavailable")
            return None
        weights_path = Path(__file__).resolve().parent.parent.parent / "model_weights" / "crowdhuman_yolov8n.pt"
        if weights_path.exists():
            _crowd_person_model = YOLO(str(weights_path))
            logger.info(f"[CrowdDetector] Loaded CrowdHuman person model from {weights_path}")
        else:
            try:
                from app.detection.yolo_detector import get_coco_model, get_yolo_model
                _crowd_person_model = get_coco_model() or get_yolo_model()
                logger.info("[CrowdDetector] Using primary YOLO model for crowd person detection")
            except Exception as e:
                logger.warning(f"[CrowdDetector] Could not load fallback YOLO model: {e}")
    return _crowd_person_model


def get_crowd_head_model() -> Optional[Any]:
    global _crowd_head_model
    if _crowd_head_model is None:
        if YOLO is None:
            return None
        weights_path = Path(__file__).resolve().parent.parent.parent / "model_weights" / "crowd_head_yolov8n.pt"
        if weights_path.exists():
            _crowd_head_model = YOLO(str(weights_path))
            logger.info(f"[CrowdDetector] Loaded Crowd Head model from {weights_path}")
        else:
            logger.debug("[CrowdDetector] Crowd head weights not found, head detection pass skipped")
    return _crowd_head_model


def get_coco_vehicle_model() -> Optional[Any]:
    global _coco_vehicle_model
    if _coco_vehicle_model is None:
        if YOLO is None:
            return None
        try:
            from app.detection.yolo_detector import get_coco_model, get_yolo_model
            _coco_vehicle_model = get_coco_model() or get_yolo_model()
        except Exception:
            pass
    return _coco_vehicle_model


# ---------------------------------------------------------------------------
# Object Inventory (Vehicles / Scene Objects)
# ---------------------------------------------------------------------------
def _build_object_inventory(image: np.ndarray, conf_thresh: float = 0.25) -> Dict[str, Any]:
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
                continue

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
# Visual Annotations — Government Dashboard Styling
# ---------------------------------------------------------------------------
def _draw_crowd_annotations(
    image: np.ndarray,
    detections: List[Dict[str, Any]],
    crowd_level: str,
    total_count: int,
    body_count: int,
    head_count: int,
    uncertainty: int,
    fused_confidence: float,
    estimation_method: str,
    dense_regions: Optional[List[Dict[str, Any]]] = None,
    grid_rows: int = DEFAULT_GRID_ROWS,
    grid_cols: int = DEFAULT_GRID_COLS,
) -> np.ndarray:
    """Produce clean, government-grade annotated visualization frame."""
    out = image.copy()
    img_h, img_w = out.shape[:2]

    # 1. Subtle zone grid lines
    if grid_rows > 1 and grid_cols > 1:
        cell_h = img_h / max(1, grid_rows)
        cell_w = img_w / max(1, grid_cols)
        for r in range(1, grid_rows):
            y = int(r * cell_h)
            cv2.line(out, (0, y), (img_w, y), (30, 36, 45), 1, cv2.LINE_AA)
        for c in range(1, grid_cols):
            x = int(c * cell_w)
            cv2.line(out, (x, 0), (x, img_h), (30, 36, 45), 1, cv2.LINE_AA)

    # 2. Dense region highlights (cyan dashed / translucent boundary)
    if dense_regions:
        for dr in dense_regions:
            if dr.get("is_suspicious", False):
                rx1, ry1, rx2, ry2 = [int(v) for v in dr["bbox"]]
                cv2.rectangle(out, (rx1, ry1), (rx2, ry2), (235, 206, 0), 1, cv2.LINE_AA)

    # 3. Person bounding boxes
    BODY_BOX_COLOR = (0, 230, 115)      # Emerald green for full body
    HEAD_BOX_COLOR = (0, 195, 255)      # Amber gold for occluded head
    PILL_BG_COLOR  = (15, 20, 30)       # Tactical dark pill background

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

        thickness = 2 if max(img_w, img_h) >= 1200 else 1
        cv2.rectangle(out, (x1, y1), (x2, y2), color, thickness)

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

    # 4. Tactical Top Banner
    lvl_colors = {
        "ZERO": (160, 160, 160),
        "LOW": (80, 200, 80),
        "MODERATE": (0, 210, 240),
        "HIGH": (0, 140, 255),
        "CRITICAL": (0, 40, 235),
    }
    status_color = lvl_colors.get(crowd_level, (0, 200, 120))

    banner_h = 44
    banner_w = min(img_w, 720)
    if banner_w > 180 and img_h > banner_h:
        overlay = out[0:banner_h, 0:banner_w].copy()
        cv2.rectangle(overlay, (0, 0), (banner_w, banner_h), (12, 16, 24), -1)
        cv2.addWeighted(overlay, 0.90, out[0:banner_h, 0:banner_w], 0.10, 0, out[0:banner_h, 0:banner_w])
        cv2.rectangle(out, (0, 0), (banner_w, banner_h), status_color, 2)

        uncert_str = f"±{uncertainty}" if uncertainty > 0 else ""
        main_text = f"PEOPLE COUNT: {total_count} {uncert_str}".strip()
        breakdown_text = f"({body_count} Body + {head_count} Head-Occluded)" if head_count > 0 else "All Bodies"
        status_text = f"{crowd_level} | {fused_confidence:.0%}"

        cv2.putText(out, main_text, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(out, breakdown_text, (banner_w - 380, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (180, 200, 220), 1, cv2.LINE_AA)
        cv2.putText(out, status_text, (banner_w - 145, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.48, status_color, 1, cv2.LINE_AA)

    return out


# ---------------------------------------------------------------------------
# Public API: detect_crowd
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
    enable_tiles: bool = True,
    tile_overlap: float = CROWD_TILE_OVERLAP,
    use_density: bool = True,
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Government-Grade High-Accuracy Crowd Detection, Counting & Density Analysis.
    Integrates multi-scale sliding window tiling, dense-region refinement,
    crowd density estimation, Hungarian bipartite association, and hybrid fusion.
    """
    t_start = time.perf_counter()

    timing: Dict[str, float] = {
        "full_frame_ms": 0.0,
        "tile_inference_ms": 0.0,
        "head_inference_ms": 0.0,
        "dense_region_ms": 0.0,
        "density_inference_ms": 0.0,
        "fusion_ms": 0.0,
        "total_ms": 0.0,
    }

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
        # Upgraded fields
        "quality": {},
        "timing": timing,
        "count_breakdown": {},
        "dense_regions": [],
    }

    if image is None or image.size == 0:
        result["error"] = "Empty or null image provided."
        return result

    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif len(image.shape) == 3 and image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)

    img_h, img_w = image.shape[:2]
    target_conf = max(CROWD_MIN_CONF, min(0.85, float(conf_threshold)))
    device = _get_device()

    m_person = get_crowd_person_model()
    m_head = get_crowd_head_model()
    density_estimator = get_density_estimator() if use_density else None

    raw_body_cands: List[Dict[str, Any]] = []
    raw_head_cands: List[Dict[str, Any]] = []

    debug_tracker: Dict[str, Any] = {
        "raw_detections": 0,
        "person_candidates": 0,
        "head_candidates": 0,
        "geometry_valid": 0,
        "tile_detections": 0,
        "dense_refinement_detections": 0,
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

    max_dim = max(img_w, img_h)
    infer_imgsz = 1280 if max_dim >= 1000 else (960 if max_dim >= 640 else 640)
    is_coco_model = hasattr(m_person, "names") and len(m_person.names) > 10 if m_person else False
    classes_filter = [0] if is_coco_model else None

    # -----------------------------------------------------------------------
    # Pass A: Full-Frame Person Detection
    # -----------------------------------------------------------------------
    t_ff_start = time.perf_counter()
    if m_person is not None:
        try:
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
        except Exception as e:
            logger.warning(f"[CrowdDetector] Full-frame person inference error: {e}")
    timing["full_frame_ms"] = round((time.perf_counter() - t_ff_start) * 1000, 1)

    # -----------------------------------------------------------------------
    # Pass B: Full-Frame Head Detection (if available)
    # -----------------------------------------------------------------------
    t_head_start = time.perf_counter()
    if m_head is not None:
        try:
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
        except Exception as e:
            logger.warning(f"[CrowdDetector] Head inference error: {e}")
    timing["head_inference_ms"] = round((time.perf_counter() - t_head_start) * 1000, 1)

    # -----------------------------------------------------------------------
    # Pass C: Sliding-Window Multi-Scale Tiling (Complete Spatial Coverage)
    # -----------------------------------------------------------------------
    t_tile_start = time.perf_counter()
    tile_detections_count = 0
    if enable_tiles and m_person is not None and (img_w >= 640 or img_h >= 480):
        tiles = generate_sliding_window_tiles(
            img_w=img_w,
            img_h=img_h,
            overlap=tile_overlap,
            max_tiles=CROWD_MAX_TILES,
        )
        if tiles:
            tile_images = [t.crop(image) for t in tiles]
            try:
                p_tiles = m_person(
                    tile_images,
                    conf=target_conf,
                    iou=0.50,
                    classes=classes_filter,
                    max_det=1500,
                    imgsz=CROWD_TILE_IMGSZ,
                    device=device,
                    verbose=False,
                )
                for t_idx, t_res in enumerate(p_tiles):
                    if t_res.boxes is None:
                        continue
                    tile_obj = tiles[t_idx]
                    for b in t_res.boxes:
                        local_xyxy = b.xyxy[0].cpu().numpy().astype(float)
                        c_val = float(b.conf[0].item()) if b.conf is not None else target_conf
                        cls_id = int(b.cls[0].item()) if b.cls is not None else 0
                        if c_val >= CROWD_MIN_CONF:
                            global_box = tile_obj.project_box_to_global(local_xyxy)
                            raw_body_cands.append({
                                "box": global_box,
                                "confidence": c_val,
                                "class_id": cls_id,
                                "source": tile_obj.tile_id,
                                "type": "body",
                            })
                            tile_detections_count += 1
            except Exception as e:
                logger.warning(f"[CrowdDetector] Tile batch inference error: {e}")
    debug_tracker["tile_detections"] = tile_detections_count
    timing["tile_inference_ms"] = round((time.perf_counter() - t_tile_start) * 1000, 1)

    # -----------------------------------------------------------------------
    # Pass D: Adaptive Dense-Region Refinement
    # -----------------------------------------------------------------------
    t_dense_start = time.perf_counter()
    dense_regions = analyze_frame_regions(
        body_detections=raw_body_cands,
        head_detections=raw_head_cands,
        img_w=img_w,
        img_h=img_h,
    )
    result["dense_regions"] = [r for r in dense_regions if r.get("is_suspicious", False)]

    dense_refine_count = 0
    if m_person is not None and any(r.get("is_suspicious", False) for r in dense_regions):
        dense_crops = generate_dense_region_tiles(dense_regions, img_w, img_h)
        if dense_crops:
            crop_imgs = [dc.crop(image) for dc in dense_crops]
            try:
                res_dense = m_person(
                    crop_imgs,
                    conf=target_conf,
                    iou=0.45,
                    classes=classes_filter,
                    max_det=2000,
                    imgsz=640,
                    device=device,
                    verbose=False,
                )
                for dc_idx, dc_res in enumerate(res_dense):
                    if dc_res.boxes is None:
                        continue
                    crop_obj = dense_crops[dc_idx]
                    for b in dc_res.boxes:
                        local_xyxy = b.xyxy[0].cpu().numpy().astype(float)
                        c_val = float(b.conf[0].item()) if b.conf is not None else target_conf
                        cls_id = int(b.cls[0].item()) if b.cls is not None else 0
                        if c_val >= CROWD_MIN_CONF:
                            global_box = crop_obj.project_box_to_global(local_xyxy)
                            raw_body_cands.append({
                                "box": global_box,
                                "confidence": c_val,
                                "class_id": cls_id,
                                "source": crop_obj.tile_id,
                                "type": "body",
                                "multi_pass": True,
                            })
                            dense_refine_count += 1
            except Exception as e:
                logger.warning(f"[CrowdDetector] Dense region refinement error: {e}")
    debug_tracker["dense_refinement_detections"] = dense_refine_count
    timing["dense_region_ms"] = round((time.perf_counter() - t_dense_start) * 1000, 1)

    # -----------------------------------------------------------------------
    # Pass E: Crowd Density Estimation Fallback
    # -----------------------------------------------------------------------
    t_density_start = time.perf_counter()
    density_map = np.zeros((10, 10), dtype=np.float32)
    density_count = 0.0
    density_conf = 0.0
    if density_estimator is not None:
        try:
            density_map, density_count, density_conf = density_estimator.estimate(
                image=image,
                head_candidates=raw_head_cands,
                body_candidates=raw_body_cands,
            )
        except Exception as e:
            logger.warning(f"[CrowdDetector] Density estimation error: {e}")
    timing["density_inference_ms"] = round((time.perf_counter() - t_density_start) * 1000, 1)

    # -----------------------------------------------------------------------
    # Post-Processing: Filtering, Profile Validation, Deduplication & Association
    # -----------------------------------------------------------------------
    t_fuse_start = time.perf_counter()

    debug_tracker["raw_detections"] = len(raw_body_cands) + len(raw_head_cands)

    # 1. Defensive class filtering
    filtered_bodies = filter_person_class(raw_body_cands, expected_class_id=0, debug_tracker=debug_tracker)
    debug_tracker["person_candidates"] = len(filtered_bodies)
    debug_tracker["head_candidates"] = len(raw_head_cands)

    # 2. Contextual Profile Validation
    valid_bodies: List[Dict[str, Any]] = []
    for c in filtered_bodies:
        is_valid, profile, reason = validate_candidate_profile(
            c, img_w, img_h, perspective_zones, debug_tracker
        )
        if is_valid:
            c["profile"] = profile
            valid_bodies.append(c)

    valid_heads: List[Dict[str, Any]] = []
    for h in raw_head_cands:
        is_valid, profile, reason = validate_candidate_profile(
            h, img_w, img_h, perspective_zones, debug_tracker
        )
        if is_valid:
            h["profile"] = profile
            valid_heads.append(h)

    debug_tracker["geometry_valid"] = len(valid_bodies) + len(valid_heads)

    # 3. Source-Aware Cross-Tile Deduplication
    deduped_bodies = deduplicate_detections(
        valid_bodies,
        local_density_awareness=True,
        debug_tracker=debug_tracker,
    )
    debug_tracker["merged_detections"] = len(deduped_bodies)

    # 4. Optimal Bipartite Hungarian Head-to-Body Association
    bodies, unmatched_heads = associate_heads_to_bodies(
        body_detections=deduped_bodies,
        head_detections=valid_heads,
        debug_tracker=debug_tracker,
    )

    combined_detections = bodies + unmatched_heads

    # 5. ROI spatial filtering
    final_candidates = apply_roi_filter(
        combined_detections, roi=roi, img_w=img_w, img_h=img_h, debug_tracker=debug_tracker
    )
    debug_tracker["validated_persons"] = len(final_candidates)

    detector_body_cnt = sum(1 for d in final_candidates if d.get("type", "body") == "body")
    unmatched_head_cnt = sum(1 for d in final_candidates if d.get("type") == "head_visible")

    # Overlap statistics
    suspicious_count = len(result["dense_regions"])
    overlap_ratio = 0.0
    if len(final_candidates) > 1:
        pairs = 0
        for i in range(len(final_candidates)):
            for j in range(i + 1, len(final_candidates)):
                if compute_box_iou(final_candidates[i]["box"], final_candidates[j]["box"]) > 0.15:
                    pairs += 1
        total_pairs = (len(final_candidates) * (len(final_candidates) - 1)) / 2.0
        overlap_ratio = pairs / max(1.0, total_pairs)

    # 6. Hybrid Count Fusion
    fusion_result = fuse_crowd_estimates(
        detector_body_count=detector_body_cnt,
        unmatched_head_count=unmatched_head_cnt,
        density_estimated_count=density_count,
        density_confidence=density_conf,
        overlap_ratio=overlap_ratio,
        suspicious_dense_regions_count=suspicious_count,
    )

    # Assign IDs and format boxes
    person_list: List[Dict[str, Any]] = []
    for idx, cand in enumerate(final_candidates, start=1):
        x1, y1, x2, y2 = cand["box"]
        person_list.append({
            "person_id": idx,
            "bbox": {
                "x": max(0, int(round(x1))),
                "y": max(0, int(round(y1))),
                "w": max(1, int(round(x2 - x1))),
                "h": max(1, int(round(y2 - y1))),
            },
            "confidence": round(float(cand.get("confidence", 0.0)), 3),
            "type": cand.get("type", "body"),
            "profile": cand.get("profile", "NORMAL_PERSON"),
        })

    # 7. Video Temporal Tracking vs Still Image Mode
    raw_total_count = len(person_list)
    surge_info = {"surge_detected": False, "baseline_avg": 0.0, "surge_percent": 0.0}

    if is_video:
        tracker = get_camera_tracker(camera_id)
        tracked_dets, stabilized_count, surge_info = tracker.update(
            detections=final_candidates,
            raw_count=raw_total_count,
        )
        final_person_count = stabilized_count
    else:
        # Still-image mode: strictly deterministic, independent of historical counts
        final_person_count = raw_total_count

    # 8. Zones & Density Score (Exact Consistency Guarantee)
    zones = assign_zones(final_candidates, img_h=img_h, img_w=img_w, grid_rows=grid_rows, grid_cols=grid_cols)
    crowd_level = compute_crowd_level(final_person_count)
    density_score = compute_density_score(final_candidates, img_w=img_w, img_h=img_h, total_count=final_person_count)

    timing["fusion_ms"] = round((time.perf_counter() - t_fuse_start) * 1000, 1)

    # 9. Non-person Object Inventory
    object_inventory = _build_object_inventory(image)

    # 10. Visual Annotation
    annotated_frame = _draw_crowd_annotations(
        image=image,
        detections=person_list,
        crowd_level=crowd_level,
        total_count=final_person_count,
        body_count=detector_body_cnt,
        head_count=unmatched_head_cnt,
        uncertainty=fusion_result["uncertainty"],
        fused_confidence=fusion_result["fused_confidence"],
        estimation_method=fusion_result["estimation_method"],
        dense_regions=result["dense_regions"],
        grid_rows=grid_rows,
        grid_cols=grid_cols,
    )
    annotated_b64 = numpy_to_base64(annotated_frame)

    timing["total_ms"] = round((time.perf_counter() - t_start) * 1000, 1)

    # Populate final result object (maintaining full backward compatibility)
    result.update({
        "success": True,
        "detected_count": detector_body_cnt,
        "occluded_est": unmatched_head_cnt,
        "total_count": final_person_count,
        "crowd_level": crowd_level,
        "density_score": density_score,
        "zones": zones,
        "person_detections": person_list,
        "object_inventory": object_inventory,
        "surge": surge_info,
        "annotated_image_b64": annotated_b64,
        "processing_time_ms": timing["total_ms"],
        "timing": timing,
        "quality": {
            "quality": fusion_result["quality"],
            "confidence": fusion_result["fused_confidence"],
            "uncertainty": fusion_result["uncertainty"],
            "uncertainty_range": fusion_result["uncertainty_range"],
            "estimation_method": fusion_result["estimation_method"],
            "detector_recall_warning": fusion_result["detector_recall_warning"],
            "dense_region_count": len(result["dense_regions"]),
        },
        "count_breakdown": {
            "bodies": detector_body_cnt,
            "heads_occluded": unmatched_head_cnt,
            "density_estimate": fusion_result["density_count"],
        },
        "error": None,
    })

    if debug:
        result["debug_info"] = debug_tracker

    return result
