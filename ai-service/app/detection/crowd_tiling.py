"""
Multi-Scale Sliding-Window Tiling & Dense-Region Engine
======================================================

Provides complete spatial coverage via configurable overlapping sliding windows
and adaptive dense-region identification and refinement for high-density crowds.

Features:
- Configurable multi-scale sliding window tiling covering the complete image.
- Dynamically calculated tile dimensions based on frame resolution.
- Guaranteed complete image coverage with 20-35% overlap.
- Global coordinate projection and batching.
- Dense-region reasoning for suspicious crowd areas:
  * High head count + low body count
  * High pixel occupancy + low person count
  * High box overlap + low person count
"""

from __future__ import annotations

import math
import logging
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Configurable Tiling Defaults
CROWD_TILE_OVERLAP: float = 0.25           # 25% overlap between adjacent tiles
CROWD_TILE_IMGSZ: int = 960                # High-res inference size for tiles
CROWD_MAX_TILES: int = 16                  # Hard safety ceiling on number of tiles
CROWD_DENSE_REGION_TILE_SIZE: int = 640    # High-resolution dense crop dimension


class TileWindow:
    """Represents a spatial tile crop in original frame coordinates."""

    def __init__(self, x: int, y: int, w: int, h: int, tile_id: str, scale: float = 1.0):
        self.x = int(x)
        self.y = int(y)
        self.w = int(w)
        self.h = int(h)
        self.tile_id = str(tile_id)
        self.scale = float(scale)

    @property
    def box(self) -> Tuple[int, int, int, int]:
        return (self.x, self.y, self.x + self.w, self.y + self.h)

    def crop(self, image: np.ndarray) -> np.ndarray:
        return image[self.y : self.y + self.h, self.x : self.x + self.w]

    def project_box_to_global(
        self,
        local_box: List[float],
    ) -> List[float]:
        """Convert local tile coordinates [lx1, ly1, lx2, ly2] to global frame coordinates."""
        return [
            float(local_box[0] + self.x),
            float(local_box[1] + self.y),
            float(local_box[2] + self.x),
            float(local_box[3] + self.y),
        ]


def generate_sliding_window_tiles(
    img_w: int,
    img_h: int,
    overlap: float = CROWD_TILE_OVERLAP,
    max_tiles: int = CROWD_MAX_TILES,
    min_tile_dim: int = 400,
) -> List[TileWindow]:
    """
    Generate overlapping sliding-window tiles covering the entire image.
    Guarantees 100% spatial coverage without leaving gaps in central or edge areas.

    Parameters
    ----------
    img_w        : Image width
    img_h        : Image height
    overlap      : Overlap fraction between adjacent tiles (e.g. 0.25 = 25%)
    max_tiles    : Maximum allowable tiles to avoid inference explosion
    min_tile_dim : Minimum dimension of a tile
    """
    tiles: List[TileWindow] = []

    # Small images don't need multi-tile sliding window
    if img_w <= min_tile_dim or img_h <= min_tile_dim:
        return tiles

    # Determine base tile dimensions: typically ~55-65% of image dimensions
    # so that 2x2 or 3x3 tiles cover the frame with ~25% overlap
    overlap = max(0.15, min(0.45, float(overlap)))

    # For 1080p (1920x1080) -> tile_w ~ 960-1100, tile_h ~ 600-700
    # Number of divisions along X and Y
    div_x = 2 if img_w < 1600 else 3
    div_y = 2 if img_h < 1200 else 3

    tile_w = int(img_w / (div_x - (div_x - 1) * overlap))
    tile_h = int(img_h / (div_y - (div_y - 1) * overlap))

    tile_w = max(min_tile_dim, min(img_w, tile_w))
    tile_h = max(min_tile_dim, min(img_h, tile_h))

    step_x = max(1, int(tile_w * (1.0 - overlap)))
    step_y = max(1, int(tile_h * (1.0 - overlap)))

    x_positions: List[int] = []
    x = 0
    while x + tile_w <= img_w:
        x_positions.append(x)
        x += step_x
    if not x_positions or x_positions[-1] + tile_w < img_w:
        x_positions.append(img_w - tile_w)

    y_positions: List[int] = []
    y = 0
    while y + tile_h <= img_h:
        y_positions.append(y)
        y += step_y
    if not y_positions or y_positions[-1] + tile_h < img_h:
        y_positions.append(img_h - tile_h)

    # De-duplicate positions
    x_positions = sorted(list(set(x_positions)))
    y_positions = sorted(list(set(y_positions)))

    tile_idx = 0
    for r_idx, ty in enumerate(y_positions):
        for c_idx, tx in enumerate(x_positions):
            if tile_idx >= max_tiles:
                break
            tiles.append(
                TileWindow(
                    x=tx,
                    y=ty,
                    w=tile_w,
                    h=tile_h,
                    tile_id=f"tile_r{r_idx}_c{c_idx}",
                    scale=1.0,
                )
            )
            tile_idx += 1

    return tiles


def analyze_frame_regions(
    body_detections: List[Dict[str, Any]],
    head_detections: List[Dict[str, Any]],
    img_w: int,
    img_h: int,
    grid_rows: int = 4,
    grid_cols: int = 4,
) -> List[Dict[str, Any]]:
    """
    Divide frame into adaptive reasoning patches and calculate crowd metrics:
    - person count
    - avg confidence
    - median person box size
    - box overlap ratio (IoU density)
    - visible head count
    - detector pixel occupancy
    - suspicious trigger flags
    """
    cell_w = img_w / float(grid_cols)
    cell_h = img_h / float(grid_cols)

    regions: List[Dict[str, Any]] = []

    for r in range(grid_rows):
        for c in range(grid_cols):
            rx1 = float(c * cell_w)
            ry1 = float(r * cell_h)
            rx2 = float((c + 1) * cell_w)
            ry2 = float((r + 1) * cell_h)
            patch_area = (rx2 - rx1) * (ry2 - ry1)

            # Find detections whose centers lie in this cell
            patch_bodies: List[Dict[str, Any]] = []
            for b in body_detections:
                cx = (b["box"][0] + b["box"][2]) / 2.0
                cy = (b["box"][1] + b["box"][3]) / 2.0
                if rx1 <= cx < rx2 and ry1 <= cy < ry2:
                    patch_bodies.append(b)

            patch_heads: List[Dict[str, Any]] = []
            for h in head_detections:
                cx = (h["box"][0] + h["box"][2]) / 2.0
                cy = (h["box"][1] + h["box"][3]) / 2.0
                if rx1 <= cx < rx2 and ry1 <= cy < ry2:
                    patch_heads.append(h)

            body_cnt = len(patch_bodies)
            head_cnt = len(patch_heads)

            confs = [float(b.get("confidence", 0.0)) for b in patch_bodies]
            avg_conf = float(np.mean(confs)) if confs else 0.0

            box_areas = [
                (b["box"][2] - b["box"][0]) * (b["box"][3] - b["box"][1])
                for b in patch_bodies
            ]
            median_box_area = float(np.median(box_areas)) if box_areas else 0.0

            total_box_px = sum(box_areas)
            detector_occupancy = min(1.0, total_box_px / max(1.0, patch_area))

            # Pairwise overlap ratio inside cell
            overlap_pairs = 0
            if body_cnt > 1:
                for i in range(body_cnt):
                    for j in range(i + 1, body_cnt):
                        b1 = patch_bodies[i]["box"]
                        b2 = patch_bodies[j]["box"]
                        ix1 = max(b1[0], b2[0])
                        iy1 = max(b1[1], b2[1])
                        ix2 = min(b1[2], b2[2])
                        iy2 = min(b1[3], b2[3])
                        if ix2 > ix1 and iy2 > iy1:
                            overlap_pairs += 1
                total_possible_pairs = (body_cnt * (body_cnt - 1)) / 2.0
                overlap_ratio = overlap_pairs / max(1.0, total_possible_pairs)
            else:
                overlap_ratio = 0.0

            # Trigger conditions for suspicious dense regions
            is_suspicious = False
            suspicion_reason = "normal"

            # 1. High heads, low bodies -> bodies occluded!
            if head_cnt >= 4 and body_cnt <= int(head_cnt * 0.5):
                is_suspicious = True
                suspicion_reason = "HIGH_HEAD_COUNT_LOW_BODY_COUNT"
            # 2. High pixel occupancy, few people -> overlapping occlusion or detector confusion
            elif detector_occupancy >= 0.45 and body_cnt <= 3 and avg_conf < 0.65:
                is_suspicious = True
                suspicion_reason = "HIGH_PIXEL_OCCUPANCY_LOW_PERSON_COUNT"
            # 3. High pairwise overlap with modest count
            elif body_cnt >= 5 and overlap_ratio >= 0.35:
                is_suspicious = True
                suspicion_reason = "HIGH_OVERLAP_DENSE_GATHERING"

            regions.append({
                "row": r,
                "col": c,
                "bbox": [rx1, ry1, rx2, ry2],
                "body_count": body_cnt,
                "head_count": head_cnt,
                "avg_confidence": round(avg_conf, 3),
                "median_box_area": round(median_box_area, 1),
                "detector_occupancy": round(detector_occupancy, 3),
                "overlap_ratio": round(overlap_ratio, 3),
                "is_suspicious": is_suspicious,
                "suspicion_reason": suspicion_reason,
            })

    return regions


def generate_dense_region_tiles(
    regions: List[Dict[str, Any]],
    img_w: int,
    img_h: int,
    crop_size: int = CROWD_DENSE_REGION_TILE_SIZE,
    max_dense_crops: int = 4,
) -> List[TileWindow]:
    """
    Generate zoomed high-resolution refinement tiles around suspicious dense regions.
    Expands bounding box around dense clusters to give detector full context.
    """
    suspicious_regions = [r for r in regions if r.get("is_suspicious", False)]
    if not suspicious_regions:
        return []

    # Sort by severity (head count + overlap)
    suspicious_regions.sort(
        key=lambda r: r["head_count"] + r["body_count"] * (1.0 + r["overlap_ratio"]),
        reverse=True,
    )

    dense_tiles: List[TileWindow] = []
    half_crop = crop_size // 2

    for idx, sr in enumerate(suspicious_regions[:max_dense_crops]):
        rx1, ry1, rx2, ry2 = sr["bbox"]
        cx = int((rx1 + rx2) / 2.0)
        cy = int((ry1 + ry2) / 2.0)

        # Center crop window around region center
        tx1 = max(0, cx - half_crop)
        ty1 = max(0, cy - half_crop)
        tx2 = min(img_w, tx1 + crop_size)
        ty2 = min(img_h, ty1 + crop_size)

        # Re-adjust if hitting borders
        if tx2 - tx1 < crop_size and tx2 == img_w:
            tx1 = max(0, tx2 - crop_size)
        if ty2 - ty1 < crop_size and ty2 == img_h:
            ty1 = max(0, ty2 - crop_size)

        w = tx2 - tx1
        h = ty2 - ty1
        if w >= 240 and h >= 240:
            dense_tiles.append(
                TileWindow(
                    x=tx1,
                    y=ty1,
                    w=w,
                    h=h,
                    tile_id=f"dense_region_{idx}",
                    scale=1.0,
                )
            )

    return dense_tiles
