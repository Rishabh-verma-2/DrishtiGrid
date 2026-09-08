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

def draw_bounding_boxes(image: np.ndarray, plates: list, vehicles: list = None) -> np.ndarray:
    """
    Draw bounding boxes and labels on a copy of the image.

    plates: list of dicts with keys: plate_id, bbox (x,y,width,height),
            detection_confidence, normalized_plate (optional)
    vehicles: optional list of detected vehicles to highlight on the scene
    """
    if image is None or image.size == 0:
        return image

    annotated = image.copy()
    img_h, img_w = annotated.shape[:2]

    # Draw vehicle boxes first (cyan/gold)
    for v in (vehicles or []):
        vbox = v.get("vehicle_bbox") or v.get("bbox") or {}
        vx = max(0, min(int(vbox.get("x", 0)), img_w - 1))
        vy = max(0, min(int(vbox.get("y", 0)), img_h - 1))
        vw = max(1, min(int(vbox.get("width", 0)), img_w - vx))
        vh = max(1, min(int(vbox.get("height", 0)), img_h - vy))
        if vw > 20 and vh > 20:
            cv2.rectangle(annotated, (vx, vy), (vx + vw, vy + vh), (255, 180, 0), 2)
            v_type = str(v.get("vehicle_type", "Vehicle")).capitalize()
            v_color = str(v.get("car_color") or "").strip()
            v_lbl = f"{v_color} {v_type}".strip() if v_color else v_type
            if v_lbl:
                (tw, th), _ = cv2.getTextSize(v_lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
                label_y = max(th + 4, vy)
                cv2.rectangle(annotated, (vx, max(0, label_y - th - 5)), (vx + tw + 6, label_y + 2), (255, 180, 0), -1)
                cv2.putText(annotated, v_lbl, (vx + 3, label_y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (20, 20, 20), 1, cv2.LINE_AA)

    # Draw plate boxes (bright green for valid, orange for possible/detected)
    for plate in plates:
        bbox = plate.get("bbox", {})
        x = int(bbox.get("x", 0))
        y = int(bbox.get("y", 0))
        w = int(bbox.get("width", 0))
        h = int(bbox.get("height", 0))
        pid = plate.get("plate_id", "?")
        conf = float(plate.get("detection_confidence", 0.0))
        text = str(plate.get("normalized_plate", "") or "").strip()

        # Clamp box to image
        x_box = max(0, min(x, img_w - 1))
        y_box = max(0, min(y, img_h - 1))
        w_box = max(1, min(w, img_w - x_box))
        h_box = max(1, min(h, img_h - y_box))

        val_status = plate.get("validation_status", "UNCERTAIN")
        color = (0, 230, 80) if val_status == "VALID_FORMAT" else (0, 165, 255)
        thickness = 3
        cv2.rectangle(annotated, (x_box, y_box), (x_box + w_box, y_box + h_box), color, thickness)

        # Label background
        label_parts = [f"#{pid}"]
        if text:
            label_parts.append(text)
        label_parts.append(f"{conf * 100:.0f}%")
        label = "  ".join(label_parts)

        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.55
        (tw, th), baseline = cv2.getTextSize(label, font, font_scale, 1)
        label_y = max(y_box - 6, th + 4)
        x_label = max(0, min(x_box, img_w - tw - 6))

        cv2.rectangle(annotated,
                      (x_label, label_y - th - 4),
                      (x_label + tw + 6, label_y + baseline),
                      color, cv2.FILLED)
        cv2.putText(annotated, label, (x_label + 3, label_y - 2),
                    font, font_scale, (0, 0, 0), 1, cv2.LINE_AA)

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
