"""Image utility helpers shared across pipeline stages."""

import base64
import io
import uuid
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np
try:
    from PIL import Image
except ImportError:
    Image = None


# ---------------------------------------------------------------------------
# Conversion helpers
# ---------------------------------------------------------------------------

def numpy_to_base64(image: np.ndarray, format: str = "JPEG") -> str:
    """Convert a NumPy BGR or grayscale image to a base64-encoded data URI."""
    if image is None or image.size == 0:
        return ""

    if Image is not None:
        # Convert BGR -> RGB for PIL
        if len(image.shape) == 3 and image.shape[2] == 3:
            pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        elif len(image.shape) == 3 and image.shape[2] == 4:
            pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA))
        else:
            pil_image = Image.fromarray(image)

        buffer = io.BytesIO()
        pil_image.save(buffer, format=format, quality=95)
        encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    else:
        ext = ".jpg" if format.upper() == "JPEG" else ".png"
        success, encoded_img = cv2.imencode(ext, image)
        if not success:
            return ""
        encoded = base64.b64encode(encoded_img).decode("utf-8")

    mime = "image/jpeg" if format.upper() == "JPEG" else "image/png"
    return f"data:{mime};base64,{encoded}"


def file_to_base64(file_path: str) -> str:
    """Read an image file from disk and return a base64 data URI."""
    path = Path(file_path)
    if not path.exists():
        return ""
    with open(path, "rb") as f:
        data = f.read()
    encoded = base64.b64encode(data).decode("utf-8")
    suffix = path.suffix.lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
    mime = mime_map.get(suffix, "image/jpeg")
    return f"data:{mime};base64,{encoded}"


def pil_to_numpy_bgr(pil_image: Image.Image) -> np.ndarray:
    """Convert PIL RGB image to NumPy BGR array."""
    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)


def numpy_bgr_to_pil(image: np.ndarray) -> Image.Image:
    """Convert NumPy BGR array to PIL RGB image."""
    return Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))


# ---------------------------------------------------------------------------
# Image analysis helpers
# ---------------------------------------------------------------------------

def compute_mean_brightness(image: np.ndarray) -> float:
    """Compute mean luminance of a BGR image (0–255)."""
    if image is None or image.size == 0:
        return 0.0
    if len(image.shape) == 2:
        return float(np.asarray(image).mean())
    if len(image.shape) == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    elif len(image.shape) == 3 and image.shape[2] == 4:
        gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    elif len(image.shape) == 3:
        gray = image[:, :, 0]
    else:
        gray = image
    return float(np.asarray(gray).mean())


def compute_noise_level(image: np.ndarray) -> float:
    """Estimate image noise using Laplacian variance (higher = more blur/noise)."""
    if image is None or image.size == 0:
        return 0.0
    if len(image.shape) == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    elif len(image.shape) == 3 and image.shape[2] == 4:
        gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    elif len(image.shape) == 3:
        gray = image[:, :, 0]
    else:
        gray = image
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def compute_contrast(image: np.ndarray) -> float:
    """Return standard deviation of grayscale pixels as a contrast proxy."""
    if image is None or image.size == 0:
        return 0.0
    if len(image.shape) == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    elif len(image.shape) == 3 and image.shape[2] == 4:
        gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    elif len(image.shape) == 3:
        gray = image[:, :, 0]
    else:
        gray = image
    return float(np.std(gray.astype(np.float32)))


# ---------------------------------------------------------------------------
# Crop / resize helpers
# ---------------------------------------------------------------------------

def safe_crop(image: np.ndarray, x: int, y: int, w: int, h: int,
              pad: int = 5) -> np.ndarray:
    """
    Crop a region from an image with optional padding, clamped to image bounds.
    """
    if image is None or image.size == 0:
        return np.zeros((0, 0, 3), dtype=np.uint8)

    img_h, img_w = image.shape[:2]
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(img_w, x + w + pad)
    y2 = min(img_h, y + h + pad)

    if x2 <= x1 or y2 <= y1:
        channels = image.shape[2] if len(image.shape) == 3 else 1
        return np.zeros((0, 0, channels), dtype=image.dtype)

    return image[y1:y2, x1:x2].copy()


def resize_for_processing(image: np.ndarray,
                           max_dim: int = 1280) -> Tuple[np.ndarray, float]:
    """
    Resize image so the longest dimension ≤ max_dim.
    Returns (resized_image, scale_factor).
    """
    if image is None or image.size == 0:
        return image, 1.0

    h, w = image.shape[:2]
    scale = min(max_dim / max(h, w), 1.0)
    if scale < 1.0:
        new_w = int(w * scale)
        new_h = int(h * scale)
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        return resized, scale
    return image, 1.0


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

def draw_bounding_boxes(
    image: np.ndarray,
    plates: list,
    vehicles: list = None,
    scale_factor: float = 1.0,
) -> np.ndarray:
    """
    Industry-grade surveillance visual annotation engine.
    Separately annotates:
      1. Subtle vehicle bounding boxes (Vehicle ID, Type, Color)
      2. Precise plate bounding boxes (Plate Text, Percentage Confidence, State)
      3. Unreadable plate badges ('OCR UNREADABLE') without fabricated text
      4. Dynamic collision-avoidance label placement & resolution-adaptive font scaling.
    """
    if image is None or image.size == 0:
        return image

    annotated = image.copy()
    img_h, img_w = annotated.shape[:2]

    # Resolution-adaptive scaling
    diag = np.sqrt(img_w ** 2 + img_h ** 2)
    font_scale = max(0.40, min(0.95, diag / 1800.0))
    line_thickness = max(1, int(round(diag / 900.0)))
    plate_thickness = max(2, line_thickness + 1)

    used_label_boxes: List[Tuple[int, int, int, int]] = []

    def boxes_overlap(b1, b2):
        return not (b1[2] <= b2[0] or b1[0] >= b2[2] or b1[3] <= b2[1] or b1[1] >= b2[3])

    # -------------------------------------------------------------------------
    # 1. Annotate Vehicles (Subtle Cyan/Blue Box with Clean Header Badge)
    # -------------------------------------------------------------------------
    vehicle_color_bgr = (245, 175, 45)  # Cyan-blue in BGR (subtle surveillance tone)

    for idx, v in enumerate(vehicles or [], start=1):
        vbox = v.get("vehicle_bbox") or v.get("bbox") or {}
        if isinstance(vbox, (list, tuple)) and len(vbox) >= 4:
            vx = int(vbox[0])
            vy = int(vbox[1])
            vw = int(vbox[2] - vbox[0])
            vh = int(vbox[3] - vbox[1])
        else:
            vx = int(vbox.get("x", 0))
            vy = int(vbox.get("y", 0))
            vw = int(vbox.get("width", 0))
            vh = int(vbox.get("height", 0))

        vx = max(0, min(vx, img_w - 1))
        vy = max(0, min(vy, img_h - 1))
        vw = max(1, min(vw, img_w - vx))
        vh = max(1, min(vh, img_h - vy))

        if vw < 25 or vh < 25:
            continue

        # Draw vehicle boundary
        cv2.rectangle(annotated, (vx, vy), (vx + vw, vy + vh), vehicle_color_bgr, line_thickness)

        v_type = str(v.get("vehicle_type") or v.get("class") or "Vehicle").capitalize()
        v_color = str(v.get("car_color") or "").strip()
        color_str = v_color if (v_color and v_color.lower() != "unknown") else "Color: Unknown"
        has_plate = v.get("has_plate", True)
        vid = v.get("vehicle_id") or f"#{idx}"
        if not str(vid).startswith("#") and not str(vid).startswith("veh"):
            vid = f"#{vid}"

        if not has_plate:
            v_lbl = f"Vehicle {vid} • {v_type} | {color_str} | No Plate Detected"
        else:
            v_lbl = f"Vehicle {vid} • {v_type} | {color_str}"

        (tw, th), baseline = cv2.getTextSize(v_lbl, cv2.FONT_HERSHEY_SIMPLEX, font_scale * 0.85, 1)

        # Vehicle label badge position: slightly above or inside top border
        lbl_y = max(th + 4, vy - 2) if vy >= th + 8 else min(img_h - 4, vy + th + 6)
        lbl_x = max(0, min(vx, img_w - tw - 8))

        # Semi-transparent background for readability
        overlay = annotated.copy()
        cv2.rectangle(overlay, (lbl_x, lbl_y - th - 4), (lbl_x + tw + 8, lbl_y + baseline + 2), (25, 30, 45), -1)
        cv2.addWeighted(overlay, 0.80, annotated, 0.20, 0, annotated)
        cv2.rectangle(annotated, (lbl_x, lbl_y - th - 4), (lbl_x + tw + 8, lbl_y + baseline + 2), vehicle_color_bgr, 1)
        cv2.putText(annotated, v_lbl, (lbl_x + 4, lbl_y - 1), cv2.FONT_HERSHEY_SIMPLEX, font_scale * 0.85, (255, 255, 255), 1, cv2.LINE_AA)
        used_label_boxes.append((lbl_x, lbl_y - th - 4, lbl_x + tw + 8, lbl_y + baseline + 2))

    # -------------------------------------------------------------------------
    # 2. Annotate Number Plates (Tightly Aligned Rectangles + Percentage Label)
    # -------------------------------------------------------------------------
    for plate in plates:
        bbox = plate.get("bbox", {})
        if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
            x, y = int(bbox[0]), int(bbox[1])
            w, h = int(bbox[2] - bbox[0]), int(bbox[3] - bbox[1])
        else:
            x = int(bbox.get("x", 0))
            y = int(bbox.get("y", 0))
            w = int(bbox.get("width", 0))
            h = int(bbox.get("height", 0))

        # Clamp strictly inside frame
        x_box = max(0, min(x, img_w - 1))
        y_box = max(0, min(y, img_h - 1))
        w_box = max(1, min(w, img_w - x_box))
        h_box = max(1, min(h, img_h - y_box))

        pid = plate.get("plate_id", "")
        conf_raw = plate.get("overall_confidence")
        if conf_raw is None or conf_raw == 0:
            conf_raw = plate.get("detection_confidence", 0.0)
        conf_pct = int(round(float(conf_raw) * 100))

        text = str(plate.get("corrected_plate") or plate.get("normalized_plate", "") or plate.get("raw_ocr", "")).strip()
        state = str(plate.get("result_state") or plate.get("validation_status") or "").upper()

        is_unreadable = (
            text == "UNREADABLE" or
            state == "PLATE_DETECTED_OCR_UNREADABLE" or
            plate.get("validation_status") == "UNREADABLE"
        )

        # Assign high-contrast distinct color
        if is_unreadable:
            color = (40, 80, 230)      # High-visibility orange-red
            text_str = "PLATE DETECTED • OCR UNREADABLE"
        elif "VERIFIED" in state or plate.get("validation_status") == "VALID_FORMAT":
            color = (35, 215, 80)      # Vibrant Surveillance Emerald Green
            text_str = text if text else "VALIDATED PLATE"
        elif "HIGH" in state:
            color = (20, 200, 240)     # Vibrant Cyan
            text_str = text if text else "DETECTED PLATE"
        else:
            color = (0, 165, 255)      # Amber / Review
            text_str = text if text else "REVIEW PLATE"

        # Draw accurate plate bounding box
        cv2.rectangle(annotated, (x_box, y_box), (x_box + w_box, y_box + h_box), color, plate_thickness)

        # Small corner accents for modern aesthetic
        corner_len = max(4, min(14, int(w_box * 0.20)))
        # Top-left
        cv2.line(annotated, (x_box, y_box), (x_box + corner_len, y_box), (255, 255, 255), plate_thickness + 1)
        cv2.line(annotated, (x_box, y_box), (x_box, y_box + corner_len), (255, 255, 255), plate_thickness + 1)
        # Bottom-right
        cv2.line(annotated, (x_box + w_box, y_box + h_box), (x_box + w_box - corner_len, y_box + h_box), (255, 255, 255), plate_thickness + 1)
        cv2.line(annotated, (x_box + w_box, y_box + h_box), (x_box + w_box, y_box + h_box - corner_len), (255, 255, 255), plate_thickness + 1)

        # Label content
        if is_unreadable:
            label = f"{text_str}  {conf_pct}%"
        else:
            pid_prefix = f"#{pid} " if pid else ""
            label = f"{pid_prefix}{text_str}  {conf_pct}%"

        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)

        # Label Collision Handling & Auto-repositioning:
        # Default: directly above plate box
        cand_y = y_box - 6
        cand_x = max(0, min(x_box, img_w - tw - 8))

        # If too close to top border, place below or inside
        if cand_y - th - 4 < 0:
            cand_y = min(img_h - baseline - 4, y_box + h_box + th + 8)

        cand_box = (cand_x, cand_y - th - 4, cand_x + tw + 8, cand_y + baseline + 2)

        # Check collision with already placed labels
        if any(boxes_overlap(cand_box, ub) for ub in used_label_boxes):
            # Attempt placing directly below plate box
            alt_y = min(img_h - baseline - 4, y_box + h_box + th + 8)
            alt_box = (cand_x, alt_y - th - 4, cand_x + tw + 8, alt_y + baseline + 2)
            if not any(boxes_overlap(alt_box, ub) for ub in used_label_boxes):
                cand_y = alt_y
                cand_box = alt_box

        used_label_boxes.append(cand_box)

        # Draw high-contrast solid background pill
        cv2.rectangle(annotated, (cand_box[0], cand_box[1]), (cand_box[2], cand_box[3]), color, -1)
        cv2.rectangle(annotated, (cand_box[0], cand_box[1]), (cand_box[2], cand_box[3]), (0, 0, 0), 1)

        # Draw high contrast dark text
        cv2.putText(
            annotated,
            label,
            (cand_box[0] + 4, cand_y - 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (0, 0, 0),
            max(1, int(round(font_scale * 1.5))),
            cv2.LINE_AA,
        )

    return annotated


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------

def generate_session_id() -> str:
    return uuid.uuid4().hex


def validate_image_bytes(data: bytes) -> bool:
    """Return True if bytes decode to a valid image."""
    try:
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None:
            return True
        pil_img = Image.open(io.BytesIO(data))
        return pil_img is not None
    except Exception:
        return False
