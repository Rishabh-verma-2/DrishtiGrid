"""
Crowd Detection Post-Processing, Spatial Fusion & Temporal Engine
================================================================

Comprehensive post-processing pipeline for DrishtiGrid crowd counting.
Responsible for:
1. Defensive class filtering (only human/person candidates).
2. Contextual validation profiles (NORMAL, SMALL, OCCLUDED, HEAD_ONLY, EDGE_TRUNCATED).
3. Source-aware cross-tile and multi-scale deduplication with local density protection.
4. Optimal bipartite Hungarian head-to-body association.
5. Ground-plane camera ROI spatial filtering.
6. Mathematically consistent zone assignment.
7. Confidence-aware hybrid count fusion layer (detector + head + density estimator).
8. Comprehensive quality scoring & uncertainty estimation.
9. Lightweight video temporal tracking with surge hysteresis (strictly bypassed for still images).
"""

from __future__ import annotations

import math
import logging
from collections import deque
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
from scipy.optimize import linear_sum_assignment

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Core Configuration Constants
# ---------------------------------------------------------------------------
CROWD_MIN_CONF: float = 0.15           # Strictly enforced confidence floor (15%)
LOW_CONF_CEILING: float = 0.25         # Low confidence band

# Aspect ratio bounds (height / width)
DEFAULT_ASPECT_RATIO_RANGE: Tuple[float, float] = (0.70, 5.50)
STRICT_ASPECT_RATIO_RANGE: Tuple[float, float] = (0.85, 4.80)
OCCLUDED_ASPECT_RATIO_RANGE: Tuple[float, float] = (0.35, 3.80)
HEAD_ASPECT_RATIO_RANGE: Tuple[float, float] = (0.45, 2.00)

# Scale bounds
MIN_PERSON_ABS_WIDTH: float = 4.0
MIN_PERSON_ABS_HEIGHT: float = 8.0
MIN_PERSON_ABS_AREA: float = 32.0

MAX_RELATIVE_WIDTH: float = 0.95
MAX_RELATIVE_HEIGHT: float = 0.95
MAX_RELATIVE_AREA: float = 0.85

# Deduplication Thresholds
DEDUP_IOU_THRESH: float = 0.35
DEDUP_IOMIN_THRESH: float = 0.65
DEDUP_CENTROID_NORM_DIST: float = 0.30

# Head-to-Body Association Parameters
HEAD_UPPER_BODY_RATIO: float = 0.45
HEAD_MAX_WIDTH_RATIO: float = 0.85
HEAD_MAX_HORIZ_OFFSET: float = 0.40
HEAD_MIN_CONF_UNMATCHED: float = 0.20
HEAD_ASSOC_MIN_SCORE: float = 0.38

# Temporal Tracking
TRACKER_MAX_DISAPPEARED: int = 5
TRACKER_DIST_THRESH: float = 80.0
TEMPORAL_WINDOW_SIZE: int = 7
SURGE_HYSTERESIS_CONSECUTIVE_RAISE: int = 3
SURGE_HYSTERESIS_CONSECUTIVE_CLEAR: int = 4

COCO_PERSON_CLASS_ID: int = 0


# ---------------------------------------------------------------------------
# Geometry & Overlap Helpers
# ---------------------------------------------------------------------------

def compute_box_iou(box1: Sequence[float], box2: Sequence[float]) -> float:
    """Compute Intersection-over-Union between two [x1, y1, x2, y2] boxes."""
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
        return True
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
# Phase 3 & 4: Candidate Filtering & Contextual Profile Validation
# ---------------------------------------------------------------------------

def filter_person_class(
    raw_detections: List[Dict[str, Any]],
    expected_class_id: int = COCO_PERSON_CLASS_ID,
    debug_tracker: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Only allows detections corresponding to the person class (class_id == 0)."""
    person_candidates: List[Dict[str, Any]] = []
    for det in raw_detections:
        cid = det.get("class_id", expected_class_id)
        if cid == expected_class_id:
            person_candidates.append(det)
        else:
            if debug_tracker is not None:
                debug_tracker["rejected"]["non_person"] = debug_tracker["rejected"].get("non_person", 0) + 1
    return person_candidates


def validate_candidate_profile(
    candidate: Dict[str, Any],
    img_w: int,
    img_h: int,
    perspective_zones: Optional[List[Dict[str, Any]]] = None,
    debug_tracker: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, str, str]:
    """
    Contextual validation profiles for crowd scenes:
    - NORMAL_PERSON: standard upright person
    - SMALL_PERSON: tiny distant pedestrian in high-res frame
    - OCCLUDED_PERSON: partially occluded torso or seated/crouched
    - HEAD_ONLY_PERSON: head detection
    - EDGE_TRUNCATED_PERSON: person cut off by image boundary
    Returns: (is_valid, profile_name, rejection_reason)
    """
    x1, y1, x2, y2 = candidate["box"]
    w = max(1.0, float(x2 - x1))
    h = max(1.0, float(y2 - y1))
    area = w * h
    conf = float(candidate.get("confidence", 0.15))
    det_type = candidate.get("type", "body")
    aspect_ratio = round(h / w, 3)
    candidate["aspect_ratio"] = aspect_ratio

    # 1. Profile: HEAD_ONLY_PERSON
    if det_type == "head_visible":
        if not (HEAD_ASPECT_RATIO_RANGE[0] <= aspect_ratio <= HEAD_ASPECT_RATIO_RANGE[1]):
            if debug_tracker:
                debug_tracker["rejected"]["head_bad_aspect_ratio"] = debug_tracker["rejected"].get("head_bad_aspect_ratio", 0) + 1
            return False, "HEAD_ONLY_PERSON", "head_bad_aspect_ratio"
        if w < 4.0 or h < 4.0 or area < 16.0:
            if debug_tracker:
                debug_tracker["rejected"]["too_small"] = debug_tracker["rejected"].get("too_small", 0) + 1
            return False, "HEAD_ONLY_PERSON", "head_too_small"
        return True, "HEAD_ONLY_PERSON", "valid"

    # 2. Absolute noise check
    if w < MIN_PERSON_ABS_WIDTH or h < MIN_PERSON_ABS_HEIGHT or area < MIN_PERSON_ABS_AREA:
        if debug_tracker:
            debug_tracker["rejected"]["too_small"] = debug_tracker["rejected"].get("too_small", 0) + 1
        return False, "UNKNOWN", "too_small"

    # 3. Relative frame sanity bounds
    rel_w = w / max(1.0, float(img_w))
    rel_h = h / max(1.0, float(img_h))
    rel_area = area / max(1.0, float(img_w * img_h))

    if rel_w > MAX_RELATIVE_WIDTH or rel_h > MAX_RELATIVE_HEIGHT or rel_area > MAX_RELATIVE_AREA:
        if debug_tracker:
            debug_tracker["rejected"]["too_large"] = debug_tracker["rejected"].get("too_large", 0) + 1
        return False, "UNKNOWN", "too_large"

    # 4. Check if touching image borders -> EDGE_TRUNCATED_PERSON
    is_edge = (x1 <= 3.0 or y1 <= 3.0 or x2 >= img_w - 3.0 or y2 >= img_h - 3.0)
    if is_edge:
        # Edge people can be cut horizontally or vertically
        if 0.35 <= aspect_ratio <= 6.0:
            return True, "EDGE_TRUNCATED_PERSON", "valid"

    # 5. Check if candidate is marked as occluded or multi-pass
    is_occluded = candidate.get("is_occluded", False) or candidate.get("multi_pass", False)
    if is_occluded:
        if OCCLUDED_ASPECT_RATIO_RANGE[0] <= aspect_ratio <= OCCLUDED_ASPECT_RATIO_RANGE[1]:
            return True, "OCCLUDED_PERSON", "valid"

    # 6. Check if small distant person -> SMALL_PERSON
    if h <= 45.0 or w <= 20.0:
        if 0.80 <= aspect_ratio <= 4.80:
            return True, "SMALL_PERSON", "valid"

    # 7. Low confidence candidate validation
    if conf < LOW_CONF_CEILING:
        is_multipass = candidate.get("multi_pass", False)
        active_ar = DEFAULT_ASPECT_RATIO_RANGE if is_multipass else STRICT_ASPECT_RATIO_RANGE
        if not (active_ar[0] <= aspect_ratio <= active_ar[1]):
            if debug_tracker:
                debug_tracker["rejected"]["low_confidence_invalid"] = debug_tracker["rejected"].get("low_confidence_invalid", 0) + 1
            return False, "NORMAL_PERSON", "low_confidence_invalid"
    else:
        if not (DEFAULT_ASPECT_RATIO_RANGE[0] <= aspect_ratio <= DEFAULT_ASPECT_RATIO_RANGE[1]):
            if debug_tracker:
                debug_tracker["rejected"]["bad_aspect_ratio"] = debug_tracker["rejected"].get("bad_aspect_ratio", 0) + 1
            return False, "NORMAL_PERSON", "bad_aspect_ratio"

    # 8. Perspective Zone validation
    if perspective_zones:
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        for pz in perspective_zones:
            region = pz.get("region")
            scale_expected = pz.get("expected_person_scale", "medium")
            in_zone = False
            if isinstance(region, list) and len(region) == 4 and isinstance(region[0], (int, float)):
                in_zone = region[0] <= cx <= region[2] and region[1] <= cy <= region[3]
            elif isinstance(region, list) and len(region) >= 3 and isinstance(region[0], (list, tuple)):
                in_zone = point_in_polygon(cx, cy, region)

            if in_zone:
                if scale_expected == "small" and (rel_h > 0.40 or rel_w > 0.25):
                    if debug_tracker:
                        debug_tracker["rejected"]["perspective_mismatch"] = debug_tracker["rejected"].get("perspective_mismatch", 0) + 1
                    return False, "NORMAL_PERSON", "perspective_mismatch"
                elif scale_expected == "large" and (h < 25.0 or w < 12.0):
                    if debug_tracker:
                        debug_tracker["rejected"]["perspective_mismatch"] = debug_tracker["rejected"].get("perspective_mismatch", 0) + 1
                    return False, "NORMAL_PERSON", "perspective_mismatch"
                break

    return True, "NORMAL_PERSON", "valid"


def validate_bbox_geometry(
    candidate: Dict[str, Any],
    img_w: int,
    img_h: int,
    ar_range: Tuple[float, float] = DEFAULT_ASPECT_RATIO_RANGE,
    strict_ar_range: Tuple[float, float] = STRICT_ASPECT_RATIO_RANGE,
    perspective_zones: Optional[List[Dict[str, Any]]] = None,
    debug_tracker: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, str]:
    """Backward-compatible wrapper for geometry validation."""
    valid, _, reason = validate_candidate_profile(
        candidate, img_w, img_h, perspective_zones, debug_tracker
    )
    return valid, reason


# ---------------------------------------------------------------------------
# Phase 5 & 6: Source-Aware Cross-Tile Deduplication
# ---------------------------------------------------------------------------

def deduplicate_detections(
    candidates: List[Dict[str, Any]],
    iou_thresh: float = DEDUP_IOU_THRESH,
    iomin_thresh: float = DEDUP_IOMIN_THRESH,
    centroid_norm_thresh: float = DEDUP_CENTROID_NORM_DIST,
    local_density_awareness: bool = True,
    debug_tracker: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Source-Aware Cross-Tile Deduplication.
    Prevents accidentally merging two distinct neighboring people in dense crowds.
    Considers:
    - Source pass identity (same tile vs adjacent tiles vs full-frame vs dense region)
    - Local crowd density (tightens merge threshold in dense clusters)
    - Vertical alignment and aspect ratio consistency
    - Centroid distance normalized by box dimension
    """
    if not candidates:
        return []

    # Sort descending by confidence
    sorted_cands = sorted(candidates, key=lambda c: float(c.get("confidence", 0.0)), reverse=True)
    kept_detections: List[Dict[str, Any]] = []

    for cand in sorted_cands:
        b_box = cand["box"]
        b_conf = float(cand.get("confidence", 0.0))
        b_src = str(cand.get("source", "full_frame"))
        b_w = max(1.0, b_box[2] - b_box[0])
        b_h = max(1.0, b_box[3] - b_box[1])
        b_cx = (b_box[0] + b_box[2]) / 2.0
        b_cy = (b_box[1] + b_box[3]) / 2.0

        is_duplicate = False

        for kept in kept_detections:
            k_box = kept["box"]
            k_conf = float(kept.get("confidence", 0.0))
            k_src = str(kept.get("source", "full_frame"))
            k_w = max(1.0, k_box[2] - k_box[0])
            k_h = max(1.0, k_box[3] - k_box[1])
            k_cx = (k_box[0] + k_box[2]) / 2.0
            k_cy = (k_box[1] + k_box[3]) / 2.0

            # Compute pairwise spatial metrics
            iou = compute_box_iou(b_box, k_box)
            iomin = compute_box_iomin(b_box, k_box)
            horiz_center_diff = abs(b_cx - k_cx) / min(b_w, k_w)
            vert_center_diff = abs(b_cy - k_cy) / min(b_h, k_h)
            center_dist = math.hypot(b_cx - k_cx, b_cy - k_cy)
            avg_dim = (b_w + b_h + k_w + k_h) / 4.0
            norm_dist = center_dist / avg_dim

            # Source relation
            same_source = (b_src == k_src)
            cross_tile = ("tile" in b_src and "tile" in k_src and b_src != k_src)
            full_vs_tile = ("full" in b_src and "tile" in k_src) or ("tile" in b_src and "full" in k_src)

            # In dense crowds, two people standing side by side have low center overlap
            # Even if IoU is ~0.35, if horizontal center difference > 0.45 * width, they are distinct people!
            if horiz_center_diff > 0.45 and vert_center_diff < 0.35:
                # Distinct adjacent people standing side by side: DO NOT MERGE unless IoU is very high (> 0.65)
                if iou < 0.65:
                    continue

            # Case A: Substantial IoU overlap
            active_iou = 0.50 if local_density_awareness and same_source else iou_thresh
            if iou >= active_iou:
                is_duplicate = True
                kept["multi_pass"] = True
                if "tile" in b_src and b_h < 90 and b_conf > 0.28:
                    kept["box"] = b_box
                kept["confidence"] = max(k_conf, b_conf)
                break

            # Case B: Heavy Containment (one box inside another)
            if iomin >= iomin_thresh:
                # Must have reasonable center alignment
                if horiz_center_diff <= 0.45 and vert_center_diff <= 0.45:
                    is_duplicate = True
                    kept["multi_pass"] = True
                    kept["confidence"] = max(k_conf, b_conf)
                    break

            # Case C: Cross-Tile / Full-Frame vs Tile Proximity
            if (cross_tile or full_vs_tile) and norm_dist <= centroid_norm_thresh:
                scale_ratio = (b_w * b_h) / max(1.0, (k_w * k_h))
                if 0.40 <= scale_ratio <= 2.50:
                    is_duplicate = True
                    kept["multi_pass"] = True
                    if "tile" in b_src and b_conf > k_conf:
                        kept["box"] = b_box
                    kept["confidence"] = max(k_conf, b_conf)
                    break

        if is_duplicate:
            if debug_tracker:
                debug_tracker["rejected"]["duplicate"] = debug_tracker["rejected"].get("duplicate", 0) + 1
        else:
            kept_detections.append(cand.copy())

    return kept_detections


# ---------------------------------------------------------------------------
# Phase 7: Anatomical Head-to-Body Association with Hungarian Matching
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
    Optimal Bipartite Hungarian Head-to-Body Association.
    Assigns each head to at most one body using a composite affinity score:
    - Horizontal alignment (head centered on body torso)
    - Vertical alignment (head in top 40% of body or on shoulders)
    - Size ratio (head width is 20-80% of body width)
    - Overlap score (IoU with shoulder region)
    Unassociated heads with confidence >= unmatched_min_conf become counted occluded individuals.
    """
    if not head_detections:
        return body_detections, []

    if not body_detections:
        # All valid heads become occluded person candidates
        valid_unmatched = []
        for h in head_detections:
            if float(h.get("confidence", 0.0)) >= unmatched_min_conf:
                hp = h.copy()
                hp["type"] = "head_visible"
                valid_unmatched.append(hp)
        if debug_tracker:
            debug_tracker["head_body_matches"] = 0
            debug_tracker["unmatched_heads"] = len(valid_unmatched)
        return body_detections, valid_unmatched

    num_heads = len(head_detections)
    num_bodies = len(body_detections)

    # Build affinity score matrix (num_heads x num_bodies)
    score_matrix = np.zeros((num_heads, num_bodies), dtype=np.float32)

    for i, head in enumerate(head_detections):
        hx1, hy1, hx2, hy2 = head["box"]
        hcx = (hx1 + hx2) / 2.0
        hcy = (hy1 + hy2) / 2.0
        hw = max(1.0, hx2 - hx1)
        hh = max(1.0, hy2 - hy1)

        for j, body in enumerate(body_detections):
            bx1, by1, bx2, by2 = body["box"]
            bcx = (bx1 + bx2) / 2.0
            bw = max(1.0, bx2 - bx1)
            bh = max(1.0, by2 - by1)

            # 1. Horizontal score: 1.0 when perfectly centered, decaying to 0 at max_horiz_offset * bw
            horiz_dist = abs(hcx - bcx)
            max_allowed_h = max_horiz_offset * bw
            s_horiz = max(0.0, 1.0 - (horiz_dist / max(1.0, max_allowed_h)))

            # 2. Vertical score: head must sit in upper part of body or slightly above neck
            # Preferred head vertical center: between (by1 - 0.25*hh) and (by1 + 0.30*bh)
            upper_bound = by1 - 0.50 * hh
            lower_bound = by1 + head_upper_ratio * bh
            if upper_bound <= hcy <= lower_bound:
                # Centered in shoulder region
                optimal_cy = by1 + 0.15 * bh
                s_vert = max(0.2, 1.0 - (abs(hcy - optimal_cy) / max(1.0, 0.35 * bh)))
            else:
                s_vert = 0.0

            # 3. Size compatibility score: head width should be ~25-70% of body width
            width_ratio = hw / bw
            if 0.15 <= width_ratio <= max_width_ratio:
                s_size = 1.0 - abs(width_ratio - 0.40) / 0.40
                s_size = max(0.2, min(1.0, s_size))
            else:
                s_size = 0.0

            # 4. Upper body IoU score
            shoulder_roi = [bx1, by1 - 0.2 * hh, bx2, by1 + 0.35 * bh]
            s_overlap = compute_box_iou(head["box"], shoulder_roi)

            # Composite affinity score
            if s_horiz > 0.1 and s_vert > 0.1 and s_size > 0.1:
                affinity = 0.35 * s_horiz + 0.35 * s_vert + 0.15 * s_size + 0.15 * min(1.0, s_overlap * 2.0)
            else:
                affinity = 0.0

            score_matrix[i, j] = float(affinity)

    # Hungarian assignment (minimize cost = 1.0 - score)
    cost_matrix = 1.0 - score_matrix
    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    matched_head_indices = set()
    for r, c in zip(row_ind, col_ind):
        if score_matrix[r, c] >= HEAD_ASSOC_MIN_SCORE:
            matched_head_indices.add(r)

    # Process unmatched heads
    unmatched_head_candidates: List[Dict[str, Any]] = []
    for h_idx, head in enumerate(head_detections):
        if h_idx not in matched_head_indices:
            h_conf = float(head.get("confidence", 0.0))
            if h_conf >= unmatched_min_conf:
                hp = head.copy()
                hp["type"] = "head_visible"
                unmatched_head_candidates.append(hp)
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
    """Ground-plane reference point ROI filtering."""
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
            rx1, ry1, rx2, ry2 = [float(v) for v in roi]
            if max(rx1, rx2) <= 1.0 and max(ry1, ry2) <= 1.0:
                rx1, rx2 = rx1 * img_w, rx2 * img_w
                ry1, ry2 = ry1 * img_h, ry2 * img_h
            parsed_bbox = (min(rx1, rx2), min(ry1, ry2), max(rx1, rx2), max(ry1, ry2))
        elif len(roi) >= 3 and all(isinstance(pt, (list, tuple)) and len(pt) >= 2 for pt in roi):
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
# Phase 9: Hybrid Count Fusion & Quality Assessment
# ---------------------------------------------------------------------------

def fuse_crowd_estimates(
    detector_body_count: int,
    unmatched_head_count: int,
    density_estimated_count: float,
    density_confidence: float,
    overlap_ratio: float,
    suspicious_dense_regions_count: int,
) -> Dict[str, Any]:
    """
    Confidence-aware multi-signal hybrid count fusion.
    Combines:
    - detector_count (verified body boxes)
    - occluded_est (unmatched verified head boxes)
    - density_estimated_count (density model / texture energy)
    Produces: final_count, uncertainty, confidence, estimation_method, quality.
    """
    det_total = detector_body_count + unmatched_head_count

    # Determine scene complexity regime
    if det_total < 10 and suspicious_dense_regions_count == 0:
        # Sparse scene: trust bounding boxes fully
        final_count = det_total
        uncertainty = max(1, int(round(0.06 * final_count))) if final_count > 0 else 0
        fused_confidence = 0.94 if final_count > 0 else 0.98
        method = "detector_sparse"
    elif det_total <= 35 and suspicious_dense_regions_count == 0 and overlap_ratio < 0.25:
        # Moderate scene: hybrid body + head evidence
        final_count = det_total
        uncertainty = max(1, int(round(0.08 * final_count)))
        fused_confidence = 0.91
        method = "detector_head_hybrid"
    else:
        # Dense / Occluded scene: incorporate density estimator signal
        if density_estimated_count > det_total and density_confidence >= 0.60:
            # Detector is likely undercounting due to severe occlusion
            # Blend detector anchor with density estimate
            density_weight = min(0.45, 0.20 + 0.05 * suspicious_dense_regions_count)
            det_weight = 1.0 - density_weight
            blended = det_weight * det_total + density_weight * density_estimated_count
            final_count = int(round(blended))
            uncertainty = max(2, int(round(0.12 * final_count)))
            fused_confidence = round(0.85 * (1.0 - min(0.25, overlap_ratio)), 2)
            method = "hybrid_dense_crowd"
        else:
            final_count = det_total
            uncertainty = max(2, int(round(0.10 * final_count)))
            fused_confidence = 0.88
            method = "detector_dense_anchor"

    # Uncertainty range [min_bound, max_bound]
    min_bound = max(0, final_count - uncertainty)
    max_bound = final_count + uncertainty

    # Quality classification
    if fused_confidence >= 0.90 and uncertainty <= max(2, int(0.08 * max(1, final_count))):
        quality = "VERY_HIGH"
    elif fused_confidence >= 0.80:
        quality = "HIGH"
    elif fused_confidence >= 0.65:
        quality = "MEDIUM"
    elif fused_confidence >= 0.50:
        quality = "LOW"
    else:
        quality = "UNRELIABLE"

    return {
        "final_count": final_count,
        "detector_count": detector_body_count,
        "head_count": unmatched_head_count,
        "density_count": round(float(density_estimated_count), 1),
        "fused_confidence": round(fused_confidence, 2),
        "uncertainty": uncertainty,
        "uncertainty_range": [min_bound, max_bound],
        "estimation_method": method,
        "quality": quality,
        "detector_recall_warning": (density_estimated_count > det_total * 1.35 and det_total >= 15),
    }


# ---------------------------------------------------------------------------
# Phase 11 & 12: Zone Assignment & Mathematical Consistency
# ---------------------------------------------------------------------------

def assign_zones(
    detections: List[Dict[str, Any]],
    img_h: int,
    img_w: int,
    grid_rows: int = 4,
    grid_cols: int = 4,
) -> List[Dict[str, Any]]:
    """
    Assign each detected person to exactly one zone.
    sum(zone["count"]) == len(detections).
    """
    grid_rows = max(1, grid_rows)
    grid_cols = max(1, grid_cols)
    cell_h = img_h / float(grid_rows)
    cell_w = img_w / float(grid_cols)

    counts = [[0 for _ in range(grid_cols)] for _ in range(grid_rows)]

    for det in detections:
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
    """Classify crowd level based on validated person count."""
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
    """Image-space distribution heuristic in [0.0, 1.0]."""
    if total_count == 0 or img_w <= 0 or img_h <= 0:
        return 0.0

    frame_area = float(img_w * img_h)
    total_box_area = sum((d["box"][2] - d["box"][0]) * (d["box"][3] - d["box"][1]) for d in detections)

    area_ratio = min(1.0, total_box_area / frame_area)
    count_factor = min(1.0, total_count / 120.0)

    score = 0.65 * area_ratio + 0.35 * count_factor
    return round(float(min(1.0, max(0.0, score))), 2)


# ---------------------------------------------------------------------------
# Phase 13, 14 & 15: Video Temporal Tracking & Count Stabilizer
# ---------------------------------------------------------------------------

class TrackItem:
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
    Per-camera video temporal tracker.
    Bypassed when is_video=False to guarantee deterministic still-image counts.
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

            dist_matrix = np.zeros((len(track_ids), len(detections)), dtype=np.float32)
            for i, tc in enumerate(track_centroids):
                for j, dc in enumerate(det_centroids):
                    dist_matrix[i, j] = math.hypot(tc[0] - dc[0], tc[1] - dc[1])

            row_ind, col_ind = linear_sum_assignment(dist_matrix)
            for r, c in zip(row_ind, col_ind):
                if dist_matrix[r, c] <= self.dist_threshold:
                    tid = track_ids[r]
                    self.tracks[tid].update(
                        box=detections[c]["box"],
                        conf=float(detections[c]["confidence"]),
                        det_type=detections[c].get("type", "body"),
                    )
                    detections[c]["track_id"] = tid
                    matched_tracks.add(tid)
                    matched_dets.add(c)

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

        dead_ids = [
            tid for tid, track in self.tracks.items()
            if track.time_since_update > self.max_disappeared
        ]
        for tid in dead_ids:
            del self.tracks[tid]

        # Surge baseline with hysteresis
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

        # Temporal smoothing
        self.count_history.append(raw_count)
        if len(self.count_history) >= 3:
            median_count = int(np.median(list(self.count_history)))
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


_camera_trackers: Dict[str, CrowdTemporalTracker] = {}


def get_camera_tracker(camera_id: str) -> CrowdTemporalTracker:
    global _camera_trackers
    if camera_id not in _camera_trackers:
        _camera_trackers[camera_id] = CrowdTemporalTracker(camera_id=camera_id)
    return _camera_trackers[camera_id]


def reset_camera_tracker(camera_id: str) -> None:
    global _camera_trackers
    if camera_id in _camera_trackers:
        del _camera_trackers[camera_id]
        logger.info(f"[CrowdPostprocess] Temporal tracker reset for camera '{camera_id}'")
