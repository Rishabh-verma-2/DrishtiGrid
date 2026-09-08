"""
Vehicle-to-Plate Spatial and Geometric Association Module.

Associates license plate candidate bounding boxes to detected vehicles using
spatial containment, area ratios, vertical/horizontal priors, and aspect plausibility.
Supports cars, SUVs, trucks, buses, motorcycles, and dense traffic queues.
"""

from dataclasses import dataclass
import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class AssociationMatch:
    plate_index: int
    vehicle_index: Optional[int]
    vehicle_id: Optional[str]
    plausibility_score: float
    vertical_rel_pos: float
    horizontal_offset: float
    area_ratio: float
    inside_vehicle: bool
    is_orphan: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "vehicle_id": self.vehicle_id,
            "plausibility_score": round(self.plausibility_score, 3),
            "vertical_rel_pos": round(self.vertical_rel_pos, 3),
            "horizontal_offset": round(self.horizontal_offset, 3),
            "area_ratio": round(self.area_ratio, 4),
            "inside_vehicle": self.inside_vehicle,
            "is_orphan": self.is_orphan,
        }


def compute_box_intersection_over_plate(plate_box: List[float], vehicle_box: List[float]) -> float:
    """Compute (area(plate ∩ vehicle)) / area(plate)."""
    px1, py1, px2, py2 = plate_box
    vx1, vy1, vx2, vy2 = vehicle_box

    ix1 = max(px1, vx1)
    iy1 = max(py1, vy1)
    ix2 = min(px2, vx2)
    iy2 = min(py2, vy2)

    inter_w = max(0.0, ix2 - ix1)
    inter_h = max(0.0, iy2 - iy1)
    inter_area = inter_w * inter_h

    plate_area = max(1e-5, (px2 - px1) * (py2 - py1))
    return float(inter_area / plate_area)


def score_plate_vehicle_pair(
    plate_box: List[float],
    vehicle_box: List[float],
    vehicle_type: str = "car",
) -> Tuple[float, Dict[str, Any]]:
    """
    Score how plausibly a plate bounding box belongs to a vehicle bounding box.
    Returns (plausibility_score in 0.0..1.0, diagnostic_details).
    """
    px1, py1, px2, py2 = plate_box
    vx1, vy1, vx2, vy2 = vehicle_box

    pw = max(1.0, px2 - px1)
    ph = max(1.0, py2 - py1)
    plate_area = pw * ph
    pcx = (px1 + px2) / 2.0
    pcy = (py1 + py2) / 2.0

    vw = max(1.0, vx2 - vx1)
    vh = max(1.0, vy2 - vy1)
    vehicle_area = vw * vh
    vcx = (vx1 + vx2) / 2.0
    vcy = (vy1 + vy2) / 2.0

    # 1. Containment & Overlap
    iop = compute_box_intersection_over_plate(plate_box, vehicle_box)
    inside = (vx1 <= pcx <= vx2) and (vy1 <= pcy <= vy2)

    # Margin check: plate center slightly outside due to bumper protrusion
    margin_x = 0.08 * vw
    margin_y = 0.08 * vh
    near_inside = (vx1 - margin_x <= pcx <= vx2 + margin_x) and (vy1 - margin_y <= pcy <= vy2 + margin_y)

    if not near_inside and iop < 0.15:
        return 0.0, {
            "plausibility": 0.0,
            "iop": iop,
            "inside": False,
            "rel_y": -1.0,
            "rel_x_offset": -1.0,
            "area_ratio": plate_area / vehicle_area,
        }

    # 2. Area Ratio Check
    area_ratio = plate_area / vehicle_area
    # Realistic plate / vehicle ratio is typically 0.003 to 0.12 (up to 0.20 for distant 2-wheelers)
    if area_ratio < 0.0005:
        area_score = 0.3  # Too tiny
    elif 0.002 <= area_ratio <= 0.12:
        area_score = 1.0  # Ideal
    elif area_ratio <= 0.22:
        area_score = 0.7  # Plausible for motorcycle/distant vehicle
    elif area_ratio <= 0.35:
        area_score = 0.4
    else:
        area_score = 0.1  # Plate is massive compared to vehicle, likely erroneous

    # 3. Vertical Position Prior
    # rel_y = 0.0 at top of vehicle, 1.0 at bottom of vehicle
    rel_y = (pcy - vy1) / vh

    v_type = vehicle_type.lower() if vehicle_type else "car"
    if "motorcycle" in v_type or "bike" in v_type or "two_wheeler" in v_type:
        # 2-wheelers: plates are lower rear or high front fender
        if 0.40 <= rel_y <= 0.98:
            vertical_score = 1.0
        elif 0.20 <= rel_y < 0.40:
            vertical_score = 0.75
        elif 0.98 < rel_y <= 1.10:
            vertical_score = 0.8  # Hanging tail
        else:
            vertical_score = 0.3
    elif "bus" in v_type or "truck" in v_type:
        # Heavy commercial: plates on bumper (bottom 25%) or mid/rear grille
        if 0.55 <= rel_y <= 0.98:
            vertical_score = 1.0
        elif 0.30 <= rel_y < 0.55:
            vertical_score = 0.8
        elif 0.98 < rel_y <= 1.08:
            vertical_score = 0.8
        else:
            vertical_score = 0.4
    else:
        # Standard Car / SUV / Van
        # Peak probability is lower bumper/trunk area (0.55 to 0.95)
        if 0.55 <= rel_y <= 0.96:
            vertical_score = 1.0
        elif 0.40 <= rel_y < 0.55:
            vertical_score = 0.7  # High grille or rear tailgate
        elif 0.96 < rel_y <= 1.08:
            vertical_score = 0.85 # Low hanging bumper
        elif 0.25 <= rel_y < 0.40:
            vertical_score = 0.45 # Windshield/hood
        else:
            vertical_score = 0.2

    # 4. Horizontal Alignment Check
    # Plates are normally mounted near the horizontal center line
    rel_x_offset = abs(pcx - vcx) / (vw / 2.0)
    if rel_x_offset <= 0.45:
        horizontal_score = 1.0
    elif rel_x_offset <= 0.85:
        horizontal_score = 0.85
    elif rel_x_offset <= 1.10:
        horizontal_score = 0.6
    else:
        horizontal_score = 0.3

    # 5. Overlap score
    overlap_score = iop if inside else max(0.2, iop)

    # Combined Plausibility
    plausibility = (
        0.35 * overlap_score +
        0.25 * vertical_score +
        0.20 * area_score +
        0.20 * horizontal_score
    )

    if not inside and not near_inside:
        plausibility *= 0.5

    return float(np.clip(plausibility, 0.0, 1.0)), {
        "plausibility": float(plausibility),
        "iop": iop,
        "inside": inside,
        "rel_y": float(rel_y),
        "rel_x_offset": float(rel_x_offset),
        "area_ratio": float(area_ratio),
    }


def associate_plates_to_vehicles(
    vehicles: List[Dict[str, Any]],
    plate_candidates: List[Dict[str, Any]],
    image_shape: Optional[Tuple[int, int]] = None,
    min_association_plausibility: float = 0.30,
) -> List[AssociationMatch]:
    """
    Associate a list of plate candidate boxes with detected vehicles.
    Resolves multi-vehicle overlaps and preserves orphan candidate plates.
    """
    matches: List[AssociationMatch] = []

    if not plate_candidates:
        return matches

    if not vehicles:
        # All plates are orphans
        for p_idx, p in enumerate(plate_candidates):
            matches.append(
                AssociationMatch(
                    plate_index=p_idx,
                    vehicle_index=None,
                    vehicle_id=None,
                    plausibility_score=0.0,
                    vertical_rel_pos=0.0,
                    horizontal_offset=0.0,
                    area_ratio=0.0,
                    inside_vehicle=False,
                    is_orphan=True,
                )
            )
        return matches

    for p_idx, plate in enumerate(plate_candidates):
        pbox = plate.get("bbox") or plate.get("box") or [0, 0, 0, 0]

        best_v_idx = None
        best_score = -1.0
        best_diag = {}

        for v_idx, veh in enumerate(vehicles):
            vbox = veh.get("bbox") or veh.get("box") or [0, 0, 0, 0]
            vtype = veh.get("vehicle_type") or veh.get("class_name") or "car"

            score, diag = score_plate_vehicle_pair(pbox, vbox, vtype)
            if score > best_score:
                best_score = score
                best_v_idx = v_idx
                best_diag = diag

        if best_v_idx is not None and best_score >= min_association_plausibility:
            v_obj = vehicles[best_v_idx]
            vid = v_obj.get("vehicle_id") or f"veh_{best_v_idx}"
            matches.append(
                AssociationMatch(
                    plate_index=p_idx,
                    vehicle_index=best_v_idx,
                    vehicle_id=vid,
                    plausibility_score=best_score,
                    vertical_rel_pos=best_diag.get("rel_y", 0.0),
                    horizontal_offset=best_diag.get("rel_x_offset", 0.0),
                    area_ratio=best_diag.get("area_ratio", 0.0),
                    inside_vehicle=best_diag.get("inside", False),
                    is_orphan=False,
                )
            )
        else:
            # Orphan plate candidate
            matches.append(
                AssociationMatch(
                    plate_index=p_idx,
                    vehicle_index=None,
                    vehicle_id=None,
                    plausibility_score=max(0.0, best_score if best_score > 0 else 0.0),
                    vertical_rel_pos=best_diag.get("rel_y", 0.0) if best_diag else 0.0,
                    horizontal_offset=best_diag.get("rel_x_offset", 0.0) if best_diag else 0.0,
                    area_ratio=best_diag.get("area_ratio", 0.0) if best_diag else 0.0,
                    inside_vehicle=False,
                    is_orphan=True,
                )
            )

    return matches
