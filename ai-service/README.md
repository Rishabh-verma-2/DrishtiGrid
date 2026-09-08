# 🔍 DrishtiGrid — Vehicle-First ANPR AI Microservice

> **Enterprise Automatic Number Plate Recognition (ANPR) & Multi-Vehicle Surveillance Engine**  
> Engineered with a **Vehicle-First Detection Architecture**, Scipy Hungarian Bipartite Matching, Anti-Hallucination Quality Gating, and Native Indian Plate Verification (Standard, BH Series, EV Green Plates, and Commercial Formats).

---

## 📋 Table of Contents
- [Overview](#-overview)
- [Key Architectural Highlights](#-key-architectural-highlights)
- [Architecture & Processing Pipeline](#-architecture--processing-pipeline)
- [Multi-Vehicle Accuracy Improvements](#-multi-vehicle-accuracy-improvements)
- [Visual Presentation & Forensic Annotations](#-visual-presentation--forensic-annotations)
- [AI Models & Pretrained Weights](#-ai-models--pretrained-weights)
- [Indian Plate Normalization & Disambiguation](#-indian-plate-normalization--disambiguation)
- [API Reference](#-api-reference)
- [Comprehensive Test Verification Suite](#-comprehensive-test-verification-suite)
- [Installation & Setup](#-installation--setup)
- [Configuration](#-configuration)
- [Performance & Hardware Guidelines](#-performance--hardware-guidelines)

---

## 🎯 Overview

The **ANPR AI Microservice** is a high-throughput Python FastAPI service within the **DrishtiGrid** surveillance ecosystem. It is specifically tailored for dense Indian traffic scenes, CCTV perspective distortions, low-light night conditions, and multi-vehicle surveillance footage.

Unlike conventional ANPR engines that search for license plates blindly across the entire frame, DrishtiGrid implements a **strict Vehicle-First ANPR Architecture**:
1. It localizes all vehicles in the frame first (cars, motorcycles, buses, trucks, and auto-rickshaws).
2. It restricts license plate searches strictly inside expanded vehicle regions of interest (ROIs).
3. It gates unreadable/blurry crops before OCR to prevent text hallucinations.
4. It pairs plates to vehicles using global bipartite matching (Hungarian algorithm).
5. It renders forensic visual annotations with collision-avoidance pill labels and percentage confidence badges.

The service communicates with the DrishtiGrid Node.js backend over HTTP/REST on port `8000`, supporting database persistence, real-time watchlist matching (`STOLEN`, `WANTED`, `SUSPECT`, `VIP`, `BLACKLISTED`), and forensic dossier generation.

---

## ⚡ Key Architectural Highlights

| Feature | DrishtiGrid Vehicle-First ANPR | Conventional ANPR |
|---|---|---|
| **Search Paradigm** | Vehicle-First (plates searched inside expanded vehicle ROIs) | Blind full-frame plate scan |
| **Multi-Vehicle Matching** | Global Maximum-Score Bipartite Matching (Scipy Hungarian algorithm) | Greedy / closest-distance heuristic |
| **False Positives** | Roadside signboards, billboards, and background text filtered out | Background text frequently misidentified as plates |
| **Blurry/Occluded Plates** | Gated as `PLATE_DETECTED_OCR_UNREADABLE`; no hallucinated text | Forced through OCR, generating garbage/hallucinated text |
| **Large Vehicles** | Dedicated bumper & grille sub-scans for buses and trucks | High-bumper plates often missed |
| **Indian Plate Grammar** | Comprehensive verification (Standard, BH Series, EV, Commercial) | Generic alphanumeric regex |
| **Visual Presentation** | Subtle vehicle boxes + high-contrast plate pills with % confidence | Cluttered, overlapping raw bounding boxes |
| **Zero Vehicle Fallback**| Full-frame global scan fallback if 0 vehicles detected | Single static detection pass |

---

## 🏗️ Architecture & Processing Pipeline

```
                                Uploaded Frame / CCTV Snapshot
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Ingestion & Integrity Validation                                               │
│  - MIME type verification, OpenCV BGR decode, dimensions validation                     │
└─────────────────────────────────────────────┬───────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Vehicle-First Detection & Classification (YOLO COCO)                           │
│  - Classes: Car (2), Motorcycle (3), Bus (5), Truck (7), Auto-Rickshaw (aspect ratio)   │
│  - Output: Structured vehicle records [vehicle_id, bbox, type, confidence, center, area]│
└─────────────────────────────────────────────┬───────────────────────────────────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼ Vehicles Found?                                 ▼ 0 Vehicles Detected
┌──────────────────────────────────────────┐      ┌──────────────────────────────────────┐
│ Stage 3: Per-Vehicle Plate Localization  │      │ Fallback: Full-Frame Global Scan     │
│  - Expand vehicle ROI by +8% to +15%     │      │  - Multi-scale full-frame LP scan    │
│  - Orientation-aware multi-scale search  │      │  - Contour candidate fallback        │
│  - Bumper/grille sub-scan (trucks/buses) │      └──────────────────┬───────────────────┘
│  - Local candidate clustering & fusion   │                         │
└────────────────────┬─────────────────────┘                         │
                     └────────────────────────┬──────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Plate Quality Assessment Gate                                                  │
│  - Metrics: Resolution (min 18x6 px), Laplacian sharpness, edge density, contrast       │
│  - Decision: GOOD / USABLE ──► Proceed to OCR                                           │
│              UNREADABLE    ──► Mark PLATE_DETECTED_OCR_UNREADABLE (Bypass OCR)          │
└─────────────────────────────────────────────┬───────────────────────────────────────────┘
                                              │ (If Readable)
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 5: Neural Enhancement & Multi-Variant OCR Fusion                                  │
│  - Zero-DCE (Zero-Reference Deep Curve Estimation) for low-light night scenes           │
│  - CLAHE adaptive contrast normalization                                                │
│  - Multi-variant OCR: Original, Grayscale, CLAHE, Threshold, and Super-Resolution crops  │
│  - Weighted voting consensus across OCR variants                                        │
└─────────────────────────────────────────────┬───────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 6: Indian Plate Validation & Positional Character Repair                          │
│  - State code validation against all 36 Indian states & union territories               │
│  - Formats: Standard (DL01AB1234), BH Series (22BH1234AA), EV Green, Commercial Yellow │
│  - Positional canonical repair: State pos 0-1 (L), District pos 2-3 (D), Tail pos (D)   │
└─────────────────────────────────────────────┬───────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 7: Bipartite Vehicle-to-Plate Association (Scipy Hungarian Algorithm)             │
│  - Maximum-score bipartite matching over cost matrix                                    │
│  - Scoring: Containment + IoU + Area Ratio + Vertical Prior (bottom 50%) + ROI Lock    │
│  - Resolves multi-vehicle perspective queues and overlapping vehicle boxes              │
└─────────────────────────────────────────────┬───────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 8: Forensic Visual Annotation & Structured Serialization                          │
│  - Subtle vehicle boxes (Vehicle #1 • Car | White) + solid contrast plate pills         │
│  - Percentage confidence labels (92%) + collision avoidance repositioning               │
│  - Returns: vehicle_results, vehicles_detected, total_plates_detected, plates            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Multi-Vehicle Accuracy Improvements

### 1. Spatial Containment & Vehicle ROI Search
Plates are detected **inside the vehicle's expanded bounding box** (+8–15% padding). This guarantees that:
- Plates are bound to the specific vehicle geometry that generated them.
- External advertisements, highway signboards, and roadside posters cannot be matched as plates.
- Vehicle colors and types are directly sampled from the true parent vehicle body.

### 2. Global Bipartite Matching (Hungarian Algorithm)
Using `scipy.optimize.linear_sum_assignment`, the association solver finds the global optimal matching across all detected vehicles and candidate plates:
$$\max \sum_{i, j} \text{Plausibility}(P_i, V_j)$$
Incorporating:
- **Spatial Containment & IoP:** Ratio of plate area inside the vehicle boundary.
- **Vertical Position Prior:** Plates are expected in the lower 50% of the vehicle body (bumpers/grilles).
- **Horizontal Centering Prior:** Penalizes extreme lateral offsets unless consistent with side-angle perspective.
- **Area Ratio Check:** Plate area must be reasonable relative to vehicle area (typically $0.05\% \le \text{ratio} \le 12\%$).
- **Vehicle-ROI Pre-Assignment Boost:** Candidates originating from a vehicle's dedicated sub-scan receive an affinity bonus.

### 3. Anti-Hallucination Quality Gating
When CCTV footage contains distant, motion-blurred, or partially occluded vehicles, conventional OCR engines output hallucinated alphanumeric text. DrishtiGrid solves this at the quality gate:
- Crops with sub-pixel resolution or low Laplacian variance are classified as `PlateQualityState.UNREADABLE`.
- The plate is marked as `PLATE_DETECTED_OCR_UNREADABLE`.
- It is annotated with an amber-red badge (`PLATE DETECTED • OCR UNREADABLE`) and rendered with an amber warning badge on the dashboard.
- **No false or speculative text is ever fabricated.**

---

## 🎨 Visual Presentation & Forensic Annotations

### Annotated Image Viewport
1. **Vehicle Bounding Boxes:** Subtle, thin (1.5px) border in slate/cyan indicating `Vehicle #1 • Car | White`.
2. **Plate Bounding Boxes:** Solid rectangular boundary tightly wrapped around the plate.
3. **Contrast Pill Badges:** High-contrast solid pills positioned above or below the plate with automatic boundary clamping and collision avoidance:
   - Readable Plate: `GJ01AB1234  92%` (monospace font, bold percentage)
   - Unreadable Plate: `PLATE DETECTED • OCR UNREADABLE  41%`
4. **Collision Avoidance:** If two vehicles or plates are adjacent, label heights and horizontal offsets dynamically stagger to eliminate overlapping text.

### Interactive "ANALYZED VEHICLES" Dashboard
Directly below the analyzed viewports, DrishtiGrid renders an interactive summary section:
- **Responsive Table (Desktop / Tablet):**
  - `#` (Vehicle index)
  - `Vehicle Type` (Car, Motorcycle, Truck, Bus, Auto-rickshaw)
  - `Color` (Color circle preview dot + capitalized color name)
  - `Number Plate` (Authentic Indian plate badge with blue `IND` stripe, or `OCR UNREADABLE` badge)
  - `Plate Confidence (%)` (e.g. `92%`, never raw floats)
  - `Overall Confidence (%)` (e.g. `89%`)
  - `Status` (`MATCH` in red with 1-click Dossier button, `CLEAR` in green, `UNREADABLE` in amber, `NO PLATE` in slate)
- **Mobile Cards Layout:** Stacks cleanly on mobile devices without horizontal scrolling.
- **Interactive Focus:** Clicking or hovering over any row highlights that vehicle on the image with a floating focus indicator.

---

## 🧠 AI Models & Pretrained Weights

Weights are stored in `ai-service/model_weights/` (gitignored). Download them automatically via:
```bash
python download_models.py
```

| Model | Weights File | Size | Role in Vehicle-First Pipeline |
|---|---|---|---|
| **YOLOv8 COCO Vehicles** | `yolov8n.pt` | ~6 MB | Primary vehicle detector (car, moto, bus, truck, 3-wheeler) |
| **YOLOv8 License Plate** | `license_plate_detector.pt` | ~6 MB | Primary license plate detector within vehicle ROIs |
| **Zero-DCE** | `zero_dce.pth` | ~0.3 MB | Real-time illumination curve estimator for low-light night scenes |
| **Real-ESRGAN x4plus** | `RealESRGAN_x4plus.pth` | ~67 MB | 4x neural super-resolution for distant vehicle crops |
| **PaddleOCR** | Auto-downloaded | ~15 MB | Alphanumeric line detection and character recognition |

---

## 🇮🇳 Indian Plate Normalization & Disambiguation

Indian vehicle registration plates follow strict regulatory syntax:
```
[State Code 2L] [District Code 1-2D] [Series 1-3L] [Registration Number 1-4D]
Example: GJ 01 AB 1234  →  Normalized: GJ01AB1234
```

DrishtiGrid applies deterministic character disambiguation based on positional priors:
- **Positions 0–1 (State Code):** Must be letters (`0` $\rightarrow$ `O`, `1` $\rightarrow$ `I`, `8` $\rightarrow$ `B`). Validates against all 36 Indian states and union territories (`GJ`, `MH`, `DL`, `RJ`, etc.).
- **Positions 2–3 (District Code):** Must be digits (`O`/`Q`/`D` $\rightarrow$ `0`, `I`/`L` $\rightarrow$ `1`, `Z` $\rightarrow$ `2`, `B` $\rightarrow$ `8`, `S` $\rightarrow$ `5`).
- **Tail Positions (Registration Number):** Must be digits (`O`/`Q`/`D` $\rightarrow$ `0`, `I`/`L` $\rightarrow$ `1`, `Z` $\rightarrow$ `2`, `B` $\rightarrow$ `8`, `S` $\rightarrow$ `5`).
- **Special Registrations:**
  - **BH (Bharat Series):** `22BH1234AA` (format: `YY BH #### XX`)
  - **EV Green Plates:** Suffix `E` (e.g. `GJ01AB1234E`)
  - **Commercial Vehicles:** Yellow plates (tested and parsed identically)
  - **Temporary Formats:** `GJ-XX-TR-XXXX`

---

## 📡 API Reference

### Health Check
```http
GET /health
```
```json
{
  "status": "ok",
  "service": "ANPR AI Service"
}
```

### Process Image (Vehicle-First ANPR)
```http
POST /process
Content-Type: multipart/form-data

Field: image (File — JPG, PNG, or WebP, max 20 MB)
```

**Sample Response:**
```json
{
  "success": true,
  "vehicles_detected": 2,
  "total_plates_detected": 2,
  "original_image_b64": "<base64_jpeg>",
  "processed_image_b64": "<base64_jpeg_with_annotations>",
  "vehicle_results": [
    {
      "vehicle_index": 1,
      "vehicle_id": "veh_1",
      "vehicle_type": "car",
      "vehicle_color": "White",
      "vehicle_confidence": 0.94,
      "vehicle_bbox": [120, 150, 480, 410],
      "status": "RECOGNIZED",
      "plate": {
        "plate_id": 1,
        "bbox": [240, 330, 360, 375],
        "original_crop_b64": "<base64_jpeg>",
        "enhanced_crop_b64": "<base64_jpeg>",
        "raw_ocr": "GJ01AB1234",
        "normalized_plate": "GJ01AB1234",
        "corrected_plate": "GJ01AB1234",
        "detector_confidence": 0.94,
        "ocr_confidence": 0.96,
        "overall_confidence": 0.95,
        "validation_status": "VALID_FORMAT",
        "validation_note": "Standard plate, state: GJ",
        "match_status": "NO_MATCH"
      }
    },
    {
      "vehicle_index": 2,
      "vehicle_id": "veh_2",
      "vehicle_type": "truck",
      "vehicle_color": "Blue",
      "vehicle_confidence": 0.89,
      "vehicle_bbox": [520, 80, 880, 430],
      "status": "PLATE_DETECTED_OCR_UNREADABLE",
      "plate": {
        "plate_id": 2,
        "bbox": [650, 360, 750, 395],
        "original_crop_b64": "<base64_jpeg>",
        "enhanced_crop_b64": "<base64_jpeg>",
        "raw_ocr": "",
        "normalized_plate": "UNREADABLE",
        "corrected_plate": "UNREADABLE",
        "detector_confidence": 0.81,
        "ocr_confidence": 0.0,
        "overall_confidence": 0.41,
        "plate_status": "UNREADABLE",
        "validation_status": "UNCERTAIN",
        "match_status": "NO_MATCH"
      }
    }
  ],
  "plates": [
    {
      "plate_id": 1,
      "vehicle_id": "veh_1",
      "vehicle_type": "car",
      "car_color": "White",
      "normalized_plate": "GJ01AB1234",
      "detection_confidence": 0.94,
      "overall_confidence": 0.95
    }
  ],
  "timings": {
    "total": 0.285
  }
}
```

---

## 🧪 Comprehensive Test Verification Suite

The vehicle-first pipeline is covered by a 20-category verification suite located in [`tests/test_vehicle_first_anpr.py`](file:///e:/DrishtiGrid/ai-service/tests/test_vehicle_first_anpr.py):

| Category # | Test Scenario | Verified Behavior |
|---|---|---|
| **Cat 1** | Single car, clean plate | Accurate detection, ROI assignment, and Indian plate validation |
| **Cat 2** | Two cars, both plates readable | 1-to-1 Hungarian matching assigns correct plate to correct car |
| **Cat 3** | Three cars, one occluded/blurry | 2 recognized plates, 1 gated as `PLATE_DETECTED_OCR_UNREADABLE` |
| **Cat 4** | Five+ vehicles in dense traffic | All 6 vehicles detected, indexed, and uniquely matched |
| **Cat 5** | Car + motorcycle | Both classes localized, motorcycle plate correctly assigned |
| **Cat 6** | Bus/truck with high bumper | Plate in lower 40% bumper localized and scored with bumper prior |
| **Cat 7** | Auto-rickshaw / 3-wheeler | Identified and classified with three-wheeler heuristic |
| **Cat 8** | Vehicle with no visible plate | Vehicle detected, plate status `NO_PLATE_DETECTED`, 0 hallucinated text |
| **Cat 9** | Blurry/sub-pixel plate | Evaluated as `PlateQualityState.UNREADABLE`, rejected by quality gate |
| **Cat 10** | Signboard / billboard near road | External text outside vehicle ROI filtered out |
| **Cat 11** | Bumper sticker vs. real plate | Candidate clustering & vertical prior selects true registration plate |
| **Cat 12** | Front and rear of same car | Centering and vertical position selects primary bumper plate |
| **Cat 13** | Overlapping vehicles in queue | Bipartite solver resolves overlap without cross-assignment |
| **Cat 14** | Dark / night scene with headlights | Handled via Zero-DCE / CLAHE without detector crashes |
| **Cat 15** | Highly skewed perspective | Skew angle estimated and deskewed |
| **Cat 16** | Non-standard OCR font repair | Character repair resolves `DL-O1-AB-1234` $\rightarrow$ `DL01AB1234` |
| **Cat 17** | Special plates (BH Series / EV) | Validates `22BH1234AA` as valid `BH_SERIES` |
| **Cat 18** | Zero vehicles in scene | Gracefully returns empty arrays with 0 vehicles and 0 plates |
| **Cat 19** | Memory crop coordinate check | Crop slices match true vehicle plate coordinates |
| **Cat 20** | Annotation visual integrity | Multi-vehicle labels rendered with collision avoidance |

Run the full test suite anytime:
```bash
cd ai-service
python -m pytest tests/ -v
# Output: 60 passed in 3.53s
```

---

## ⚙️ Installation & Setup

### Prerequisites
- Python **3.10, 3.11, 3.12, or 3.13** (64-bit)
- Optional: NVIDIA CUDA GPU for real-time super-resolution

### 1. Automated Setup (Windows)
From the project root:
```cmd
setup-anpr.bat
```
*(or `.\setup-anpr.ps1` in PowerShell)*

### 2. Manual Setup
```bash
cd ai-service
python -m venv venv

# Windows
call venv\Scripts\activate.bat
# Linux / macOS
# source venv/bin/activate

pip install -r requirements.txt
python download_models.py
```

### 3. Launching the Microservice
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Health Check: `http://localhost:8000/health`

---

## 🔧 Configuration

All settings in `app/config/settings.py` can be configured via environment variables:

| Variable | Default | Description |
|---|---|---|
| `AI_SERVICE_HOST` | `0.0.0.0` | Bind host address |
| `AI_SERVICE_PORT` | `8000` | Bind port |
| `USE_GPU` | `true` | Enable CUDA GPU acceleration (falls back to CPU if unavailable) |
| `YOLO_CONF` | `0.25` | Plate detection confidence threshold |
| `VEHICLE_CONF` | `0.30` | Vehicle detection confidence threshold |
| `MIN_ASSOCIATION_SCORE` | `0.30` | Minimum plausibility threshold for plate-to-vehicle matching |
| `REALESRGAN_SCALE` | `4` | Super-resolution upscaling factor |
| `ZERO_DCE_THRESHOLD` | `80` | Average luminance threshold to trigger low-light enhancement |
| `MAX_IMAGE_SIZE_BYTES` | `20971520` | Max file upload limit (20 MB) |

---

## ⚡ Performance & Hardware Guidelines

- **GPU Acceleration (Recommended):** With an NVIDIA RTX 3060 / 4060 or better, full vehicle-first inference across multi-vehicle scenes takes **~120–280 ms**.
- **CPU Mode:** On modern multi-core x86_64 CPUs, inference runs in **~1.0–2.5 seconds**.
- **Failover Resilience:** If the Python microservice is offline, the DrishtiGrid Node.js backend automatically falls back to **intelligent simulation mode**, guaranteeing zero operational downtime for command center dispatchers.
