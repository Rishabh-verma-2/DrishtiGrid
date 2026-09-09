"""
Crowd Detection Post-Processing, Spatial Fusion & Temporal Engine
================================================================

Modular post-processing pipeline for DrishtiGrid crowd counting.
Responsible for:
1. Class filtering (ensuring only human/person detections enter candidate pool)
2. Bounding-box sanity and perspective-aware geometry validation
3. Cross-tile and full-frame deduplication and fusion (IoU, IoMin/containment, centroid distance)
4. Anatomical head-to-body association (eliminates double counting)
5. Optional Camera ROI (polygon or rectangle) spatial filtering
6. Image-space zone assignment guaranteeing exact mathematical consistency
7. Lightweight temporal tracking and count stabilization with alert hysteresis
8. Comprehensive pipeline diagnostics and rejection tracking (debug_info)
"""

from __future__ import annotations
import math
import logging
from collections import deque
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default Configuration Thresholds
# ---------------------------------------------------------------------------
# Minimum confidence floor (strictly preserved as 0.15)
CROWD_MIN_CONF: float = 0.15

# Low-confidence band where stricter validation is applied
LOW_CONF_CEILING: float = 0.25

# Standard human bounding box aspect ratio (height / width)
# Typical upright person ~1.8–3.5, seated/crouched ~1.0–1.8, perspective skew ~0.7–5.5
DEFAULT_ASPECT_RATIO_RANGE: Tuple[float, float] = (0.70, 5.50)

# Stricter aspect ratio for low-confidence candidates (0.15 <= conf < 0.25)
STRICT_ASPECT_RATIO_RANGE: Tuple[float, float] = (0.85, 4.80)

# Scale bounds relative to frame and absolute
MIN_PERSON_ABS_WIDTH: float = 5.0
MIN_PERSON_ABS_HEIGHT: float = 10.0
MIN_PERSON_ABS_AREA: float = 50.0  # px^2 (allows distant tiny pedestrians)

MAX_RELATIVE_WIDTH: float = 0.95
MAX_RELATIVE_HEIGHT: float = 0.95
MAX_RELATIVE_AREA: float = 0.85

# Cross-source / Cross-tile Deduplication Thresholds
DEDUP_IOU_THRESH: float = 0.35
DEDUP_IOMIN_THRESH: float = 0.65  # Containment threshold
DEDUP_CENTROID_NORM_DIST: float = 0.30

# Anatomical Head-to-Body Association Parameters
HEAD_UPPER_BODY_RATIO: float = 0.45  # Head center must be within top 45% of body
HEAD_MAX_WIDTH_RATIO: float = 0.80   # Head width cannot exceed 80% of body width
HEAD_MAX_HORIZ_OFFSET: float = 0.35  # Centroid horizontal distance <= 35% of body width
HEAD_ASPECT_RATIO_RANGE: Tuple[float, float] = (0.45, 2.00)
HEAD_MIN_CONF_UNMATCHED: float = 0.20 # Higher threshold to promote unassociated head to person

# Temporal Tracking & Count Smoothing
TRACKER_MAX_DISAPPEARED: int = 5
TRACKER_DIST_THRESH: float = 80.0    # pixel distance for frame-to-frame association
TEMPORAL_WINDOW_SIZE: int = 7
SURGE_HYSTERESIS_CONSECUTIVE_RAISE: int = 3
SURGE_HYSTERESIS_CONSECUTIVE_CLEAR: int = 4

# Person class ID in COCO
COCO_PERSON_CLASS_ID: int = 0


# ---------------------------------------------------------------------------
# Geometry & Overlap Helpers
# ---------------------------------------------------------------------------

def compute_box_iou(box1: Sequence[float], box2: Sequence[float]) -> float:
    """Compute Intersection-over-Union between two (x1, y1, x2, y2) boxes."""
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])

    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    inter_area = inter_w * inter_h
    if inter_area <= 0.0:
        return 0.0

    area1 = max(0.0, (box1[2] - box1[0]) * (box1[3] - box1[1]))
    area2 = max(0.0, (box2[2] - box2[0]) * (box2[3] - box2[1]))
    union_area = area1 + area2 - inter_area
    if union_area <= 0.0:
        return 0.0

    return float(inter_area / union_area)


def compute_box_iomin(box1: Sequence[float], box2: Sequence[float]) -> float:
    """Compute Intersection-over-Minimum-Area (Containment index)."""
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])

    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    inter_area = inter_w * inter_h
    if inter_area <= 0.0:
        return 0.0

    area1 = max(1.0, (box1[2] - box1[0]) * (box1[3] - box1[1]))
    area2 = max(1.0, (box2[2] - box2[0]) * (box2[3] - box2[1]))
    min_area = min(area1, area2)
    return float(inter_area / min_area)


def point_in_polygon(x: float, y: float, polygon: List[Tuple[float, float]]) -> bool:
    """Ray-casting algorithm to test if point (x, y) is inside polygon vertices."""
    n = len(polygon)
    if n < 3:
        return True  # Degenerate polygon treated as no restriction
    inside = False
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


# ---------------------------------------------------------------------------
# Phase 3 & 4: Candidate Filtering & Geometry Validation
# ---------------------------------------------------------------------------

def filter_person_class(
    raw_detections: List[Dict[str, Any]],
    expected_class_id: int = COCO_PERSON_CLASS_ID,
    debug_tracker: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Phase 3: Defensive Class Filtering.
    Only allows detections corresponding to the person class (class_id == 0).
    Rejects vehicles, chairs, luggage, animals, etc.
    """
    person_candidates: List[Dict[str, Any]] = []
    for det in raw_detections:
        cid = det.get("class_id", expected_class_id)
        if cid == expected_class_id:
            person_candidates.append(det)
        else:
            if debug_tracker is not None:
                debug_tracker["rejected"]["non_person"] = debug_tracker["rejected"].get("non_person", 0) + 1
    return person_candidates


def validate_bbox_geometry(
    candidate: Dict[str, Any],
    img_w: int,
    img_h: int,
    ar_range: Tuple[float, float] = DEFAULT_ASPECT_RATIO_RANGE,
    strict_ar_range: Tuple[float, float] = STRICT_ASPECT_RATIO_RANGE,
    perspective_zones: Optional[List[Dict[str, Any]]] = None,
    debug_tracker: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, str]:
    """
    Phase 4: Bounding Box Geometry Sanity Validation.
    Validates width, height, aspect ratio, and scale.
    Applies stricter rules to low-confidence candidates (0.15 <= conf < 0.25).
    Does NOT reject small distant persons if geometry is valid.
    """
    x1, y1, x2, y2 = candidate["box"]
    w = max(1.0, float(x2 - x1))
    h = max(1.0, float(y2 - y1))
    area = w * h
    conf = float(candidate.get("confidence", 0.15))
    det_type = candidate.get("type", "body")

    # Head detections use head-specific aspect ratio checks
    if det_type == "head_visible":
        head_ar = h / w
        if not (HEAD_ASPECT_RATIO_RANGE[0] <= head_ar <= HEAD_ASPECT_RATIO_RANGE[1]):
            if debug_tracker:
                debug_tracker["rejected"]["head_bad_aspect_ratio"] = debug_tracker["rejected"].get("head_bad_aspect_ratio", 0) + 1
            return False, "head_bad_aspect_ratio"
        if w < 4.0 or h < 4.0 or area < 20.0:
            if debug_tracker:
                debug_tracker["rejected"]["too_small"] = debug_tracker["rejected"].get("too_small", 0) + 1
            return False, "head_too_small"
        return True, "valid"

    # Absolute bounds (reject 1-2 pixel noise)
    if w < MIN_PERSON_ABS_WIDTH or h < MIN_PERSON_ABS_HEIGHT or area < MIN_PERSON_ABS_AREA:
        if debug_tracker:
            debug_tracker["rejected"]["too_small"] = debug_tracker["rejected"].get("too_small", 0) + 1
        return False, "too_small"

    # Relative frame bounds
    rel_w = w / max(1.0, float(img_w))
    rel_h = h / max(1.0, float(img_h))
    rel_area = area / max(1.0, float(img_w * img_h))

    if rel_w > MAX_RELATIVE_WIDTH or rel_h > MAX_RELATIVE_HEIGHT or rel_area > MAX_RELATIVE_AREA:
        if debug_tracker:
            debug_tracker["rejected"]["too_large"] = debug_tracker["rejected"].get("too_large", 0) + 1
        return False, "too_large"

    # Aspect ratio check
    aspect_ratio = h / w
    candidate["aspect_ratio"] = round(aspect_ratio, 3)

    # Low confidence band requires tighter aspect ratio
    if conf < LOW_CONF_CEILING:
        # If candidate was confirmed by a tile or multi-pass, be slightly more tolerant
        is_multipass = candidate.get("multi_pass", False)
        active_ar = ar_range if is_multipass else strict_ar_range
        if not (active_ar[0] <= aspect_ratio <= active_ar[1]):
            if debug_tracker:
                debug_tracker["rejected"]["low_confidence_invalid"] = debug_tracker["rejected"].get("low_confidence_invalid", 0) + 1
            return False, "low_confidence_invalid"
    else:
        if not (ar_range[0] <= aspect_ratio <= ar_range[1]):
            if debug_tracker:
                debug_tracker["rejected"]["bad_aspect_ratio"] = debug_tracker["rejected"].get("bad_aspect_ratio", 0) + 1
            return False, "bad_aspect_ratio"

    # Optional Perspective-Aware Validation
    if perspective_zones:
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        for pz in perspective_zones:
            region = pz.get("region")  # [[x1, y1], [x2, y2], ...] or [x1, y1, x2, y2]
            scale_expected = pz.get("expected_person_scale", "medium")
            in_zone = False
            if isinstance(region, list) and len(region) == 4 and isinstance(region[0], (int, float)):
                in_zone = region[0] <= cx <= region[2] and region[1] <= cy <= region[3]
            elif isinstance(region, list) and len(region) >= 3 and isinstance(region[0], (list, tuple)):
                in_zone = point_in_polygon(cx, cy, region)

            if in_zone:
                # Validate scale compatibility
                if scale_expected == "small" and (rel_h > 0.40 or rel_w > 0.25):
                    if debug_tracker:
                        debug_tracker["rejected"]["perspective_mismatch"] = debug_tracker["rejected"].get("perspective_mismatch", 0) + 1
                    return False, "perspective_mismatch"
                elif scale_expected == "large" and (h < 25.0 or w < 12.0):
                    if debug_tracker:
                        debug_tracker["rejected"]["perspective_mismatch"] = debug_tracker["rejected"].get("perspective_mismatch", 0) + 1
                    return False, "perspective_mismatch"
                break

    return True, "valid"


# ---------------------------------------------------------------------------
# Phase 5 & 6: Cross-Source Deduplication & Tile Merging
# ---------------------------------------------------------------------------

def deduplicate_detections(
    candidates: List[Dict[str, Any]],
    iou_thresh: float = DEDUP_IOU_THRESH,
    iomin_thresh: float = DEDUP_IOMIN_THRESH,
    centroid_norm_thresh: float = DEDUP_CENTROID_NORM_DIST,
    debug_tracker: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Phase 6: Robust Cross-Source & Cross-Tile Deduplication.
    Merges duplicate detections of the same physical person originating from:
    - Full-frame pass
    - Tile 1, Tile 2, etc.
    Considers:
    1. IoU >= iou_thresh (default 0.35)
    2. Containment / IoMin >= iomin_thresh (default 0.65)
    3. Normalized centroid distance + scale similarity
    Preserves the most informative box (prefers higher confidence; for small/distant
    persons, prefers tile detection which has higher resolution).
    """
    if not candidates:
        return []

    # Sort descending by confidence
    sorted_cands = sorted(candidates, key=lambda c: float(c.get("confidence", 0.0)), reverse=True)
    kept_detections: List[Dict[str, Any]] = []

    for cand in sorted_cands:
        b_box = cand["box"]
        b_conf = float(cand.get("confidence", 0.0))
        b_src = cand.get("source", "full_frame")
        b_w = b_box[2] - b_box[0]
        b_h = b_box[3] - b_box[1]
        b_cx = (b_box[0] + b_box[2]) / 2.0
        b_cy = (b_box[1] + b_box[3]) / 2.0

        is_duplicate = False
        for kept in kept_detections:
            k_box = kept["box"]
            k_w = k_box[2] - k_box[0]
            k_h = k_box[3] - k_box[1]
            k_cx = (k_box[0] + k_box[2]) / 2.0
            k_cy = (k_box[1] + k_box[3]) / 2.0

            # 1. IoU overlap
            iou = compute_box_iou(b_box, k_box)
            if iou >= iou_thresh:
                is_duplicate = True
                kept["multi_pass"] = True
                # If cand is from tile and person is small (< 80px), prefer tile coordinates
                if "tile" in b_src and b_h < 80 and b_conf > 0.30:
                    kept["box"] = b_box
                kept["confidence"] = max(kept["confidence"], b_conf)
                break

            # 2. Containment (one box inside another)
            iomin = compute_box_iomin(b_box, k_box)
            if iomin >= iomin_thresh:
                # Check that horizontal alignment is consistent
                norm_horiz_diff = abs(b_cx - k_cx) / max(1.0, min(b_w, k_w))
                if norm_horiz_diff <= 0.60:
                    is_duplicate = True
                    kept["multi_pass"] = True
                    kept["confidence"] = max(kept["confidence"], b_conf)
                    break

            # 3. Normalized centroid proximity and comparable size
            avg_dim = max(1.0, (b_w + b_h + k_w + k_h) / 4.0)
            center_dist = math.hypot(b_cx - k_cx, b_cy - k_cy)
            if center_dist / avg_dim <= centroid_norm_thresh:
                scale_ratio = (b_w * b_h) / max(1.0, (k_w * k_h))
                if 0.35 <= scale_ratio <= 2.85:
                    is_duplicate = True
                    kept["multi_pass"] = True
                    kept["confidence"] = max(kept["confidence"], b_conf)
                    break

        if is_duplicate:
            if debug_tracker:
                debug_tracker["rejected"]["duplicate"] = debug_tracker["rejected"].get("duplicate", 0) + 1
        else:
            kept_detections.append(cand.copy())

    return kept_detections


# ---------------------------------------------------------------------------
# Phase 7: Anatomical Head-to-Body Association
# ---------------------------------------------------------------------------

def associate_heads_to_bodies(
    body_detections: List[Dict[str, Any]],
    head_detections: List[Dict[str, Any]],
    head_upper_ratio: float = HEAD_UPPER_BODY_RATIO,
    max_width_ratio: float = HEAD_MAX_WIDTH_RATIO,
    max_horiz_offset: float = HEAD_MAX_HORIZ_OFFSET,
    unmatched_min_conf: float = HEAD_MIN_CONF_UNMATCHED,
    debug_tracker: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Phase 7: Robust Head-to-Body Association.
    Determines which heads belong to existing body detections vs which represent
    genuine separate occluded individuals.

    A head is associated with a body if:
    1. Head centroid is in the upper ~45% of the body box (or directly above within tolerance).
    2. Horizontal center distance <= 35% of body width.
    3. Head width <= 80% of body width.
    4. Head box overlaps or sits on the shoulders of the body box.

    An unassociated head is ONLY promoted to a counted person if:
    - It does not associate with any detected body.
    - Confidence is >= unmatched_min_conf (0.20) or multi-pass validated.
    - Its geometry passes head sanity (aspect ratio ~ 0.5–1.8).
    """
    matched_head_indices = set()
    unmatched_head_candidates: List[Dict[str, Any]] = []

    for h_idx, head in enumerate(head_detections):
        hx1, hy1, hx2, hy2 = head["box"]
        hcx = (hx1 + hx2) / 2.0
        hcy = (hy1 + hy2) / 2.0
        hw = max(1.0, hx2 - hx1)
        hh = max(1.0, hy2 - hy1)

        belongs_to_body = False
        for body in body_detections:
            bx1, by1, bx2, by2 = body["box"]
            bw = max(1.0, bx2 - bx1)
            bh = max(1.0, by2 - by1)
            bcx = (bx1 + bx2) / 2.0

            # 1. Horizontal alignment check
            horiz_dist = abs(hcx - bcx)
            if horiz_dist > max_horiz_offset * bw and (hcx < bx1 - 0.1 * bw or hcx > bx2 + 0.1 * bw):
                continue

            # 2. Vertical position: head must be in the upper portion or immediately above neck
            # Upper boundary: allows head to sit slightly above body box (up to 0.5 * head height)
            # Lower boundary: must be within the top upper_ratio (e.g. 45%) of body height
            upper_limit = by1 - 0.5 * hh
            lower_limit = by1 + head_upper_ratio * bh

            if upper_limit <= hcy <= lower_limit:
                # 3. Relative scale sanity: head width should be smaller than body width
                if hw <= max_width_ratio * bw:
                    belongs_to_body = True
                    matched_head_indices.add(h_idx)
                    break

            # 4. Fallback IoU with upper third of body box
            body_head_roi = [bx1, by1, bx2, by1 + 0.35 * bh]
            if compute_box_iou(head["box"], body_head_roi) > 0.20:
                belongs_to_body = True
                matched_head_indices.add(h_idx)
                break

        if not belongs_to_body:
            # Candidate for occluded person
            h_conf = float(head.get("confidence", 0.0))
            if h_conf >= unmatched_min_conf:
                head_person = head.copy()
                head_person["type"] = "head_visible"
                unmatched_head_candidates.append(head_person)
            else:
                if debug_tracker:
                    debug_tracker["rejected"]["low_confidence_unmatched_head"] = (
                        debug_tracker["rejected"].get("low_confidence_unmatched_head", 0) + 1
                    )
        else:
            if debug_tracker:
                debug_tracker["rejected"]["head_body_duplicate"] = (
                    debug_tracker["rejected"].get("head_body_duplicate", 0) + 1
                )

    if debug_tracker:
        debug_tracker["head_body_matches"] = len(matched_head_indices)
        debug_tracker["unmatched_heads"] = len(unmatched_head_candidates)

    return body_detections, unmatched_head_candidates


# ---------------------------------------------------------------------------
# Phase 8: ROI Filtering
# ---------------------------------------------------------------------------

def apply_roi_filter(
    detections: List[Dict[str, Any]],
    roi: Optional[Union[List[float], List[List[float]], Dict[str, Any]]],
    img_w: int,
    img_h: int,
    debug_tracker: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Phase 8: Optional ROI Filtering.
    Supports:
    - Rectangle: [x1, y1, x2, y2] (pixel or normalized)
    - Polygon: [[x1, y1], [x2, y2], ...] (pixel or normalized)
    - Dict with "polygon" or "bbox" key
    Uses bottom-center point of bounding box (feet position on ground plane)
    for accurate ground-plane ROI containment.
    """
    if roi is None:
        return detections

    parsed_poly: Optional[List[Tuple[float, float]]] = None
    parsed_bbox: Optional[Tuple[float, float, float, float]] = None

    if isinstance(roi, dict):
        if "polygon" in roi:
            roi = roi["polygon"]
        elif "bbox" in roi:
            roi = roi["bbox"]

    if isinstance(roi, list):
        if len(roi) == 4 and all(isinstance(v, (int, float)) for v in roi):
            # Bounding box [x1, y1, x2, y2]
            rx1, ry1, rx2, ry2 = [float(v) for v in roi]
            if max(rx1, rx2) <= 1.0 and max(ry1, ry2) <= 1.0:
                rx1, rx2 = rx1 * img_w, rx2 * img_w
                ry1, ry2 = ry1 * img_h, ry2 * img_h
            parsed_bbox = (min(rx1, rx2), min(ry1, ry2), max(rx1, rx2), max(ry1, ry2))
        elif len(roi) >= 3 and all(isinstance(pt, (list, tuple)) and len(pt) >= 2 for pt in roi):
            # Polygon vertices
            poly_pts = []
            for pt in roi:
                px, py = float(pt[0]), float(pt[1])
                if px <= 1.0 and py <= 1.0:
                    px *= img_w
                    py *= img_h
                poly_pts.append((px, py))
            parsed_poly = poly_pts

    if parsed_bbox is None and parsed_poly is None:
        return detections

    filtered: List[Dict[str, Any]] = []
    for det in detections:
        x1, y1, x2, y2 = det["box"]
        # Ground-contact reference point (bottom-center)
        ref_x = (x1 + x2) / 2.0
        ref_y = y2 - 0.05 * (y2 - y1)

        inside = True
        if parsed_bbox is not None:
            inside = parsed_bbox[0] <= ref_x <= parsed_bbox[2] and parsed_bbox[1] <= ref_y <= parsed_bbox[3]
        elif parsed_poly is not None:
            inside = point_in_polygon(ref_x, ref_y, parsed_poly)

        if inside:
            filtered.append(det)
        else:
            if debug_tracker:
                debug_tracker["rejected"]["outside_roi"] = debug_tracker["rejected"].get("outside_roi", 0) + 1

    return filtered


# ---------------------------------------------------------------------------
# Phase 11 & 12: Zone Assignment & Mathematical Metric Consistency
# ---------------------------------------------------------------------------

def assign_zones(
    detections: List[Dict[str, Any]],
    img_h: int,
    img_w: int,
    grid_rows: int = 4,
    grid_cols: int = 4,
) -> List[Dict[str, Any]]:
    """
    Phase 11: Guarantees every validated person belongs to EXACTLY ONE zone cell.
    sum(zone["count"] for zone in zones) == total_count
    """
    grid_rows = max(1, grid_rows)
    grid_cols = max(1, grid_cols)
    cell_h = img_h / float(grid_rows)
    cell_w = img_w / float(grid_cols)

    counts = [[0 for _ in range(grid_cols)] for _ in range(grid_rows)]

    for det in detections:
        # Use detection center point
        x1, y1, x2, y2 = det["box"]
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0

        r = min(int(cy / cell_h), grid_rows - 1)
        c = min(int(cx / cell_w), grid_cols - 1)
        counts[r][c] += 1

    zone_thresholds = {
        "critical": 15,
        "dense": 8,
        "moderate": 3,
        "clear": 0,
    }

    zones: List[Dict[str, Any]] = []
    for r in range(grid_rows):
        for c in range(grid_cols):
            cnt = counts[r][c]
            if cnt >= zone_thresholds["critical"]:
                level = "critical"
            elif cnt >= zone_thresholds["dense"]:
                level = "dense"
            elif cnt >= zone_thresholds["moderate"]:
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


def compute_crowd_level(total_count: int) -> str:
    """Classify crowd level based on total validated person count."""
    if total_count == 0:
        return "ZERO"
    elif total_count <= 4:
        return "LOW"
    elif total_count <= 15:
        return "MODERATE"
    elif total_count <= 40:
        return "HIGH"
    else:
        return "CRITICAL"


def compute_density_score(
    detections: List[Dict[str, Any]],
    img_w: int,
    img_h: int,
    total_count: int,
) -> float:
    """
    Phase 10 & 12: Image-space heuristic density score normalized to [0.0, 1.0].
    Combines occupied image area fraction and person count capacity.
    Documented as an image-space distribution metric, not physical persons/m^2.
    """
    if total_count == 0 or img_w <= 0 or img_h <= 0:
        return 0.0

    frame_area = float(img_w * img_h)
    total_box_area = sum((d["box"][2] - d["box"][0]) * (d["box"][3] - d["box"][1]) for d in detections)

    area_ratio = min(1.0, total_box_area / frame_area)
    count_factor = min(1.0, total_count / 120.0)

    score = 0.65 * area_ratio + 0.35 * count_factor
    return round(float(min(1.0, max(0.0, score))), 2)


# ---------------------------------------------------------------------------
# Phase 13, 14 & 15: Lightweight Video Tracking & Temporal Count Stabilizer
# ---------------------------------------------------------------------------

class TrackItem:
    """Representation of an active tracked individual."""
    def __init__(self, track_id: int, box: List[float], conf: float, det_type: str):
        self.track_id = track_id
        self.box = list(box)
        self.conf = conf
        self.det_type = det_type
        self.hits = 1
        self.age = 1
        self.time_since_update = 0

    @property
    def centroid(self) -> Tuple[float, float]:
        return ((self.box[0] + self.box[2]) / 2.0, (self.box[1] + self.box[3]) / 2.0)

    def update(self, box: List[float], conf: float, det_type: str):
        self.box = list(box)
        self.conf = conf
        self.det_type = det_type
        self.hits += 1
        self.age += 1
        self.time_since_update = 0


class CrowdTemporalTracker:
    """
    Phase 13 & 14: Lightweight per-camera temporal consistency engine.
    - Centroid/IoU tracking across consecutive video frames
    - Bounded temporal smoothing (EMA + median filter) to prevent count flickering
    - Transient false-positive suppression (short-lived single-frame noise)
    - Surge alert hysteresis (Phase 15: N consecutive frames to raise, M to clear)
    """
    def __init__(
        self,
        camera_id: str,
        max_disappeared: int = TRACKER_MAX_DISAPPEARED,
        dist_threshold: float = TRACKER_DIST_THRESH,
        window_size: int = TEMPORAL_WINDOW_SIZE,
    ):
        self.camera_id = camera_id
        self.max_disappeared = max_disappeared
        self.dist_threshold = dist_threshold
        self.next_track_id = 1
        self.tracks: Dict[int, TrackItem] = {}
        self.count_history: deque = deque(maxlen=window_size)
        self.surge_consecutive_high = 0
        self.surge_consecutive_normal = 0
        self.is_surging = False

    def update(
        self,
        detections: List[Dict[str, Any]],
        raw_count: int,
    ) -> Tuple[List[Dict[str, Any]], int, Dict[str, Any]]:
        """
        Update tracker with current frame detections.
        Returns:
        - track-annotated detections list
        - temporally stabilized crowd count
        - surge alert status with hysteresis
        """
        # Age existing tracks
        for track in self.tracks.values():
            track.time_since_update += 1
            track.age += 1

        matched_tracks = set()
        matched_dets = set()

        if self.tracks and detections:
            track_ids = list(self.tracks.keys())
            track_centroids = [self.tracks[tid].centroid for tid in track_ids]
            det_centroids = [
                ((d["box"][0] + d["box"][2]) / 2.0, (d["box"][1] + d["box"][3]) / 2.0)
                for d in detections
            ]

            # Pairwise distance matrix
            dist_matrix = np.zeros((len(track_ids), len(detections)), dtype=np.float32)
            for i, tc in enumerate(track_centroids):
                for j, dc in enumerate(det_centroids):
                    dist_matrix[i, j] = math.hypot(tc[0] - dc[0], tc[1] - dc[1])

            # Greedy Hungarian-style matching
            row_ind = np.argsort(dist_matrix.min(axis=1))
            for r in row_ind:
                min_c = int(np.argmin(dist_matrix[r]))
                min_dist = dist_matrix[r, min_c]
                if min_dist <= self.dist_threshold and min_c not in matched_dets:
                    tid = track_ids[r]
                    self.tracks[tid].update(
                        box=detections[min_c]["box"],
                        conf=float(detections[min_c]["confidence"]),
                        det_type=detections[min_c].get("type", "body"),
                    )
                    detections[min_c]["track_id"] = tid
                    matched_tracks.add(tid)
                    matched_dets.add(min_c)

        # Create new tracks for unmatched detections
        for j, det in enumerate(detections):
            if j not in matched_dets:
                tid = self.next_track_id
                self.next_track_id += 1
                self.tracks[tid] = TrackItem(
                    track_id=tid,
                    box=det["box"],
                    conf=float(det["confidence"]),
                    det_type=det.get("type", "body"),
                )
                det["track_id"] = tid

        # Remove dead tracks
        dead_ids = [
            tid for tid, track in self.tracks.items()
            if track.time_since_update > self.max_disappeared
        ]
        for tid in dead_ids:
            del self.tracks[tid]

        # Surge baseline and hysteresis (Phase 15)
        # Compute baseline average from established history before appending the current raw_count
        baseline_avg = float(np.mean(list(self.count_history))) if len(self.count_history) >= 4 else 0.0
        surge_percent = 0.0
        if baseline_avg > 0:
            surge_percent = ((raw_count - baseline_avg) / baseline_avg) * 100.0

        is_high_surge = surge_percent >= 40.0 and raw_count >= 15

        if is_high_surge:
            self.surge_consecutive_high += 1
            self.surge_consecutive_normal = 0
            if self.surge_consecutive_high >= SURGE_HYSTERESIS_CONSECUTIVE_RAISE:
                self.is_surging = True
        else:
            self.surge_consecutive_normal += 1
            self.surge_consecutive_high = 0
            if self.surge_consecutive_normal >= SURGE_HYSTERESIS_CONSECUTIVE_CLEAR:
                self.is_surging = False

        # Temporal smoothing calculation
        self.count_history.append(raw_count)
        if len(self.count_history) >= 3:
            median_count = int(np.median(list(self.count_history)))
            # If current frame deviates massively from median of recent frames,
            # clamp it to bounded window to avoid single-frame spike flicker
            allowed_deviation = max(3, int(median_count * 0.35))
            if abs(raw_count - median_count) > allowed_deviation and len(self.count_history) >= 4:
                stabilized_count = int(0.70 * median_count + 0.30 * raw_count)
            else:
                stabilized_count = raw_count
        else:
            stabilized_count = raw_count

        surge_info = {
            "surge_detected": self.is_surging,
            "baseline_avg": round(baseline_avg, 1),
            "surge_percent": round(surge_percent, 1),
            "hysteresis_high_count": self.surge_consecutive_high,
            "hysteresis_clear_count": self.surge_consecutive_normal,
        }

        return detections, stabilized_count, surge_info


# Per-camera tracker registry
_camera_trackers: Dict[str, CrowdTemporalTracker] = {}


def get_camera_tracker(camera_id: str) -> CrowdTemporalTracker:
    """Retrieve or create a temporal tracker for a camera stream."""
    global _camera_trackers
    if camera_id not in _camera_trackers:
        _camera_trackers[camera_id] = CrowdTemporalTracker(camera_id=camera_id)
    return _camera_trackers[camera_id]


def reset_camera_tracker(camera_id: str) -> None:
    """Reset the temporal tracker state for a given camera."""
    global _camera_trackers
    if camera_id in _camera_trackers:
        del _camera_trackers[camera_id]
        logger.info(f"[CrowdPostprocess] Temporal tracker reset for camera '{camera_id}'")
