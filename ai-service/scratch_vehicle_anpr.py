import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import sys
from pathlib import Path
ai_service_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(ai_service_dir))

import cv2
import numpy as np
import re
import time
from ultralytics import YOLO
from app.ocr.paddle_ocr import get_ocr_engine
from app.validation.indian_plate import normalize_plate_text, validate_indian_plate
from app.detection.vehicle_attributes import _extract_dominant_color
from app.preprocessing.opencv_preprocess import preprocess_plate_crop
from app.enhancement.clahe import apply_clahe
from app.enhancement.zero_dce import enhance_with_zero_dce

# ---------------------------------------------------------------------------
# Config & Paths
# ---------------------------------------------------------------------------
img_path = r"C:\Users\pulab\Downloads\Gemini_Generated_Image_ox0kaeox0kaeox0k (1).png"
output_annotated_path = str(ai_service_dir / "anpr_result_annotated.jpg")
output_gallery_path = str(ai_service_dir / "anpr_plates_cleaned_gallery.jpg")

if not os.path.exists(img_path):
    print(f"Error: Image not found at {img_path}")
    sys.exit(1)

img = cv2.imread(img_path)
if img is None:
    print(f"Error: Failed to load image {img_path}")
    sys.exit(1)

img_h, img_w = img.shape[:2]
print(f"============================================================")
print(f"  DRISHTIGRID ANPR — VEHICLE-FIRST DETECTION & RECOGNITION  ")
print(f"============================================================")
print(f"Input Image: {img_w}x{img_h} px")

# Load Models
weights_path = ai_service_dir / "model_weights" / "yolov8n.pt"
if not weights_path.exists():
    weights_path = ai_service_dir / "yolov8n.pt"

print(f"Loading YOLOv8 model from {weights_path}...")
model = YOLO(str(weights_path))
print("Initializing PaddleOCR engine...")
ocr = get_ocr_engine()

# ---------------------------------------------------------------------------
# STEP 1: DETECT ALL VEHICLES (High-Resolution + Tiled Coverage)
# ---------------------------------------------------------------------------
# Why previous logic missed vehicles:
# 1. Standard YOLO defaults to 640x640: on a 2816x1536 image, cars become tiny (~20px) and vanish.
# 2. Hardcoded size cutoff (bw < 50) dropped all distant vehicles.
# 3. Single-pass NMS suppressed overlapping vehicles in perspective queues.
print("\n[Step 1] Running high-resolution vehicle detection...")
t0 = time.perf_counter()

raw_vehicle_candidates = []
VEHICLE_CLASSES = [2, 3, 5, 7]  # car, motorcycle, bus, truck

# Pass 1A: Full frame at high resolution (imgsz=1280)
res_full = model(img, conf=0.14, imgsz=1280, classes=VEHICLE_CLASSES, verbose=False)[0]
for b in res_full.boxes:
    cls_id = int(b.cls[0].item())
    conf = float(b.conf[0].item())
    xyxy = [int(x) for x in b.xyxy[0].tolist()]
    raw_vehicle_candidates.append({
        "box": [max(0, xyxy[0]), max(0, xyxy[1]), min(img_w, xyxy[2]), min(img_h, xyxy[3])],
        "conf": conf,
        "class_id": cls_id,
        "type": res_full.names[cls_id]
    })

# Pass 1B: Overlapping horizontal tiles for wide CCTV frames (> 1200px)
if img_w > 1200:
    tile_w = int(img_w * 0.55)
    stride = int(img_w * 0.40)
    for x_start in range(0, img_w - tile_w + 1, stride):
        x_end = min(img_w, x_start + tile_w)
        tile = img[:, x_start:x_end]
        res_tile = model(tile, conf=0.14, imgsz=960, classes=VEHICLE_CLASSES, verbose=False)[0]
        for b in res_tile.boxes:
            cls_id = int(b.cls[0].item())
            conf = float(b.conf[0].item())
            xyxy = b.xyxy[0].tolist()
            gx1 = max(0, int(xyxy[0] + x_start))
            gy1 = max(0, int(xyxy[1]))
            gx2 = min(img_w, int(xyxy[2] + x_start))
            gy2 = min(img_h, int(xyxy[3]))
            raw_vehicle_candidates.append({
                "box": [gx1, gy1, gx2, gy2],
                "conf": conf,
                "class_id": cls_id,
                "type": res_tile.names[cls_id]
            })

print(f"Raw vehicle candidates gathered: {len(raw_vehicle_candidates)}")

# Merge duplicates with IoU-based NMS
def compute_iou(bA, bB):
    xA = max(bA[0], bB[0])
    yA = max(bA[1], bB[1])
    xB = min(bA[2], bB[2])
    yB = min(bA[3], bB[3])
    inter = max(0, xB - xA) * max(0, yB - yA)
    areaA = (bA[2] - bA[0]) * (bA[3] - bA[1])
    areaB = (bB[2] - bB[0]) * (bB[3] - bB[1])
    return inter / float(areaA + areaB - inter) if (areaA + areaB - inter) > 0 else 0

raw_vehicle_candidates.sort(key=lambda x: x["conf"], reverse=True)
vehicles = []
for v in raw_vehicle_candidates:
    vx1, vy1, vx2, vy2 = v["box"]
    bw = vx2 - vx1
    bh = vy2 - vy1
    # Minimum reasonable vehicle size (down to 20px so background vehicles survive)
    if bw < 20 or bh < 20:
        continue
    # Keep if no high overlap with already selected vehicle
    if not any(compute_iou(v["box"], kv["box"]) > 0.42 for kv in vehicles):
        vehicles.append(v)

# Sort vehicles left-to-right for consistent ordering
vehicles.sort(key=lambda x: x["box"][0])
t_detect = time.perf_counter() - t0
print(f"Cleaned unique vehicles detected: {len(vehicles)} (in {t_detect:.2f}s)")

# ---------------------------------------------------------------------------
# STEP 2 & 3: CROP & CLEAN NUMBER PLATES FOR EACH VEHICLE
# ---------------------------------------------------------------------------
def clean_plate_image(plate_crop: np.ndarray) -> np.ndarray:
    """
    Clean and enhance a cropped license plate image:
    1. Upscale / standardize height to >= 80px (Lanczos interpolation)
    2. Zero-DCE brightness enhancement if dark
    3. CLAHE (Contrast-Limited Adaptive Histogram Equalization) in LAB
    4. Denoising + unsharp mask sharpening for crisp character edges
    """
    if plate_crop is None or plate_crop.size == 0:
        return plate_crop
    
    ch, cw = plate_crop.shape[:2]
    # Standardize height
    target_h = max(72, ch)
    scale = target_h / float(ch)
    target_w = int(cw * scale)
    cleaned = cv2.resize(plate_crop, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)

    # 1. Zero-DCE if dark
    cleaned, _ = enhance_with_zero_dce(cleaned)
    # 2. CLAHE local contrast enhancement
    cleaned, _ = apply_clahe(cleaned)
    # 3. OpenCV preprocess: denoise & sharpen
    cleaned = preprocess_plate_crop(cleaned, target_height=target_h, sharpen=True)
    return cleaned

processed_vehicles = []
print("\n[Step 2 & 3] Cropping & cleaning number plates for all vehicles...")

for idx, v in enumerate(vehicles, 1):
    vx1, vy1, vx2, vy2 = v["box"]
    vw = vx2 - vx1
    vh = vy2 - vy1

    # Extract dominant vehicle color
    color = _extract_dominant_color(img, (vx1, vy1 + int(vh * 0.4), vx2, vy2), (vx1, vy1, vx2, vy2))

    # Candidate plate zone inside vehicle:
    # On 4-wheelers: lower 55% of the vehicle
    # On 2-wheelers: lower 70% or middle
    if v["type"] == "motorcycle":
        roi_y1 = max(0, vy1 + int(vh * 0.25))
        roi_y2 = min(img_h, vy2)
    else:
        roi_y1 = max(0, vy1 + int(vh * 0.35))
        roi_y2 = min(img_h, vy2)
    
    roi_x1 = max(0, vx1 - int(vw * 0.04))
    roi_x2 = min(img_w, vx2 + int(vw * 0.04))

    vehicle_roi = img[roi_y1:roi_y2, roi_x1:roi_x2]
    if vehicle_roi.size == 0:
        continue

    # Run OCR on the vehicle bumper ROI to locate the exact plate
    rgb_roi = cv2.cvtColor(vehicle_roi, cv2.COLOR_BGR2RGB)
    ocr_res = ocr.ocr(rgb_roi, cls=True)

    plate_info = {
        "id": idx,
        "type": v["type"],
        "conf": v["conf"],
        "color": color,
        "box": v["box"],
        "has_plate": False,
        "raw_text": "",
        "cleaned_text": "",
        "plate_conf": 0.0,
        "plate_status": "NO_PLATE",
        "plate_box": None,
        "original_plate_crop": None,
        "cleaned_plate_crop": None,
    }

    best_cand = None
    if ocr_res and ocr_res[0]:
        for line in ocr_res[0]:
            pts, (txt, conf) = line
            clean = re.sub(r"[^A-Z0-9]", "", txt.upper())
            # Filter noise
            if len(clean) >= 3:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                px1 = int(roi_x1 + min(xs))
                py1 = int(roi_y1 + min(ys))
                px2 = int(roi_x1 + max(xs))
                py2 = int(roi_y1 + max(ys))
                
                # Check aspect ratio of candidate text box
                pw = px2 - px1
                ph = py2 - py1
                if ph > 0 and (pw / ph) >= 0.8:
                    norm = normalize_plate_text(clean)
                    status, _ = validate_indian_plate(norm)
                    score = conf + (0.5 if status == "VALID_FORMAT" else 0.2 if status == "POSSIBLE_FORMAT" else 0.0)
                    if best_cand is None or score > best_cand["score"]:
                        best_cand = {
                            "clean": clean,
                            "norm": norm,
                            "conf": conf,
                            "status": status,
                            "score": score,
                            "box": (px1, py1, px2, py2)
                        }

    if best_cand:
        bx1, by1, bx2, by2 = best_cand["box"]
        # Add padding around plate for clean crop
        pad_x = max(6, int((bx2 - bx1) * 0.12))
        pad_y = max(4, int((by2 - by1) * 0.22))
        crop_x1 = max(0, bx1 - pad_x)
        crop_y1 = max(0, by1 - pad_y)
        crop_x2 = min(img_w, bx2 + pad_x)
        crop_y2 = min(img_h, by2 + pad_y)

        orig_crop = img[crop_y1:crop_y2, crop_x1:crop_x2].copy()
        cleaned_crop = clean_plate_image(orig_crop)

        # Re-run OCR on the cleaned/enhanced plate crop for best character accuracy
        rgb_cleaned = cv2.cvtColor(cleaned_crop, cv2.COLOR_BGR2RGB)
        re_ocr = ocr.ocr(rgb_cleaned, cls=True)
        final_text = best_cand["norm"]
        final_conf = best_cand["conf"]
        final_status = best_cand["status"]

        if re_ocr and re_ocr[0]:
            # Pick best recognized line from enhanced crop
            for l in re_ocr[0]:
                _, (rtxt, rconf) = l
                rclean = re.sub(r"[^A-Z0-9]", "", rtxt.upper())
                rnorm = normalize_plate_text(rclean)
                rstatus, _ = validate_indian_plate(rnorm)
                if rstatus == "VALID_FORMAT" or (rstatus == "POSSIBLE_FORMAT" and len(rnorm) >= len(final_text)):
                    final_text = rnorm
                    final_conf = max(final_conf, rconf)
                    final_status = rstatus
                    break

        plate_info.update({
            "has_plate": True,
            "raw_text": best_cand["clean"],
            "cleaned_text": final_text,
            "plate_conf": final_conf,
            "plate_status": final_status,
            "plate_box": (crop_x1, crop_y1, crop_x2, crop_y2),
            "original_plate_crop": orig_crop,
            "cleaned_plate_crop": cleaned_crop,
        })
    else:
        # No OCR text detected; crop standard bumper area as fallback
        bumper_h = int(vh * 0.22)
        bumper_w = int(vw * 0.65)
        cx = (vx1 + vx2) // 2
        cy = vy2 - int(vh * 0.15)
        crop_x1 = max(0, cx - bumper_w // 2)
        crop_y1 = max(0, cy - bumper_h // 2)
        crop_x2 = min(img_w, cx + bumper_w // 2)
        crop_y2 = min(img_h, cy + bumper_h // 2)
        orig_crop = img[crop_y1:crop_y2, crop_x1:crop_x2].copy()
        if orig_crop.size > 0:
            cleaned_crop = clean_plate_image(orig_crop)
            plate_info.update({
                "plate_box": (crop_x1, crop_y1, crop_x2, crop_y2),
                "original_plate_crop": orig_crop,
                "cleaned_plate_crop": cleaned_crop,
                "plate_status": "NOT_READABLE_OR_DISTANT"
            })

    processed_vehicles.append(plate_info)

# ---------------------------------------------------------------------------
# STEP 4: DISPLAY & VISUALIZE
# ---------------------------------------------------------------------------
print("\n[Step 4] Generating display annotations & cleaned plates gallery...")

annotated = img.copy()

# Draw vehicles & plates on annotated image
for p in processed_vehicles:
    vx1, vy1, vx2, vy2 = p["box"]
    v_type = p["type"].capitalize()
    color = p["color"]
    v_label = f"#{p['id']} {v_type} ({color})"

    # 1. Vehicle bounding box (cyan)
    cv2.rectangle(annotated, (vx1, vy1), (vx2, vy2), (255, 200, 0), 2)
    # Vehicle label badge
    (w_txt, h_txt), _ = cv2.getTextSize(v_label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
    cv2.rectangle(annotated, (vx1, max(0, vy1 - 24)), (vx1 + w_txt + 8, vy1), (255, 200, 0), -1)
    cv2.putText(annotated, v_label, (vx1 + 4, max(16, vy1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (20, 20, 20), 2)

    # 2. Number plate bounding box (bright green for valid, orange for possible/detected)
    if p["has_plate"] and p["plate_box"]:
        px1, py1, px2, py2 = p["plate_box"]
        color_box = (0, 255, 0) if p["plate_status"] == "VALID_FORMAT" else (0, 165, 255)
        cv2.rectangle(annotated, (px1, py1), (px2, py2), color_box, 3)
        plate_lbl = f"{p['cleaned_text']} ({int(p['plate_conf']*100)}%)"
        (pw, ph), _ = cv2.getTextSize(plate_lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.60, 2)
        cv2.rectangle(annotated, (px1, max(0, py1 - 26)), (px1 + pw + 8, py1), color_box, -1)
        cv2.putText(annotated, plate_lbl, (px1 + 4, max(18, py1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 0, 0), 2)

# Save annotated full frame
cv2.imwrite(output_annotated_path, annotated)
print(f"✓ Saved annotated scene image: {output_annotated_path}")

# Build Side-by-Side Cleaned Plates Gallery
plates_with_crops = [p for p in processed_vehicles if p["original_plate_crop"] is not None and p["original_plate_crop"].size > 0]
if plates_with_crops:
    card_h = 90
    orig_w = 220
    clean_w = 220
    info_w = 340
    row_w = orig_w + clean_w + info_w + 30
    header_h = 70
    gallery_h = header_h + len(plates_with_crops) * (card_h + 10) + 20
    gallery = np.full((gallery_h, row_w, 3), 28, dtype=np.uint8)

    # Header
    cv2.rectangle(gallery, (0, 0), (row_w, header_h), (38, 38, 38), -1)
    cv2.putText(gallery, "DRISHTIGRID ANPR - NUMBER PLATE CROPS & CLEANING GALLERY", (20, 42),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 230, 255), 2)

    for i, p in enumerate(plates_with_crops):
        y_off = header_h + 10 + i * (card_h + 10)
        cv2.rectangle(gallery, (10, y_off), (row_w - 10, y_off + card_h), (45, 45, 45), -1)

        # 1. Original crop
        orig = cv2.resize(p["original_plate_crop"], (orig_w, card_h - 10), interpolation=cv2.INTER_LINEAR)
        gallery[y_off+5 : y_off+card_h-5, 20 : 20+orig_w] = orig
        cv2.putText(gallery, "Original Crop", (25, y_off + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        # 2. Cleaned crop
        clean = cv2.resize(p["cleaned_plate_crop"], (clean_w, card_h - 10), interpolation=cv2.INTER_LANCZOS4)
        gallery[y_off+5 : y_off+card_h-5, 30+orig_w : 30+orig_w+clean_w] = clean
        cv2.putText(gallery, "Cleaned & Enhanced", (35+orig_w, y_off + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

        # 3. Information badge
        info_x = 40 + orig_w + clean_w
        veh_str = f"Vehicle #{p['id']}: {p['color']} {p['type'].capitalize()}"
        plate_str = f"Plate: {p['cleaned_text'] or 'NOT_READABLE'}"
        stat_str = f"Status: {p['plate_status']} (Conf: {p['plate_conf']:.2f})"

        status_color = (0, 255, 120) if p["plate_status"] == "VALID_FORMAT" else (0, 180, 255) if p["has_plate"] else (160, 160, 160)

        cv2.putText(gallery, veh_str, (info_x, y_off + 26), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (230, 230, 230), 1)
        cv2.putText(gallery, plate_str, (info_x, y_off + 52), cv2.FONT_HERSHEY_SIMPLEX, 0.65, status_color, 2)
        cv2.putText(gallery, stat_str, (info_x, y_off + 76), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1)

    cv2.imwrite(output_gallery_path, gallery)
    print(f"✓ Saved cleaned plates gallery: {output_gallery_path}")

# ---------------------------------------------------------------------------
# SUMMARY TABLE
# ---------------------------------------------------------------------------
print("\n" + "="*85)
print(f"{'#':<4} {'Type':<12} {'Color':<14} {'Vehicle Box':<22} {'Cleaned Plate':<16} {'Conf':<8} {'Status'}")
print("="*85)
plates_found = 0
for p in processed_vehicles:
    b_str = f"[{p['box'][0]},{p['box'][1]},{p['box'][2]},{p['box'][3]}]"
    txt = p['cleaned_text'] if p['cleaned_text'] else "-"
    conf_str = f"{p['plate_conf']:.2f}" if p['has_plate'] else "-"
    if p["has_plate"]:
        plates_found += 1
    print(f"{p['id']:<4} {p['type']:<12} {p['color']:<14} {b_str:<22} {txt:<16} {conf_str:<8} {p['plate_status']}")

print("="*85)
print(f"TOTAL DETECTED: {len(processed_vehicles)} vehicles, {plates_found} readable number plates.")
print(f"Annotated visual: file:///{output_annotated_path.replace(chr(92), '/')}")
print(f"Plates gallery:   file:///{output_gallery_path.replace(chr(92), '/')}")
print("="*85)
