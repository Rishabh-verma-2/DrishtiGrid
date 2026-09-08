"""
Vehicle attribute detection module.
Extracts vehicle bounding box containing license plate, and determines vehicle color and model.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

# Apply safe torch load for PyTorch 2.6+ compatibility before importing ultralytics
try:
    import torch
    _orig_torch_load = torch.load
    def _safe_torch_load(*args, **kwargs):
        kwargs.setdefault("weights_only", False)
        return _orig_torch_load(*args, **kwargs)
    torch.load = _safe_torch_load
except Exception:
    pass

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

logger = logging.getLogger(__name__)

# Preload lightweight YOLOv8 nano model for COCO classes
# COCO classes for vehicles: 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

_yolo_vehicle_model = None


def _get_vehicle_model():
    """Lazy-load the YOLOv8/YOLO11 model for vehicle detection."""
    global _yolo_vehicle_model
    if YOLO is None:
        return None
    if _yolo_vehicle_model is None:
        try:
            candidate_paths = [
                Path(__file__).resolve().parent.parent.parent / "model_weights" / "yolo11s.pt",
                Path(__file__).resolve().parent.parent.parent / "model_weights" / "yolo11n.pt",
                Path(__file__).resolve().parent.parent / "model_weights" / "yolo11s.pt",
                Path(__file__).resolve().parent.parent / "model_weights" / "yolo11n.pt",
                Path(__file__).resolve().parent.parent.parent / "model_weights" / "yolov8n.pt",
                Path("model_weights/yolo11s.pt"),
                Path("yolov8n.pt"),
            ]
            model_path = None
            for p in candidate_paths:
                if p.is_file():
                    model_path = str(p)
                    break

            if model_path:
                logger.info(f"Loading YOLO vehicle model from: {model_path}")
                _yolo_vehicle_model = YOLO(model_path)
            else:
                logger.info("Loading YOLO11s vehicle model default...")
                _yolo_vehicle_model = YOLO("model_weights/yolo11s.pt")
        except Exception as e:
            logger.error(f"Failed to load YOLO vehicle model: {e}")
            _yolo_vehicle_model = None
    return _yolo_vehicle_model


def _box_contains(outer: Tuple[int, int, int, int], inner: Tuple[int, int, int, int]) -> bool:
    """Check if outer box roughly contains the inner box."""
    ox1, oy1, ox2, oy2 = outer
    ix1, iy1, ix2, iy2 = inner
    tolerance = 15
    return (
        ox1 - tolerance <= ix1
        and oy1 - tolerance <= iy1
        and ox2 + tolerance >= ix2
        and oy2 + tolerance >= iy2
    )


def _classify_bgr_hsv_color(b: float, g: float, r: float) -> str:
    """
    Robust vehicle paint color classifier combining RGB channel deltas and HSV.

    Calibrated for outdoor surveillance cameras (6500K daylight, diffuse sky light).
    Neutral vehicles (white/silver/black) show HSV saturation up to ~50 due to sky
    reflections; chromatic vehicles (red/blue/green) show saturation >= 40.
    """
    mean_val = (r + g + b) / 3.0
    channel_delta = max(r, g, b) - min(r, g, b)

    # Convert single BGR triplet to HSV
    bgr_pixel = np.uint8([[[int(b), int(g), int(r)]]])
    hsv_pixel = cv2.cvtColor(bgr_pixel, cv2.COLOR_BGR2HSV)[0][0]
    h, s, v = float(hsv_pixel[0]), float(hsv_pixel[1]), float(hsv_pixel[2])

    # ------------------------------------------------------------------
    # 1. Achromatic / Neutral Paint Detection
    # Threshold lowered to S < 40 / channel_delta < 22 for outdoor surveillance:
    # - White vehicles: S=5-30, V=180-255
    # - Silver/Gray: S=5-45, V=90-180
    # - Black: S=0-30, V=0-55
    # - Sky reflections on neutral metal add at most ~40 saturation
    # ------------------------------------------------------------------
    # ------------------------------------------------------------------
    # 1. Achromatic / Neutral Paint Detection
    # Threshold calibrated for outdoor surveillance:
    # - Black: V < 72 or mean_val < 72 (sunlit black paint shows diffuse glare 50-70)
    # - White: V > 155 or mean_val > 155
    # - Silver / Gray: 72 <= V <= 155
    # ------------------------------------------------------------------
    if s < 40 or channel_delta < 22:
        if v < 72 or mean_val < 72:
            return "Black"
        elif v > 155 or mean_val > 155:
            return "White"
        else:
            return "Silver / Gray"

    # ------------------------------------------------------------------
    # 2. Chromatic / Vivid Paint Detection (S >= 40 and channel_delta >= 22)
    # Red wraps around 0 and 180 in OpenCV Hue (0-179 scale)
    # ------------------------------------------------------------------
    if (0 <= h < 10) or (165 <= h <= 180):
        if v < 80:
            return "Maroon / Dark Red"
        return "Red"
    elif 10 <= h < 22:
        if v < 95 and s < 130:
            return "Brown"
        return "Orange"
    elif 22 <= h < 38:
        if v < 115 and s < 110:
            return "Gold / Bronze"
        return "Yellow"
    elif 38 <= h < 85:
        # Dark green (olive, forest) vs vivid green
        if v < 90:
            return "Dark Green"
        return "Green"
    elif 85 <= h < 135:
        # True chromatic blue — not sky reflection (filtered above by S >= 40)
        if v < 90:
            return "Dark Blue"
        return "Blue"
    elif 135 <= h < 165:
        return "Purple / Violet"

    # Fallback by luminance
    if v > 155 or mean_val > 155:
        return "White"
    elif v < 72 or mean_val < 72:
        return "Black"
    return "Silver / Gray"


def _extract_dominant_color(
    image_bgr: np.ndarray,
    plate_box: Tuple[int, int, int, int],
    vehicle_box: Optional[Tuple[int, int, int, int]] = None,
) -> Optional[str]:
    """
    Extract dominant body paint color from targeted vehicle body patches.

    Sampling strategy:
    - A: Above license plate  (bumper / trunk lid)
    - B: Left of license plate (body panel)
    - C: Right of license plate (body panel)
    - D: Below license plate (rear bumper / valance) — only if not touching road
    - E: Vehicle central hood/body (if vehicle bbox detected by YOLO)

    K-means (K=5) is used to separate paint color from road, sky, and
    shadow clusters. Only non-shadow, non-specular clusters are considered.
    The largest qualifying paint cluster by pixel count wins.
    """
    try:
        img_h, img_w = image_bgr.shape[:2]
        px1, py1, px2, py2 = plate_box
        plate_w = max(px2 - px1, 1)
        plate_h = max(py2 - py1, 1)

        patches: List[np.ndarray] = []

        # Patch A: Directly above license plate (bumper / trunk lid)
        top_y1 = max(0, py1 - int(plate_h * 2.0))
        top_y2 = max(0, py1 - 2)
        top_x1 = max(0, px1 - int(plate_w * 0.2))
        top_x2 = min(img_w, px2 + int(plate_w * 0.2))
        if top_y2 > top_y1 and top_x2 > top_x1:
            p_top = image_bgr[top_y1:top_y2, top_x1:top_x2]
            if p_top.size > 0:
                patches.append(p_top)

        # Patch B: Directly to the left of the license plate (body panel)
        left_x1 = max(0, px1 - int(plate_w * 0.8))
        left_x2 = max(0, px1 - 2)
        if left_x2 > left_x1 and py2 > py1:
            p_left = image_bgr[py1:py2, left_x1:left_x2]
            if p_left.size > 0:
                patches.append(p_left)

        # Patch C: Directly to the right of the license plate (body panel)
        right_x1 = min(img_w, px2 + 2)
        right_x2 = min(img_w, px2 + int(plate_w * 0.8))
        if right_x2 > right_x1 and py2 > py1:
            p_right = image_bgr[py1:py2, right_x1:right_x2]
            if p_right.size > 0:
                patches.append(p_right)

        # Patch D: Directly below the license plate (rear bumper)
        # Skip if vehicle bbox is known and bottom extends past lower 15% (likely asphalt)
        can_sample_below = True
        if vehicle_box:
            vx1, vy1, vx2, vy2 = vehicle_box
            if py2 >= vy2 - int((vy2 - vy1) * 0.18):
                can_sample_below = False

        if can_sample_below:
            bot_y1 = min(img_h, py2 + 2)
            bot_y2 = min(img_h, py2 + int(plate_h * 1.2))
            bot_x1 = max(0, px1 - int(plate_w * 0.1))
            bot_x2 = min(img_w, px2 + int(plate_w * 0.1))
            if bot_y2 > bot_y1 and bot_x2 > bot_x1:
                p_bot = image_bgr[bot_y1:bot_y2, bot_x1:bot_x2]
                if p_bot.size > 0:
                    patches.append(p_bot)

        # Patch E: Vehicle central body / hood (if vehicle bbox available)
        # Double-weighted because vehicle body is the most reliable paint source
        if vehicle_box:
            vx1, vy1, vx2, vy2 = vehicle_box
            vw = max(vx2 - vx1, 1)
            vh = max(vy2 - vy1, 1)
            # Central hood: 40%-72% height, 20%-80% width
            hood_y1 = max(0, vy1 + int(vh * 0.40))
            hood_y2 = min(img_h, vy1 + int(vh * 0.72))
            hood_x1 = max(0, vx1 + int(vw * 0.20))
            hood_x2 = min(img_w, vx1 + int(vw * 0.80))
            if hood_y2 > hood_y1 and hood_x2 > hood_x1:
                p_hood = image_bgr[hood_y1:hood_y2, hood_x1:hood_x2]
                if p_hood.size > 0:
                    patches.append(p_hood)
                    patches.append(p_hood)  # Weight hood higher than bumper edges

        if not patches:
            return None

        # Aggregate samples from all body patches (resize each to 32x32)
        sampled_pixels = []
        for patch in patches:
            small = cv2.resize(patch, (32, 32), interpolation=cv2.INTER_AREA)
            sampled_pixels.append(small.reshape(-1, 3))

        all_bgr = np.vstack(sampled_pixels).astype(np.float32)

        # Convert to HSV for filtering
        hsv_all = cv2.cvtColor(
            all_bgr.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_BGR2HSV
        ).reshape(-1, 3).astype(np.float32)

        # Valid paint mask:
        #   - Not deep shadow (V >= 20)
        #   - Not blown-out specular white (V > 252 AND S < 10)
        valid_mask = (hsv_all[:, 2] >= 20) & ~(
            (hsv_all[:, 2] > 252) & (hsv_all[:, 1] < 10)
        )
        valid_bgr = all_bgr[valid_mask]
        valid_hsv = hsv_all[valid_mask]

        if len(valid_bgr) < 20:
            # If filtering removed too many pixels, relax mask
            valid_bgr = all_bgr
            valid_hsv = hsv_all

        # K-Means clustering (K=5) for better paint color isolation
        # More clusters → better separation of sky/road/paint/shadow/glare
        k = min(5, max(1, len(valid_bgr) // 10))
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 15, 1.0)
        _, labels, centers = cv2.kmeans(
            valid_bgr,
            K=k,
            bestLabels=None,
            criteria=criteria,
            attempts=5,
            flags=cv2.KMEANS_PP_CENTERS,
        )

        unique_labels, counts = np.unique(labels, return_counts=True)
        # Sort by count descending (most-represented cluster first)
        sorted_indices = np.argsort(-counts)

        # Iterate clusters from largest to smallest, skip shadow and glare
        chosen_bgr = None
        for ci in sorted_indices:
            candidate = centers[ci]
            c_b, c_g, c_r = candidate[0], candidate[1], candidate[2]
            c_mean = (c_b + c_g + c_r) / 3.0

            # Skip deep shadow clusters (likely road / wheel well)
            if c_mean < 25:
                continue

            # Convert candidate to HSV to detect sky/glare
            c_hsv = cv2.cvtColor(
                np.uint8([[[int(c_b), int(c_g), int(c_r)]]]), cv2.COLOR_BGR2HSV
            )[0][0]
            c_s, c_v = float(c_hsv[1]), float(c_hsv[2])

            # Skip near-white specular glare clusters (V > 245, S < 8)
            if c_v > 245 and c_s < 8:
                continue

            chosen_bgr = candidate
            break

        # Fallback to largest cluster if all were filtered out
        if chosen_bgr is None:
            chosen_bgr = centers[sorted_indices[0]]

        dom_b, dom_g, dom_r = chosen_bgr[0], chosen_bgr[1], chosen_bgr[2]
        return _classify_bgr_hsv_color(dom_b, dom_g, dom_r)

    except Exception as e:
        logger.warning(f"Failed to extract vehicle color: {e}")
        return None


def detect_vehicle_attributes(
    image_bgr: np.ndarray,
    plate_bbox: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Detect vehicle containing the given license plate bounding box.
    Returns:
        {
            "car_color": str | None,
            "car_model": None,  # Pluggable; null when no classifier is loaded
            "vehicle_type": str | None,
            "vehicle_bbox": {"x1": int, "y1": int, "x2": int, "y2": int} | None
        }
    """
    result = {
        "car_color": None,
        "car_model": None,
        "vehicle_type": "car",
        "vehicle_bbox": None,
    }

    if image_bgr is None or not plate_bbox:
        return result

    try:
        model = _get_vehicle_model()
        if model is None:
            return result

        # Parse plate box (supports both {x1, y1, x2, y2} and {x, y, width, height})
        px1 = int(plate_bbox.get("x1", plate_bbox.get("x", 0)))
        py1 = int(plate_bbox.get("y1", plate_bbox.get("y", 0)))
        if "x2" in plate_bbox and "y2" in plate_bbox:
            px2 = int(plate_bbox.get("x2", 0))
            py2 = int(plate_bbox.get("y2", 0))
        else:
            px2 = px1 + int(plate_bbox.get("width", 0))
            py2 = py1 + int(plate_bbox.get("height", 0))
        plate_box = (px1, py1, px2, py2)
        img_h, img_w = image_bgr.shape[:2]
        imgsz = 1280 if max(img_w, img_h) >= 1200 else 640

        # Run inference on the full frame
        preds = model(image_bgr, verbose=False, conf=0.15, imgsz=imgsz, classes=[2, 3, 5, 7])
        if not preds or len(preds) == 0:
            # Still attempt color extraction from plate surroundings
            result["car_color"] = _extract_dominant_color(image_bgr, plate_box, None)
            return result

        boxes = preds[0].boxes
        if boxes is None or len(boxes) == 0:
            result["car_color"] = _extract_dominant_color(image_bgr, plate_box, None)
            return result

        candidate_vehicles = []

        for b in boxes:
            cls_id = int(b.cls[0].item())
            if cls_id in VEHICLE_CLASSES:
                xyxy = b.xyxy[0].cpu().numpy().astype(int)
                vx1 = max(0, min(img_w, int(xyxy[0])))
                vy1 = max(0, min(img_h, int(xyxy[1])))
                vx2 = max(0, min(img_w, int(xyxy[2])))
                vy2 = max(0, min(img_h, int(xyxy[3])))
                conf = float(b.conf[0].item())
                candidate_vehicles.append((vx1, vy1, vx2, vy2, VEHICLE_CLASSES[cls_id], conf))

        if not candidate_vehicles:
            result["car_color"] = _extract_dominant_color(image_bgr, plate_box, None)
            return result

        # Step 1: Find candidate that contains plate box
        matched_vehicle = None
        for v in candidate_vehicles:
            v_box = (v[0], v[1], v[2], v[3])
            if _box_contains(v_box, plate_box):
                matched_vehicle = v
                break

        # Step 2: Fallback to plate center inside vehicle
        if matched_vehicle is None:
            p_center_x = (px1 + px2) // 2
            p_center_y = (py1 + py2) // 2
            for v in candidate_vehicles:
                if v[0] <= p_center_x <= v[2] and v[1] <= p_center_y <= v[3]:
                    matched_vehicle = v
                    break

        # Step 3: Fallback to closest vehicle box by distance
        if matched_vehicle is None:
            def dist_to_plate(v):
                vc_x = (v[0] + v[2]) / 2.0
                vc_y = (v[1] + v[3]) / 2.0
                pc_x = (px1 + px2) / 2.0
                pc_y = (py1 + py2) / 2.0
                return ((vc_x - pc_x) ** 2 + (vc_y - pc_y) ** 2) ** 0.5

            candidate_vehicles.sort(key=dist_to_plate)
            matched_vehicle = candidate_vehicles[0]

        vehicle_box_tuple = None
        if matched_vehicle:
            vx1, vy1, vx2, vy2, v_type, v_conf = matched_vehicle
            result["vehicle_bbox"] = {"x1": vx1, "y1": vy1, "x2": vx2, "y2": vy2}
            result["vehicle_type"] = v_type
            vehicle_box_tuple = (vx1, vy1, vx2, vy2)

        # Extract dominant vehicle paint color using body patches
        result["car_color"] = _extract_dominant_color(image_bgr, plate_box, vehicle_box_tuple)
        result["car_model"] = None

    except Exception as e:
        logger.error(f"Error during vehicle attribute detection: {e}", exc_info=True)

    return result
