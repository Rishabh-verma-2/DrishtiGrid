"""
Multi-Scale Sliding-Window Tiling & Dense-Region Engine
======================================================

Provides complete spatial coverage via configurable overlapping sliding windows
and adaptive dense-region identification and hierarchical refinement for high-density crowds.

Features:
- Resolution-aware & perspective-adaptive sliding window tiling covering the complete image.
- Guaranteed complete image coverage with 20-35% overlap without spatial gaps.
- True coarse-to-fine hierarchical crowd analysis (Level 0 full-frame, Level 1 spatial tiles,
  Level 2 dense-region crops, Level 3 high-residual refinement).
- Multi-signal suspicious region reasoning:
  * Detector count & head/body ratio
  * Local gradient energy & edge density (Sobel/Canny)
  * Local Shannon entropy
  * Foreground occupancy & box overlap
  * Spatial residual analysis (density model vs detector discrepancy)
- High-quality micro-person crop preprocessing with Lanczos interpolation & gentle CLAHE.
- Global coordinate projection and batching.
"""

from __future__ import annotations

import math
import logging
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Configurable Tiling & Resolution Defaults
CROWD_TILE_OVERLAP: float = 0.25           # 25% overlap between adjacent tiles
CROWD_TILE_IMGSZ: int = 960                # High-res inference size for tiles
CROWD_MAX_TILES: int = 16                  # Hard safety ceiling on number of tiles
CROWD_DENSE_REGION_TILE_SIZE: int = 640    # High-resolution dense crop dimension

# Resolution-Aware Standards
MIN_EFFECTIVE_PERSON_PIXELS: int = 18      # Minimum pixels a small person must occupy
MAX_TILE_INFERENCE_SIZE: int = 1280        # Upper ceiling for high-res zoom tiles
MIN_TILE_INFERENCE_SIZE: int = 640         # Lower floor for tile inference size
TARGET_SMALL_PERSON_HEIGHT: int = 48       # Target pixel height for small distant people


class TileWindow:
    """Represents a spatial tile crop in original frame coordinates."""

    def __init__(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        tile_id: str,
        scale: float = 1.0,
        level: int = 1,
        inference_size: int = CROWD_TILE_IMGSZ,
    ):
        self.x = int(max(0, x))
        self.y = int(max(0, y))
        self.w = int(max(1, w))
        self.h = int(max(1, h))
        self.tile_id = str(tile_id)
        self.scale = float(scale)
        self.level = int(level)
        self.inference_size = int(inference_size)

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


def compute_effective_tile_resolution(
    tile_w: int,
    tile_h: int,
    expected_person_h: float = 24.0,
    target_person_h: float = TARGET_SMALL_PERSON_HEIGHT,
) -> int:
    """
    Compute optimal inference resolution for a tile so that small people
    occupy enough pixels for the model to detect them reliably.
    """
    if expected_person_h <= 0:
        return CROWD_TILE_IMGSZ

    # Required scale factor to expand small person to target pixel height
    scale_factor = target_person_h / max(10.0, expected_person_h)
    max_dim = max(tile_w, tile_h)
    calculated_imgsz = int(round(max_dim * scale_factor / 32.0)) * 32
    return max(MIN_TILE_INFERENCE_SIZE, min(MAX_TILE_INFERENCE_SIZE, calculated_imgsz))


def generate_sliding_window_tiles(
    img_w: int,
    img_h: int,
    overlap: float = CROWD_TILE_OVERLAP,
    max_tiles: int = CROWD_MAX_TILES,
    min_tile_dim: int = 320,
    perspective_aware: bool = True,
) -> List[TileWindow]:
    """
    Generate overlapping sliding-window tiles covering the entire image.
    Guarantees 100% spatial coverage without leaving gaps in central or edge areas.

    When perspective_aware is True:
    - Background/top rows (where people are small) receive smaller spatial tile footprints
      with higher zoom ratio to enlarge tiny distant faces and bodies.
    - Foreground/bottom rows (where people are larger) receive standard tile footprints.
    """
    tiles: List[TileWindow] = []

    # Small images don't need multi-tile sliding window
    if img_w <= min_tile_dim or img_h <= min_tile_dim:
        return tiles

    overlap = max(0.18, min(0.40, float(overlap)))

    # Determine divisions along X and Y
    div_x = 2 if img_w < 1400 else 3
    div_y = 2 if img_h < 1000 else 3

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
        x_positions.append(max(0, img_w - tile_w))

    y_positions: List[int] = []
    y = 0
    while y + tile_h <= img_h:
        y_positions.append(y)
        y += step_y
    if not y_positions or y_positions[-1] + tile_h < img_h:
        y_positions.append(max(0, img_h - tile_h))

    # De-duplicate positions
    x_positions = sorted(list(set(x_positions)))
    y_positions = sorted(list(set(y_positions)))

    tile_idx = 0
    for r_idx, ty in enumerate(y_positions):
        # Estimate expected person height by vertical perspective
        norm_y = (ty + tile_h * 0.5) / float(max(1, img_h))
        if perspective_aware:
            # Top area = distant/small (18-35px), middle = 40-90px, bottom = 100-250px
            expected_h = 20.0 + 120.0 * (norm_y ** 1.5)
            infer_sz = compute_effective_tile_resolution(tile_w, tile_h, expected_person_h=expected_h)
        else:
            infer_sz = CROWD_TILE_IMGSZ

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
                    level=1,
                    inference_size=infer_sz,
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
    image: Optional[np.ndarray] = None,
    density_map: Optional[np.ndarray] = None,
) -> List[Dict[str, Any]]:
    """
    Divide frame into adaptive reasoning patches and calculate multi-signal crowd metrics:
    - person count
    - avg confidence
    - median person box size
    - box overlap ratio (IoU density)
    - visible head count
    - detector pixel occupancy
    - local texture gradient energy (Sobel magnitude)
    - edge density (Canny/Laplacian edge count per unit area)
    - local Shannon entropy
    - spatial residual density expectation
    - suspicious trigger flags

    Exact Spatial Coverage:
    cell_w = img_w / float(grid_cols)
    cell_h = img_h / float(grid_rows)
    """
    grid_rows = max(1, int(grid_rows))
    grid_cols = max(1, int(grid_cols))

    # CRITICAL: Fix non-square grid calculation
    cell_w = img_w / float(grid_cols)
    cell_h = img_h / float(grid_rows)

    regions: List[Dict[str, Any]] = []

    # Pre-calculate global image statistics if image is provided
    gray = None
    if image is not None and image.size > 0:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

    for r in range(grid_rows):
        for c in range(grid_cols):
            rx1 = float(c * cell_w)
            ry1 = float(r * cell_h)
            rx2 = float(min(img_w, (c + 1) * cell_w))
            ry2 = float(min(img_h, (r + 1) * cell_h))
            patch_area = max(1.0, (rx2 - rx1) * (ry2 - ry1))

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
                max(1.0, (b["box"][2] - b["box"][0]) * (b["box"][3] - b["box"][1]))
                for b in patch_bodies
            ]
            median_box_area = float(np.median(box_areas)) if box_areas else 0.0

            total_box_px = sum(box_areas)
            detector_occupancy = min(1.0, total_box_px / patch_area)

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

            # Multi-signal raw visual texture & edge analysis
            grad_energy = 0.0
            edge_density = 0.0
            entropy = 0.0

            if gray is not None:
                ix1, iy1, ix2, iy2 = int(rx1), int(ry1), int(rx2), int(ry2)
                patch_gray = gray[iy1:iy2, ix1:ix2]
                if patch_gray.size > 16:
                    gx = cv2.Sobel(patch_gray, cv2.CV_32F, 1, 0, ksize=3)
                    gy = cv2.Sobel(patch_gray, cv2.CV_32F, 0, 1, ksize=3)
                    grad_energy = float(np.mean(cv2.magnitude(gx, gy)))

                    edges = cv2.Canny(patch_gray, 40, 130)
                    edge_density = float(np.count_nonzero(edges)) / float(max(1, patch_gray.size))

                    hist, _ = np.histogram(patch_gray, bins=32, range=(0, 256), density=True)
                    hist = hist[hist > 0]
                    entropy = float(-np.sum(hist * np.log2(hist)))

            # Sample density map if available
            density_cell_val = 0.0
            if density_map is not None and density_map.size > 0:
                dh, dw = density_map.shape[:2]
                mx1 = max(0, min(dw - 1, int((rx1 / img_w) * dw)))
                my1 = max(0, min(dh - 1, int((ry1 / img_h) * dh)))
                mx2 = max(mx1 + 1, min(dw, int(math.ceil((rx2 / img_w) * dw))))
                my2 = max(my1 + 1, min(dh, int(math.ceil((ry2 / img_h) * dh))))
                density_patch = density_map[my1:my2, mx1:mx2]
                if density_patch.size > 0:
                    density_cell_val = float(np.sum(density_patch))

            # Trigger conditions for suspicious dense regions (Multi-Signal)
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
            # 4. High visual texture & edge density but few/no detections -> missed crowd
            elif edge_density >= 0.07 and grad_energy >= 24.0 and body_cnt <= 2:
                is_suspicious = True
                suspicion_reason = "HIGH_TEXTURE_EDGE_ENERGY_LOW_DETECTIONS"
            # 5. Spatial residual: density model expects significantly more individuals
            elif density_cell_val >= 3.0 and (density_cell_val - float(body_cnt)) >= 2.5:
                is_suspicious = True
                suspicion_reason = "HIGH_SPATIAL_RESIDUAL_DENSITY_MISMATCH"

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
                "grad_energy": round(grad_energy, 2),
                "edge_density": round(edge_density, 3),
                "entropy": round(entropy, 2),
                "density_expectation": round(density_cell_val, 2),
                "is_suspicious": is_suspicious,
                "suspicion_reason": suspicion_reason,
            })

    return regions


def compute_spatial_residual_map(
    density_map: np.ndarray,
    body_detections: List[Dict[str, Any]],
    head_detections: Optional[List[Dict[str, Any]]] = None,
    img_w: int = 1920,
    img_h: int = 1080,
    residual_threshold: float = 0.28,
) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Generate spatial residual map comparing density model energy with detector occupancy.
    Identifies high-residual clusters (under-detected crowd pockets).

    R(x, y) = max(0, DensityField(x, y) - DetectorOccupancy(x, y))
    """
    if head_detections is None:
        head_detections = []
    if density_map is None or density_map.size == 0:
        return np.zeros((10, 10), dtype=np.float32), []

    dh, dw = density_map.shape[:2]
    # Build detector occupancy map at the same resolution as density_map
    detector_field = np.zeros((dh, dw), dtype=np.float32)

    scale_x = float(dw) / float(max(1, img_w))
    scale_y = float(dh) / float(max(1, img_h))

    for b in body_detections:
        x1, y1, x2, y2 = b["box"]
        mx1 = max(0, min(dw - 1, int(x1 * scale_x)))
        my1 = max(0, min(dh - 1, int(y1 * scale_y)))
        mx2 = max(mx1 + 1, min(dw, int(x2 * scale_x)))
        my2 = max(my1 + 1, min(dh, int(y2 * scale_y)))
        detector_field[my1:my2, mx1:mx2] += 0.85

    for h in head_detections:
        x1, y1, x2, y2 = h["box"]
        mx1 = max(0, min(dw - 1, int(x1 * scale_x)))
        my1 = max(0, min(dh - 1, int(y1 * scale_y)))
        mx2 = max(mx1 + 1, min(dw, int(x2 * scale_x)))
        my2 = max(my1 + 1, min(dh, int(y2 * scale_y)))
        detector_field[my1:my2, mx1:mx2] += 0.45

    detector_field = np.clip(detector_field, 0.0, 1.0)
    smooth_det = cv2.GaussianBlur(detector_field, (5, 5), 0)

    # Compute raw residual map
    norm_density = density_map.astype(np.float32)
    max_d = float(np.max(norm_density))
    if max_d > 1e-6:
        norm_density = norm_density / max_d

    residual_map = np.maximum(0.0, norm_density - smooth_det)
    residual_map = cv2.GaussianBlur(residual_map, (5, 5), 0)

    # Detect high-residual regions
    high_mask = (residual_map >= residual_threshold).astype(np.uint8) * 255
    contours, _ = cv2.findContours(high_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    residual_regions: List[Dict[str, Any]] = []
    inv_scale_x = float(img_w) / float(dw)
    inv_scale_y = float(img_h) / float(dh)

    for idx, cnt in enumerate(contours):
        if cv2.contourArea(cnt) < 6:
            continue
        cx, cy, cw, ch = cv2.boundingRect(cnt)
        gx1 = float(max(0, cx * inv_scale_x))
        gy1 = float(max(0, cy * inv_scale_y))
        gx2 = float(min(img_w, (cx + cw) * inv_scale_x))
        gy2 = float(min(img_h, (cy + ch) * inv_scale_y))

        # Peak intensity inside contour
        mask_crop = high_mask[cy : cy + ch, cx : cx + cw]
        res_crop = residual_map[cy : cy + ch, cx : cx + cw]
        mean_residual = float(np.mean(res_crop[mask_crop > 0])) if np.any(mask_crop > 0) else 0.0

        residual_regions.append({
            "region_id": f"residual_{idx}",
            "bbox": [gx1, gy1, gx2, gy2],
            "mean_residual": round(mean_residual, 3),
            "area_px": round((gx2 - gx1) * (gy2 - gy1), 1),
        })

    # Sort descending by residual severity
    residual_regions.sort(key=lambda r: r["mean_residual"], reverse=True)
    return residual_map, residual_regions


def generate_dense_region_tiles(
    regions: List[Dict[str, Any]],
    img_w: int,
    img_h: int,
    crop_size: int = CROWD_DENSE_REGION_TILE_SIZE,
    max_dense_crops: int = 6,
    level: int = 2,
) -> List[TileWindow]:
    """
    Generate Level 2 zoomed high-resolution refinement tiles around suspicious dense regions.
    Expands bounding box around dense clusters to give detector full context.
    """
    suspicious_regions = [r for r in regions if r.get("is_suspicious", False)]
    if not suspicious_regions:
        return []

    # Sort by severity (texture energy + head count + overlap)
    suspicious_regions.sort(
        key=lambda r: (
            r.get("head_count", 0)
            + r.get("body_count", 0) * (1.0 + r.get("overlap_ratio", 0.0))
            + r.get("grad_energy", 0.0) * 0.1
        ),
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
        if w >= 220 and h >= 220:
            dense_tiles.append(
                TileWindow(
                    x=tx1,
                    y=ty1,
                    w=w,
                    h=h,
                    tile_id=f"dense_region_L{level}_{idx}",
                    scale=1.0,
                    level=level,
                    inference_size=CROWD_TILE_IMGSZ,
                )
            )

    return dense_tiles


def generate_residual_refinement_tiles(
    residual_regions: List[Dict[str, Any]],
    img_w: int,
    img_h: int,
    crop_size: int = 512,
    max_crops: int = 4,
    level: int = 3,
) -> List[TileWindow]:
    """
    Generate Level 3 micro-person refinement tiles targeting high-residual pockets
    where density model indicates crowd occupancy but detector missed instances.
    """
    if not residual_regions:
        return []

    res_tiles: List[TileWindow] = []
    half_crop = crop_size // 2

    for idx, rr in enumerate(residual_regions[:max_crops]):
        rx1, ry1, rx2, ry2 = rr["bbox"]
        cx = int((rx1 + rx2) / 2.0)
        cy = int((ry1 + ry2) / 2.0)

        tx1 = max(0, cx - half_crop)
        ty1 = max(0, cy - half_crop)
        tx2 = min(img_w, tx1 + crop_size)
        ty2 = min(img_h, ty1 + crop_size)

        if tx2 - tx1 < crop_size and tx2 == img_w:
            tx1 = max(0, tx2 - crop_size)
        if ty2 - ty1 < crop_size and ty2 == img_h:
            ty1 = max(0, ty2 - crop_size)

        w = tx2 - tx1
        h = ty2 - ty1
        if w >= 180 and h >= 180:
            res_tiles.append(
                TileWindow(
                    x=tx1,
                    y=ty1,
                    w=w,
                    h=h,
                    tile_id=f"residual_refine_L{level}_{idx}",
                    scale=1.0,
                    level=level,
                    inference_size=CROWD_TILE_IMGSZ,
                )
            )

    return res_tiles


def enhance_crop_for_micro_persons(
    crop_img: np.ndarray,
    target_size: Optional[Tuple[int, int]] = None,
) -> np.ndarray:
    """
    Upscale and apply gentle CLAHE contrast optimization on dark or shaded crowd pockets.
    Reveals facial contours and occluded shoulders for small individuals.
    """
    if crop_img is None or crop_img.size == 0:
        return crop_img

    out = crop_img
    if target_size is not None and (out.shape[1] != target_size[0] or out.shape[0] != target_size[1]):
        out = cv2.resize(out, target_size, interpolation=cv2.INTER_LANCZOS4)

    # Gentle CLAHE in LAB color space
    try:
        lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8))
        l_eq = clahe.apply(l)
        lab_eq = cv2.merge((l_eq, a, b))
        return cv2.cvtColor(lab_eq, cv2.COLOR_LAB2BGR)
    except Exception:
        return out
