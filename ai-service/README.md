# 🔍 DrishtiGrid — ANPR AI Microservice

> **Automatic Number Plate Recognition (ANPR) & Optical Character Recognition (OCR) Engine**  
> Tailored for Indian vehicle registration formats, low-light night conditions, and distant surveillance camera captures.

---

## 📋 Table of Contents
- [Overview](#overview)
- [Architecture & Processing Pipeline](#architecture--processing-pipeline)
- [AI Models & Pretrained Weights](#ai-models--pretrained-weights)
- [Indian Plate Normalization & Disambiguation](#indian-plate-normalization--disambiguation)
- [Installation & Setup](#installation--setup)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Performance & Hardware Guidelines](#performance--hardware-guidelines)

---

## 🎯 Overview

The **ANPR AI Microservice** is a high-performance Python FastAPI service within the **DrishtiGrid** ecosystem. It provides automated detection, neural enhancement, super-resolution upscaling, and OCR reading of license plates from CCTV snapshots and field uploads.

It communicates with the DrishtiGrid Node.js backend over HTTP/REST on port `8000`, returning detected plates, bounding boxes, forensic image crops, confidence metrics, and processing timings.

---

## 🏗️ Architecture & Processing Pipeline

```
                       Uploaded Image (JPEG / PNG / WebP)
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Ingestion & Integrity Validation (MIME check, OpenCV BGR decode)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 2: YOLOv8 License Plate Detection                                     │
│  - Model: license_plate_detector.pt (or yolov8n.pt fallback)                 │
│  - Filters: 1.15 ≤ aspect-ratio (w/h) ≤ 7.0; min width ≥ 28px               │
│  - Output: List of (x, y, w, h, confidence) bounding boxes                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                         (For each detected plate crop)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 3: OpenCV Preprocessing                                               │
│  - 8% safe padding crop around bounding box                                 │
│  - Adaptive Gaussian denoising & unsharp mask sharpening                    │
│  - Height normalization to 64px while preserving aspect ratio                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Neural Enhancement & Super-Resolution                              │
│  - Zero-DCE (Zero-Reference Deep Curve Estimation) for night/dark frames    │
│  - CLAHE (Contrast Limited Adaptive Histogram Equalization)                 │
│  - Real-ESRGAN x4plus (4x neural super-resolution for distant plates)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 5: PaddleOCR & Indian Plate Validation                                │
│  - Deep text extraction (PaddleOCR English recognition engine)              │
│  - Syntax validation (Standard, Bharat Stage BH, EV series, Old format)     │
│  - Canonical character repair (O ↔ 0, I ↔ 1, Z ↔ 2, B ↔ 8, S ↔ 5)          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
             Aggregated JSON Response (Base64 Crops, Plates, Timings)
```

---

## 🧠 AI Models & Pretrained Weights

Model weight files are stored in `ai-service/model_weights/` (gitignored). You can download them automatically using the included downloader:

```bash
python download_models.py
```

| Model | Weights File | Size | Purpose |
|---|---|---|---|
| **YOLOv8 License Plate** | `license_plate_detector.pt` | ~6 MB | Single-class detector trained specifically on vehicle plates |
| **YOLOv8n (Fallback)** | `yolov8n.pt` | ~6 MB | General vehicle detector fallback |
| **Zero-DCE** | `zero_dce.pth` | ~0.3 MB | Real-time low-light illumination curve enhancer |
| **Real-ESRGAN x4plus** | `RealESRGAN_x4plus.pth` | ~67 MB | 4x super-resolution upscaler for distant/low-res plates |
| **PaddleOCR** | Auto-downloaded | ~15 MB | Text line detector and recognition network |

---

## 🇮🇳 Indian Plate Normalization & Disambiguation

Indian vehicle license plates adhere to a strict alphanumeric pattern:
```
[State Code 2L] [District Code 2D] [Series 1-3L] [Number 1-4D]
Example: GJ 01 BM 4679  →  Normalized: GJ01BM4679
```

Because OCR models often confuse visually similar characters in grainy CCTV footage, our pipeline applies **positional canonical disambiguation**:
- **Positions 0–1 (State Code):** Must be letters (`0` $\rightarrow$ `O`, `1` $\rightarrow$ `I`, `8` $\rightarrow$ `B`). Validates against all 36 Indian state & UT codes (`GJ`, `DL`, `MH`, `RJ`, etc.).
- **Positions 2–3 (District Code):** Must be digits (`O`/`Q`/`D` $\rightarrow$ `0`, `I`/`L` $\rightarrow$ `1`, `Z` $\rightarrow$ `2`, `B` $\rightarrow$ `8`, `S` $\rightarrow$ `5`).
- **Last 4 Positions (Registration Number):** Must be digits (`O`/`Q`/`D` $\rightarrow$ `0`, `I`/`L` $\rightarrow$ `1`, `Z` $\rightarrow$ `2`, `B` $\rightarrow$ `8`, `S` $\rightarrow$ `5`).
- **Special Series Support:** Includes regex support for **Bharat Series (BH)** (`23BH1234AA`), **Electric Vehicles (EV)** (`GJ01AB1234E`), and older legacy formats.

---

## ⚙️ Installation & Setup

### Prerequisites
- Python **3.10, 3.11, or 3.12** (64-bit)
- Optional: NVIDIA CUDA GPU with CUDA 11.8+ or 12.1+ for real-time super-resolution

### 1. Automated Setup (Windows)
From the DrishtiGrid project root, run:
```cmd
setup-anpr.bat
```
*(or `.\setup-anpr.ps1` in PowerShell)*

### 2. Manual Setup
```bash
cd ai-service

# Create and activate virtual environment
python -m venv venv

# Windows:
call venv\Scripts\activate.bat
# Linux/macOS:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Download model weights
python download_models.py
```

### 3. Launching the Microservice
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Health check endpoint: **`http://localhost:8000/health`**

---

## 📡 API Reference

### Health Check
```http
GET /health
```
**Response:**
```json
{
  "status": "ok",
  "service": "ANPR AI Service"
}
```

### Process Image
```http
POST /process
Content-Type: multipart/form-data

Field: image (File — JPG, PNG, or WebP, max 20 MB)
```

**Sample Response:**
```json
{
  "success": true,
  "total_plates_detected": 1,
  "original_image": "<base64_jpeg>",
  "processed_image": "<base64_jpeg_with_boxes>",
  "plates": [
    {
      "plate_id": 1,
      "bbox": { "x": 240, "y": 310, "width": 120, "height": 40 },
      "original_crop": "<base64_jpeg>",
      "enhanced_crop": "<base64_jpeg>",
      "raw_ocr": "GJ 01 BM 4679",
      "normalized_plate": "GJ01BM4679",
      "detection_confidence": 0.942,
      "ocr_confidence": 0.968,
      "overall_confidence": 0.955,
      "validation_status": "VALID_FORMAT",
      "validation_note": "Standard Gujarat State Plate",
      "stages_applied": ["opencv_preprocess", "zero_dce", "clahe", "realesrgan", "paddleocr"],
      "timings": {
        "detection_ms": 32.5,
        "enhancement_ms": 110.2,
        "ocr_ms": 48.1,
        "total_ms": 190.8
      }
    }
  ],
  "timings": {
    "total_pipeline_ms": 215.4
  }
}
```

---

## 🔧 Configuration

Settings are managed in `app/config/settings.py` and can be overridden via environment variables:

| Variable | Default | Description |
|---|---|---|
| `AI_SERVICE_HOST` | `0.0.0.0` | Bind host address |
| `AI_SERVICE_PORT` | `8000` | Bind port |
| `USE_GPU` | `true` | Enable CUDA GPU acceleration (falls back to CPU if unavailable) |
| `YOLO_CONF` | `0.25` | YOLO plate detection confidence threshold |
| `YOLO_MODEL_PREFERENCE` | `lp` | `lp` for dedicated plate detector, `coco` for general YOLOv8n |
| `REALESRGAN_SCALE` | `4` | Super-resolution upscaling factor |
| `ZERO_DCE_THRESHOLD` | `80` | Average luminance threshold (0–255) to trigger low-light enhancement |
| `MAX_IMAGE_SIZE_BYTES` | `20971520` | Max file upload limit (20 MB) |

---

## ⚡ Performance & Hardware Guidelines

- **GPU Acceleration (Recommended):** With an NVIDIA RTX 3060 / 4060 or better, full 5-stage inference takes **~120–250 ms** per plate crop.
- **CPU Mode:** On modern multi-core x86_64 CPUs, Real-ESRGAN upscaling operates via bicubic fallback if needed, running inference in **~1.2–3.0 seconds**.
- **Resilience:** If the Python microservice is offline, the DrishtiGrid Node.js backend automatically runs in **intelligent fallback simulation mode**, ensuring no downtime for operators.
