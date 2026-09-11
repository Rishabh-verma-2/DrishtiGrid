"""
Spatial Candidate Clustering Module.

Replaces naive global greedy NMS by clustering plate detections spatially,
incorporating source reliability weights and multi-pass confirmation bonuses.
Prevents unconfirmed contour false positives from dominating legitimate plates.
"""

from dataclasses import dataclass, field
import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# Reliability weights by detection origin
SOURCE_RELIABILITY: Dict[str, float] = {
    "dedicated_lp": 1.00,
    "vehicle_cascade": 0.90,
    "tile": 0.80,
    "full_frame": 0.70,
    "ocr_localization": 0.60,
    "contour": 0.30,
}


@dataclass
class CandidateCluster:
    cluster_id: int
    bbox: List[int]                     # [x1, y1, x2, y2]
    confidence: float                  # Fused detection confidence
    sources: List[str] = field(default_factory=list)
    source_count: int = 0
    raw_candidates: List[Dict[str, Any]] = field(default_factory=list)
    is_contour_only: bool = False
    best_source: str = "contour"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cluster_id": self.cluster_id,
            "bbox": self.bbox,
            "confidence": round(self.confidence, 4),
            "sources": self.sources,
            "source_count": self.source_count,
            "is_contour_only": self.is_contour_only,
            "best_source": self.best_source,
            "candidate_count": len(self.raw_candidates),
        }


def compute_iou(boxA: List[float], boxB: List[float]) -> float:
    """Standard Intersection over Union between two [x1, y1, x2, y2] boxes."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    interArea = inter_w * inter_h
    if interArea <= 0.0:
        return 0.0

    boxAArea = max(1e-5, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    boxBArea = max(1e-5, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))
    return float(interArea / (boxAArea + boxBArea - interArea))


def compute_center_distance_ratio(boxA: List[float], boxB: List[float]) -> float:
    """Distance between centers normalized by the average diagonal of the boxes."""
    cAx = (boxA[0] + boxA[2]) / 2.0
    cAy = (boxA[1] + boxA[3]) / 2.0
    cBx = (boxB[0] + boxB[2]) / 2.0
    cBy = (boxB[1] + boxB[3]) / 2.0

    diagA = np.hypot(boxA[2] - boxA[0], boxA[3] - boxA[1])
    diagB = np.hypot(boxB[2] - boxB[0], boxB[3] - boxB[1])
    avg_diag = max(1.0, (diagA + diagB) / 2.0)

    dist = np.hypot(cAx - cBx, cAy - cBy)
    return float(dist / avg_diag)


def _normalize_box(cand_or_box: Any) -> List[float]:
    if isinstance(cand_or_box, dict):
        if "box" in cand_or_box and isinstance(cand_or_box["box"], (list, tuple)) and len(cand_or_box["box"]) >= 4:
            return [float(v) for v in cand_or_box["box"][:4]]
        if "bbox" in cand_or_box:
            b = cand_or_box["bbox"]
            if isinstance(b, (list, tuple)) and len(b) >= 4:
                return [float(v) for v in b[:4]]
            if isinstance(b, dict):
                if "x1" in b:
                    return [float(b["x1"]), float(b["y1"]), float(b["x2"]), float(b["y2"])]
                if "x" in b:
                    return [float(b["x"]), float(b["y"]), float(b["x"] + b.get("width", 0)), float(b["y"] + b.get("height", 0))]
        if "x1" in cand_or_box:
            return [float(cand_or_box["x1"]), float(cand_or_box["y1"]), float(cand_or_box["x2"]), float(cand_or_box["y2"])]
        if "x" in cand_or_box:
            return [float(cand_or_box["x"]), float(cand_or_box["y"]), float(cand_or_box["x"] + cand_or_box.get("width", 0)), float(cand_or_box["y"] + cand_or_box.get("height", 0))]
    elif isinstance(cand_or_box, (list, tuple)) and len(cand_or_box) >= 4:
        return [float(v) for v in cand_or_box[:4]]
    return [0.0, 0.0, 0.0, 0.0]


def cluster_plate_candidates(
    candidates: List[Dict[str, Any]],
    iou_threshold: float = 0.40,
    center_dist_threshold: float = 0.35,
    discard_unconfirmed_contours: bool = True,
) -> List[CandidateCluster]:
    """
    Groups plate candidates across multiple detector passes into spatial clusters.
    Computes a reliability-weighted fused bounding box and confidence score.
    """
    if not candidates:
        return []

    # Sort candidates by raw confidence descending
    sorted_cands = sorted(
        candidates,
        key=lambda c: (
            SOURCE_RELIABILITY.get(c.get("source", "contour"), 0.3) * float(c.get("confidence", 0.0))
        ),
        reverse=True,
    )

    clusters: List[List[Dict[str, Any]]] = []

    for cand in sorted_cands:
        box = _normalize_box(cand)
        assigned = False

        for cl in clusters:
            # Compare with the primary/anchor candidate of the cluster
            anchor_box = _normalize_box(cl[0])
            iou = compute_iou(box, anchor_box)
            dist_ratio = compute_center_distance_ratio(box, anchor_box)

            if iou >= iou_threshold or dist_ratio <= center_dist_threshold:
                cl.append(cand)
                assigned = True
                break

        if not assigned:
            clusters.append([cand])

    result_clusters: List[CandidateCluster] = []

    for cl_idx, cl in enumerate(clusters):
        sources = list({c.get("source", "unknown") for c in cl})
        is_contour_only = (len(sources) == 1 and sources[0] == "contour")

        if is_contour_only and discard_unconfirmed_contours:
            # Contour alone must never generate a standalone verified plate
            logger.debug("Discarding unconfirmed contour-only cluster #%d", cl_idx)
            continue

        # Compute weighted average bbox using source reliability * confidence
        weights = []
        for c in cl:
            src = c.get("source", "unknown")
            rel = SOURCE_RELIABILITY.get(src, 0.5)
            conf = float(c.get("confidence", 0.5))
            weights.append(max(0.01, rel * conf))

        total_weight = sum(weights)
        norm_weights = [w / total_weight for w in weights]

        boxes = [_normalize_box(c) for c in cl]
        fused_x1 = sum(w * b[0] for w, b in zip(norm_weights, boxes))
        fused_y1 = sum(w * b[1] for w, b in zip(norm_weights, boxes))
        fused_x2 = sum(w * b[2] for w, b in zip(norm_weights, boxes))
        fused_y2 = sum(w * b[3] for w, b in zip(norm_weights, boxes))

        # Best candidate (highest source reliability * confidence)
        best_cand = max(
            cl,
            key=lambda c: SOURCE_RELIABILITY.get(c.get("source", "unknown"), 0.5) * float(c.get("confidence", 0.0))
        )
        best_source = best_cand.get("source", "unknown")

        # Fused confidence: base confidence is from best candidate, plus confirmation bonus
        base_conf = float(best_cand.get("confidence", 0.5))
        distinct_sources = len(sources)
        confirmation_bonus = min(0.15, max(0.0, (distinct_sources - 1) * 0.05))
        fused_conf = float(np.clip(base_conf + confirmation_bonus, 0.0, 1.0))

        result_clusters.append(
            CandidateCluster(
                cluster_id=cl_idx,
                bbox=[int(round(fused_x1)), int(round(fused_y1)), int(round(fused_x2)), int(round(fused_y2))],
                confidence=fused_conf,
                sources=sources,
                source_count=len(sources),
                raw_candidates=cl,
                is_contour_only=is_contour_only,
                best_source=best_source,
            )
        )

    # Sort final clusters by fused confidence
    result_clusters.sort(key=lambda c: c.confidence, reverse=True)
    return result_clusters
