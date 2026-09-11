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
    Calibrated for outdoor surveillance cameras (daylight, sky diffuse reflection).
    Supported classes:
      White, Black, Silver / Gray, Red, Maroon, Blue, Green, Yellow, Brown, Orange, Other, Unknown.
    """
    mean_val = (r + g + b) / 3.0
    channel_delta = max(r, g, b) - min(r, g, b)

    bgr_pixel = np.uint8([[[int(b), int(g), int(r)]]])
    hsv_pixel = cv2.cvtColor(bgr_pixel, cv2.COLOR_BGR2HSV)[0][0]
    h, s, v = float(hsv_pixel[0]), float(hsv_pixel[1]), float(hsv_pixel[2])

    # 1. Achromatic / Neutral Paint Detection
    # Sky reflections on neutral metal add at most ~40 saturation with low channel delta
    if s < 38 or channel_delta < 20:
        if v < 68 or mean_val < 68:
            return "Black"
        elif v > 160 or mean_val > 160:
            return "White"
        else:
            return "Silver / Gray"

    # 2. Chromatic / Vivid Paint Detection
    # Red & Maroon: wrap around 0 and 180
    if (0 <= h <= 12) or (162 <= h <= 180):
        if v < 110 or mean_val < 95:
            return "Maroon"
        return "Red"
    elif 12 < h <= 25:
        if v < 95 and s < 130:
            return "Brown"
        return "Orange"
    elif 25 < h <= 38:
        if v < 115 and s < 110:
            return "Brown"
        return "Yellow"
    elif 38 < h <= 85:
        return "Green"
    elif 85 < h <= 135:
        # Require stronger saturation/channel delta for blue to differentiate from sky reflections
        if s >= 45 and (b > r + 15):
            return "Blue"
        if v > 155:
            return "White"
        elif v < 70:
            return "Black"
        return "Silver / Gray"
    elif 135 < h < 162:
        return "Other"

    # Fallback by luminance
    if v > 160:
        return "White"
    elif v < 68:
        return "Black"
    return "Silver / Gray"


def _extract_dominant_color(
    image_bgr: np.ndarray,
    plate_box: Optional[Tuple[int, int, int, int]] = None,
    vehicle_box: Optional[Tuple[int, int, int, int]] = None,
) -> str:
    """
    Extract vehicle color estimated STRICTLY from the vehicle body region,
    while excluding license plate, windshield, windows, tires, road, sky, and specular glare.
    Prefers body panels: hood, doors, fenders, side body, front/rear bumper panels.
    """
    if image_bgr is None or image_bgr.size == 0:
        return "Unknown"

    try:
        img_h, img_w = image_bgr.shape[:2]

        # Handle argument inversion if called with (img, vehicle_box, plate_box)
        if vehicle_box is None and plate_box is not None:
            # Check if plate_box is actually vehicle-sized
            pw = plate_box[2] - plate_box[0]
            ph = plate_box[3] - plate_box[1]
            if pw > img_w * 0.25 and ph > img_h * 0.20:
                vehicle_box = plate_box
                plate_box = None

        if vehicle_box is None:
            return "Unknown"

        vx1, vy1, vx2, vy2 = vehicle_box
        vx1 = max(0, min(img_w - 1, int(vx1)))
        vy1 = max(0, min(img_h - 1, int(vy1)))
        vx2 = max(vx1 + 1, min(img_w, int(vx2)))
        vy2 = max(vy1 + 1, min(img_h, int(vy2)))

        vw = vx2 - vx1
        vh = vy2 - vy1
        if vw < 25 or vh < 25:
            return "Unknown"

        veh_crop = image_bgr[vy1:vy2, vx1:vx2]
        hsv_crop = cv2.cvtColor(veh_crop, cv2.COLOR_BGR2HSV)

        # 1. Build vehicle body mask:
        body_mask = np.zeros((vh, vw), dtype=np.uint8)

        # Hood & central front/rear body (vertical 35% to 65%, horizontal 20% to 80%)
        body_mask[int(vh * 0.35):int(vh * 0.65), int(vw * 0.20):int(vw * 0.80)] = 255

        # Side panels, doors & fenders (vertical 25% to 85%, horizontal flanks 0-25% and 75-100%)
        body_mask[int(vh * 0.25):int(vh * 0.85), 0:int(vw * 0.25)] = 255
        body_mask[int(vh * 0.25):int(vh * 0.85), int(vw * 0.75):vw] = 255

        # Lower bumper painted regions (vertical 65% to 85%, horizontal 15% to 85%)
        body_mask[int(vh * 0.65):int(vh * 0.85), int(vw * 0.15):int(vw * 0.85)] = 255

        # 2. Exclude license plate and black frame / grille surrounding
        if plate_box is not None:
            px1, py1, px2, py2 = plate_box
            lx1 = max(0, px1 - vx1 - 15)
            ly1 = max(0, py1 - vy1 - 20)
            lx2 = min(vw, px2 - vx1 + 15)
            ly2 = min(vh, py2 - vy1 + 15)
            body_mask[ly1:ly2, lx1:lx2] = 0

        # 3. Exclude deep chassis/tire shadows and blown-out specular highlights
        v_chan = hsv_crop[:, :, 2]
        s_chan = hsv_crop[:, :, 1]
        body_mask[(v_chan < 22) | ((v_chan > 242) & (s_chan < 16))] = 0

        valid_bgr = veh_crop[body_mask > 0]
        valid_hsv = hsv_crop[body_mask > 0]

        if len(valid_bgr) < 25:
            # Relax mask if too aggressive
            body_mask = np.zeros((vh, vw), dtype=np.uint8)
            body_mask[int(vh * 0.30):int(vh * 0.75), int(vw * 0.15):int(vw * 0.85)] = 255
            body_mask[(v_chan < 20) | (v_chan > 248)] = 0
            valid_bgr = veh_crop[body_mask > 0]
            valid_hsv = hsv_crop[body_mask > 0]
            if len(valid_bgr) < 20:
                return "Unknown"

        b = valid_bgr[:, 0].astype(float)
        g = valid_bgr[:, 1].astype(float)
        r = valid_bgr[:, 2].astype(float)
        h = valid_hsv[:, 0].astype(float)
        s = valid_hsv[:, 1].astype(float)
        v = valid_hsv[:, 2].astype(float)

        # 4. Check chromatic paint signals:
        # Red / Maroon: R > B and R > G with delta >= 8, or Hue in red range with S >= 25
        red_maroon_mask = ((r > b + 8) & (r > g + 8)) | (((h <= 14) | (h >= 160)) & (s >= 25) & (r > b))
        red_maroon_count = int(np.sum(red_maroon_mask))

        # True Blue: require high saturation and B significantly above R to filter out daylight sky reflections
        blue_mask = (b > r + 30) & (b > g + 15) & (h >= 85) & (h <= 135) & (s >= 65)
        blue_count = int(np.sum(blue_mask))

        # Green
        green_mask = (g > r + 15) & (g > b + 15) & (h >= 38) & (h <= 85) & (s >= 35)
        green_count = int(np.sum(green_mask))

        # Yellow
        yellow_mask = (r > b + 25) & (g > b + 20) & (h >= 22) & (h <= 38) & (s >= 40)
        yellow_count = int(np.sum(yellow_mask))

        # Orange / Brown
        orange_mask = (r > b + 20) & (r > g + 10) & (h >= 12) & (h <= 24) & (s >= 35)
        orange_count = int(np.sum(orange_mask))

        total_valid = len(valid_bgr)
        chromatic_thresh = max(35, int(total_valid * 0.025))

        if red_maroon_count >= chromatic_thresh and red_maroon_count >= blue_count:
            rm_v = v[red_maroon_mask]
            mean_v = float(np.mean(rm_v))
            return "Maroon" if mean_v < 115 else "Red"
        elif blue_count >= chromatic_thresh and blue_count >= red_maroon_count:
            return "Blue"
        elif green_count >= chromatic_thresh:
            return "Green"
        elif yellow_count >= chromatic_thresh:
            return "Yellow"
        elif orange_count >= chromatic_thresh:
            rm_v = v[orange_mask]
            return "Brown" if float(np.mean(rm_v)) < 95 else "Orange"

        # 5. Achromatic classification:
        median_v = float(np.median(v))
        if median_v > 165:
            return "White"
        elif median_v < 68:
            return "Black"
        else:
            return "Silver / Gray"

    except Exception as e:
        logger.warning(f"Failed to extract vehicle body color: {e}")
        return "Unknown"


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
