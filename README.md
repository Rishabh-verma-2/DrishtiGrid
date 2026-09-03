# 🚔 DrishtiGrid ANPR — AI-Powered License Plate Recognition Module

> **DrishtiGrid** is an AI surveillance platform built for smart city and law enforcement applications. This `ANPR` module is the **Automatic Number Plate Recognition** engine integrated into the DrishtiGrid platform — capable of detecting, enhancing, reading, and cross-referencing Indian vehicle license plates from uploaded images in real time.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Full Processing Pipeline](#full-processing-pipeline)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Features](#features)
7. [Quick Start](#quick-start)
8. [API Reference](#api-reference)
9. [Database & Storage](#database--storage)
10. [Watchlist & Alert System](#watchlist--alert-system)
11. [Frontend Pages](#frontend-pages)
12. [Model Weights](#model-weights)
13. [Environment Variables](#environment-variables)
14. [Known Limitations](#known-limitations)
15. [Security](#security)

---

## Overview

The ANPR module provides an end-to-end pipeline that:

1. Accepts one or many vehicle images via a browser upload
2. Sends each image through a **5-stage AI enhancement + OCR pipeline** in Python
3. Normalizes detected plate text using Indian registration format rules
4. Cross-references detected plates against a **live watchlist database**
5. Generates **real-time security alerts** with visual forensic evidence when a match is found
6. Logs every event with a full **audit trail**

The system is designed for **Indian vehicle license plates** following the format:
```
[State Code 2L] [District Code 2D] [Series 1-3L] [Number 1-4D]
Example: MH 01 BM 4679  →  Normalized: MH01BM4679
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React + Vite)                   │
│                        http://localhost:3000                     │
│                                                                  │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐  │
│  │  Analyzer    │  │  Plate Records │  │   Alert History     │  │
│  │  (Upload UI) │  │  (Watchlist)   │  │   (Audit Logs)      │  │
│  └──────┬───────┘  └────────────────┘  └─────────────────────┘  │
└─────────┼───────────────────────────────────────────────────────┘
          │  POST /api/ai/analyze-image  (multipart, one per image)
          ▼
┌─────────────────────────────────────────────────────────────────┐
│              Node.js Express Backend  (:5000)                    │
│                                                                  │
│  ├── /api/ai          → Forward image to Python AI Service      │
│  ├── /api/plate-records → Watchlist CRUD                        │
│  ├── /api/plate-alerts  → Alert records CRUD                    │
│  ├── /api/dashboard     → Aggregated statistics                  │
│  └── Multer file upload → Memory buffer (50 MB max)             │
│                                                                  │
│  Storage Layer (JSON flat-file + optional MongoDB):             │
│  ├── backend/data/plate_records.json                            │
│  ├── backend/data/plate_alerts.json                             │
│  └── backend/data/audit_logs.json                               │
└──────────────┬──────────────────────────────────────────────────┘
               │  POST /process  (multipart)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│           Python FastAPI AI Service  (:8000)                     │
│                                                                  │
│  Stage 1: YOLOv8 License Plate Detector                         │
│         ↓                                                        │
│  Stage 2: OpenCV Preprocessing  (denoise, sharpen, resize)      │
│         ↓                                                        │
│  Stage 3: Zero-DCE Enhancement  (low-light only)                │
│         ↓                                                        │
│  Stage 4: CLAHE Contrast + Real-ESRGAN x4 Super-Resolution      │
│         ↓                                                        │
│  Stage 5: PaddleOCR → Indian Plate Validation & Normalization   │
│                                                                  │
│  Returns: plates[], original_image (base64), timings{}          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Full Processing Pipeline

Each uploaded image goes through the following stages:

### Stage 1 — Image Validation & Ingestion
- MIME type validated (JPEG/PNG only) at both Express and FastAPI layers
- File size enforced (max 50 MB at Express, 20 MB at FastAPI)
- Image decoded from multipart buffer into a NumPy array via OpenCV

### Stage 2 — YOLOv8 License Plate Detection
- **Model**: Dedicated `license_plate_detector.pt` (single-class YOLOv8n trained exclusively on license plates)
- **Fallback**: `yolov8n.pt` (COCO-trained) if LP model unavailable
- Bounding boxes filtered by:
  - **Aspect ratio**: 1.15 ≤ w/h ≤ 7.0 (eliminates wheels, headlights, bumpers)
  - **Minimum size**: width ≥ 28px, height ≥ 10px
  - **NMS suppression**: removes heavily overlapping duplicate boxes
- Returns: list of `(x, y, w, h, confidence)` bounding boxes

### Stage 3 — Plate Crop & OpenCV Preprocessing
For each detected bounding box:
- Crop with 8% safe padding (clamped to image bounds)
- Convert to grayscale
- Apply **adaptive Gaussian denoising** + **unsharp mask sharpening**
- Resize to standard height (64px) while preserving aspect ratio

### Stage 4 — Low-Light Enhancement (Zero-DCE)
- Calculates average brightness of crop
- If brightness < threshold (configurable, default 80/255):
  - Applies **Zero-DCE** (Zero-Reference Deep Curve Estimation) neural network
  - Enhances exposure without overexposing bright regions
- If brightness is sufficient, skips this stage for speed

### Stage 5 — CLAHE Local Contrast Enhancement
- Applies **CLAHE** (Contrast Limited Adaptive Histogram Equalization)
- Improves readability of faded or weathered plate text
- Only applied if standard deviation of pixel values is below contrast threshold

### Stage 6 — Real-ESRGAN Super-Resolution
- Upscales the plate crop **4× using Real-ESRGAN**
- A higher-resolution crop allows PaddleOCR to read small/blurry characters more accurately
- Falls back to **bicubic interpolation** if the `realesrgan` Python package is not installed

### Stage 7 — PaddleOCR Text Extraction
- Runs PaddleOCR on the enhanced, super-resolved crop
- Extracts raw text with per-character confidence scores
- OCR result is cleaned: spaces, hyphens, dots stripped

### Stage 8 — Indian Plate Normalization & Validation
Canonical OCR correction using positional character rules:

| Position | Expected | Common OCR Confusions → Fixed |
|---|---|---|
| 0–1 (State Code) | Letters | `0 → O`, `1 → I`, `8 → B` |
| 2–3 (District Code) | Digits | `O/Q/D → 0`, `I/L → 1`, `B → 8`, `Z → 2`, `S → 5` |
| Last 4 (Number) | Digits | Same digit corrections as above |

Format patterns validated:
- Standard: `XX 00 XX 0000`
- Short: `XX 00 X 000`
- Temporary/Special plates
- Diplomatic / Government plates

### Stage 9 — Watchlist Cross-Reference & Alert Generation
Back in the Node.js backend:
- Normalized plate string compared against all **ACTIVE** watchlist records
- **Exact canonical match** → `MATCH_FOUND` → Alert created immediately
- **1-edit-distance canonical match** → `POSSIBLE_MATCH` → Alert also created (no silent misses)
- Alert document created in `plate_alerts.json` / MongoDB with:
  - Plate crop images (base64)
  - OCR & detection confidence scores
  - Matched record metadata
  - Timestamp, source image name
- Frontend receives `alert_id` in response
- **MatchAlertPopup** fires instantly on screen with red emergency banner

### Stage 10 — Audit Logging
Every action (image analyzed, alert created, record added/deleted, batch completed) is appended to the audit log with timestamp, actor, and payload details.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS |
| **Backend** | Node.js 20, Express 5, Multer, Axios |
| **AI Service** | Python 3.10+, FastAPI, Uvicorn |
| **Detection** | YOLOv8 (Ultralytics) |
| **Enhancement** | OpenCV, Zero-DCE (PyTorch), CLAHE |
| **Super-Resolution** | Real-ESRGAN (PyTorch) |
| **OCR** | PaddleOCR (PaddlePaddle) |
| **Database** | JSON flat-file (default) + MongoDB Atlas (optional) |
| **Communication** | REST/JSON + multipart form-data |

---

## Project Structure

```
ANPR/
│
├── frontend/                    React + Vite UI (port 3000)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Analyzer.jsx         Multi-image upload & analysis page
│   │   │   ├── PlateRecordsPage.jsx Watchlist management (Add/Edit/Delete)
│   │   │   ├── AlertHistoryPage.jsx Alert history with status management
│   │   │   └── AuditLogsPage.jsx    Full event audit trail
│   │   ├── components/
│   │   │   ├── MultiUploadZone.jsx  Drag-and-drop multi-file uploader
│   │   │   ├── GroupedImageResults.jsx Per-image result cards with crops
│   │   │   ├── BatchProgress.jsx    Real-time per-image progress bar
│   │   │   ├── BatchSummary.jsx     Batch stats summary card
│   │   │   ├── MatchAlertPopup.jsx  Red emergency popup on match
│   │   │   ├── RecordModal.jsx      Add/Edit watchlist record modal
│   │   │   └── AlertDetailModal.jsx Alert detail viewer
│   │   └── api/
│   │       ├── analyzeImage.js      Per-image sequential batch API client
│   │       ├── recordsApi.js        Plate record CRUD API client
│   │       ├── alertsApi.js         Alert API client
│   │       └── dashboardApi.js      Dashboard stats API client
│   └── vite.config.js              Dev proxy → backend :5000
│
├── backend/                     Node.js Express (port 5000)
│   ├── src/
│   │   ├── server.js               Express app entry point
│   │   ├── routes/
│   │   │   ├── aiRoutes.js         /api/ai/* — forward to Python, match, alert
│   │   │   ├── plateRecordRoutes.js /api/plate-records/* CRUD
│   │   │   ├── alertRoutes.js      /api/plate-alerts/* CRUD
│   │   │   └── dashboardRoutes.js  /api/dashboard/stats
│   │   ├── services/
│   │   │   └── storage.js          JSON/MongoDB dual-mode persistence layer
│   │   ├── utils/
│   │   │   └── plateUtils.js       Canonical normalization + Levenshtein matching
│   │   ├── models/                 Mongoose schema definitions
│   │   ├── middleware/
│   │   │   └── upload.js           Multer config (50 MB/file, 20 files max)
│   │   └── config/
│   │       └── db.js               MongoDB Atlas connection
│   └── data/                    JSON flat-file fallback store
│       ├── plate_records.json
│       ├── plate_alerts.json
│       └── audit_logs.json
│
├── ai-service/                  Python FastAPI AI engine (port 8000)
│   ├── app/
│   │   ├── main.py                 FastAPI app entry
│   │   ├── api/routes.py           POST /process endpoint
│   │   ├── pipeline/plate_pipeline.py  Master orchestrator
│   │   ├── detection/yolo_detector.py  YOLOv8 with aspect-ratio filtering
│   │   ├── preprocessing/opencv_preprocess.py  Denoise + sharpen
│   │   ├── enhancement/
│   │   │   ├── zero_dce.py         Zero-DCE low-light enhancement
│   │   │   └── clahe.py            CLAHE contrast enhancement
│   │   ├── super_resolution/real_esrgan.py  x4 upscaling
│   │   ├── ocr/paddle_ocr.py       PaddleOCR wrapper
│   │   ├── validation/indian_plate.py  Plate normalization & format check
│   │   ├── config/settings.py      All model paths & hyperparameters
│   │   └── utils/                  Image helpers, temp file manager
│   ├── model_weights/           Pretrained model files (git-ignored)
│   │   ├── license_plate_detector.pt  (YOLOv8, LP-specific)
│   │   ├── zero_dce.pth
│   │   ├── RealESRGAN_x4plus.pth
│   │   └── yolov8n.pt
│   ├── download_models.py       Auto-download all model weights
│   ├── requirements.txt
│   └── tests/                   Unit + integration tests
│
├── .gitignore
└── README.md
```

---

## Features

### 🔍 Multi-Image Batch Analysis
- Upload 1–20 images simultaneously via drag-and-drop
- Each image is processed **sequentially** (one request per image to avoid server memory overflow)
- Real-time progress bar shows current image being processed
- Per-image result cards show source preview, plate crops, OCR text, and confidence scores

### 🚨 Watchlist Matching & Real-Time Alerts
- Add license plates to a **watchlist database** with category (STOLEN, WANTED, OTHER), priority, and reference ID
- Every analyzed image is cross-referenced against all ACTIVE records
- Intelligent canonical matching handles common OCR confusions (O/0, I/1, B/8)
- On match: **emergency popup** fires with:
  - Source scene image
  - Original plate crop
  - Enhanced/super-resolved plate crop
  - Matched record metadata
  - Direct link to Alert History

### 📊 Dashboard
- Live counters: Total Plates Analyzed, Active Records, Alerts Triggered, Audit Events
- All stats refresh automatically

### 📁 Alert History
- Full list of all generated alerts with filters (NEW, REVIEWED, DISMISSED)
- Change alert status inline
- View visual evidence (crops + source image) per alert

### 📋 Audit Trail
- Every system action logged with timestamp, action type, and payload
- Immutable event log for compliance and investigation

---

## Quick Start

### Prerequisites
- **Python 3.10+**
- **Node.js 20+**
- **npm**
- (Optional) NVIDIA GPU + CUDA 11.8+ for Real-ESRGAN acceleration

### Step 1 — Python AI Service

```bash
cd ai-service

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux / macOS

# Install all AI dependencies
pip install -r requirements.txt

# Download pretrained model weights (auto-downloads ~75 MB total)
python download_models.py

# Start the AI service
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Service health check: http://localhost:8000/health

### Step 2 — Node.js Backend

```bash
cd backend

# Copy environment template
copy .env.example .env          # Windows
# cp .env.example .env          # Linux / macOS

# Install dependencies
npm install

# Start backend (with hot-reload via nodemon)
npm run dev
```

Backend health check: http://localhost:5000/health

### Step 3 — React Frontend

```bash
cd frontend

npm install
npm run dev
```

Open: **http://localhost:3000**

---

## API Reference

### Analyze a Single Image

```
POST /api/ai/analyze-image
Content-Type: multipart/form-data

Field: image  (File — JPG/PNG, max 50 MB)
```

**Response:**
```json
{
  "success": true,
  "total_plates_detected": 1,
  "matched_plates_count": 1,
  "alerts_generated_count": 1,
  "original_image": "<base64-jpeg>",
  "processed_image": "<base64-jpeg>",
  "plates": [
    {
      "plate_id": 1,
      "bbox": { "x": 240, "y": 310, "width": 120, "height": 40 },
      "original_crop": "<base64-jpeg>",
      "enhanced_crop": "<base64-jpeg>",
      "raw_ocr": "MH 01 BM 4679",
      "normalized_plate": "MH01BM4679",
      "detection_confidence": 0.94,
      "ocr_confidence": 0.962,
      "overall_confidence": 0.951,
      "validation_status": "VALID_FORMAT",
      "match_status": "MATCH_FOUND",
      "match_type": "EXACT_MATCH",
      "matched_record": {
        "recordId": "PR-0002",
        "plate_number": "MH01BM4679",
        "category": "STOLEN",
        "priority": "HIGH"
      },
      "alert_id": "ALT-0042",
      "stages_applied": ["opencv_preprocess", "zero_dce", "clahe", "realesrgan", "paddleocr"]
    }
  ],
  "processing_time_ms": 3240
}
```

### Plate Records (Watchlist)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/plate-records` | List all records (filter: `?status=ACTIVE`) |
| `POST` | `/api/plate-records` | Add a new record |
| `PUT` | `/api/plate-records/:id` | Update a record |
| `DELETE` | `/api/plate-records/:id?hard=true` | Delete (hard=true = permanent) |

### Alerts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/plate-alerts` | List all alerts (filter: `?status=NEW`) |
| `GET` | `/api/plate-alerts/:id` | Get single alert with full image data |
| `PATCH` | `/api/plate-alerts/:id/status` | Update status (NEW/REVIEWED/DISMISSED) |

### Dashboard

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard/stats` | Aggregate system statistics |

---

## Database & Storage

The system uses a **dual-mode storage layer** (`backend/src/services/storage.js`):

### Mode 1: JSON Flat-File (Default — Zero Config)
All data stored in `backend/data/*.json` files.
No external database required.

### Mode 2: MongoDB Atlas (Optional)
Set `MONGO_URI` in `backend/.env` to enable MongoDB:

```env
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/drishtigrid
```

The storage layer automatically switches to MongoDB if the connection succeeds, falling back to JSON files on connection failure.

**Schema Collections:**
- `platerecords` — Watchlist records
- `platealerts` — Generated alerts with forensic evidence
- `auditlogs` — Immutable system event log

---

## Watchlist & Alert System

### Adding a Plate to the Watchlist

1. Navigate to **Plate Records** tab
2. Click **+ Add Record**
3. Fill in:
   - **Plate Number** (any format — auto-normalized on save)
   - **Category**: STOLEN / WANTED / SUSPICIOUS / OTHER
   - **Priority**: LOW / MEDIUM / HIGH / CRITICAL
   - **Reference ID** (case number, officer ID, etc.)
   - **Description** (optional notes)
4. Click **Save** — record becomes ACTIVE immediately

### How Matching Works

When an image is analyzed:

```
Detected OCR Text: "MHO1BM4679"   (OCR confused O for 0)
                        ↓
Canonical Normalization:
  Position 0-1 (State): MH  → letters kept
  Position 2-3 (District): O1 → O normalized to 0 → "01"
  Last 4 (Number): 4679 → digits kept
                        ↓
Canonical Form: "MH01BM4679"
                        ↓
Compare against active records:
  PR-0002: "MH01BM4679" canonical → "MH01BM4679"
                        ↓
EXACT CANONICAL MATCH → ALERT GENERATED
```

### Match Statuses

| Status | Meaning | Alert Generated? |
|---|---|---|
| `MATCH_FOUND` | Exact or canonical match | ✅ Yes |
| `POSSIBLE_MATCH` | 1 edit-distance from active record | ✅ Yes |
| `NO_MATCH` | No matching record | ❌ No |
| `OCR_UNCERTAIN` | Plate detected but text unreadable | ❌ No |

---

## Frontend Pages

### 🔬 Analyzer (`/`)
- Drag-and-drop upload zone (multi-image)
- Shows active monitored record count
- Per-image real-time progress: `ANALYZING IMAGE 3 OF 7`
- Results: image preview, plate crops, OCR text, confidence, match badge
- **Red emergency popup** fires if any plate matches the watchlist

### 📋 Plate Records (`/plate-records`)
- Full CRUD table of watchlist records
- Filter by status (ACTIVE / INACTIVE / ALL)
- Add / Edit / Delete records inline
- Record cards show alert count, last detected time

### 🚨 Alert History (`/alerts`)
- Chronological list of all triggered alerts
- Filter: NEW / REVIEWED / DISMISSED
- Each alert shows plate badge, matched record, confidence, source image
- Update status inline (NEW → REVIEWED → DISMISSED)

### 📊 Audit Logs (`/audit`)
- Full immutable event log
- Action types: `BATCH_ANALYZED`, `ALERT_CREATED`, `RECORD_ADDED`, `RECORD_DELETED`, etc.
- Timestamp, actor, and payload details per event

---

## Model Weights

Model weights are **not committed to git** (too large). Download them automatically:

```bash
cd ai-service
python download_models.py
```

| Model File | Size | Purpose |
|---|---|---|
| `license_plate_detector.pt` | ~6 MB | YOLOv8n trained exclusively on license plates |
| `yolov8n.pt` | ~6 MB | COCO-pretrained fallback detector |
| `zero_dce.pth` | ~0.3 MB | Zero-Reference Deep Curve Estimation |
| `RealESRGAN_x4plus.pth` | ~67 MB | Real-ESRGAN x4 super-resolution |

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Express server port |
| `AI_SERVICE_URL` | `http://localhost:8000` | Python AI service URL |
| `MONGO_URI` | *(unset)* | MongoDB connection string (optional) |
| `MAX_FILE_SIZE_MB` | `50` | Max upload size per file |
| `NODE_ENV` | `development` | Node environment |

### AI Service (`ai-service/app/config/settings.py`)

| Variable | Default | Description |
|---|---|---|
| `USE_GPU` | `true` | Enable CUDA GPU acceleration |
| `YOLO_MODEL_PREFERENCE` | `lp` | `lp` = LP model, `coco` = YOLOv8n |
| `YOLO_CONF` | `0.25` | YOLO detection confidence threshold |
| `REALESRGAN_SCALE` | `4` | Super-resolution upscale factor |
| `ZERO_DCE_THRESHOLD` | `80` | Brightness threshold for Zero-DCE |
| `MAX_IMAGE_SIZE_MB` | `20` | Max image size at AI service layer |

---

## Known Limitations

- **Very small plates** (< 30px height in original) may not be detected by YOLO
- **Heavily occluded or angled plates** may produce partial OCR
- **Real-ESRGAN on CPU** is slow (~5–20s per plate); GPU strongly recommended for production
- **PaddleOCR** is trained on English; Devanagari regional script on plates is not supported
- **Zero-DCE** requires PyTorch and downloaded weights to activate
- Batch analysis processes images **sequentially** (not in parallel) to avoid server memory exhaustion

---

## Security

- File type validated by both MIME type and extension at Express + FastAPI layers
- Max file size enforced at both layers (50 MB Express, 20 MB FastAPI)
- Temporary processing files cleaned up automatically after each request
- No user-supplied filenames used internally (UUID-based temp paths)
- `.env` files containing secrets are excluded from git via `.gitignore`
- Model weight files (large binary blobs) excluded from git

---

## Contributing

This module is part of the **DrishtiGrid** platform. To contribute:

1. Clone the repo and check out the `ANPR` branch
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes, add tests if applicable
4. Open a Pull Request targeting the `ANPR` branch

---

*Built with ❤️ for smart city surveillance — DrishtiGrid ANPR Module*
