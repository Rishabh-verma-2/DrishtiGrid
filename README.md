# ANPR — AI Number Plate Analyzer

A standalone, production-quality AI module for **Indian license plate detection, image enhancement, and OCR** from a single uploaded image.

---

## Architecture

```
Browser (React + Vite)
        │  POST /api/ai/analyze-image (multipart)
        ▼
Node.js Express Backend   (:5000)
        │  POST /process (multipart → Python)
        ▼
Python FastAPI AI Service (:8000)
        │
        ├── YOLOv8  — detect all plates
        ├── OpenCV  — preprocess crops
        ├── Zero-DCE — low-light enhancement
        ├── CLAHE   — local contrast
        ├── Real-ESRGAN — super-resolution
        ├── PaddleOCR — text extraction
        └── Indian plate validation
```

---

## Quick Start

### 1. Python AI Service

```bash
cd ai-service

# Create virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Download model weights
python download_models.py

# Start the service
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 2. Node.js Backend

```bash
cd backend

# Copy environment file
copy .env.example .env

# Install dependencies (already done if you followed setup)
npm install

# Start
npm run dev
```

### 3. React Frontend

```bash
cd frontend

npm install
npm run dev

# Opens at http://localhost:3000
```

---

## Model Weights

| Model | Purpose | Download |
|---|---|---|
| `yolov8n.pt` | Generic vehicle detection (fallback) | Auto-downloaded by `download_models.py` |
| `license_plate_detector.pt` | Dedicated LP detection (recommended) | Manual — see note below |
| `zero_dce.pth` | Low-light enhancement | `python download_models.py --model zero_dce` |
| `RealESRGAN_x4plus.pth` | Super-resolution | `python download_models.py --model realesrgan` |

> **Dedicated LP model (recommended):**
> Download a YOLOv8 license plate checkpoint from
> [Roboflow Universe](https://universe.roboflow.com/) or
> [GitHub](https://github.com/Muhammad-Zafar-Khan/License-Plate-Detector).
> Save as `ai-service/model_weights/license_plate_detector.pt` and set
> `YOLO_MODEL_PREFERENCE=lp` in your environment.

---

## GPU Requirements

- GPU: NVIDIA GPU with CUDA 11.8+ (recommended for Real-ESRGAN performance)
- CPU: Fully supported — Real-ESRGAN will take 5–20s per plate on CPU

```bash
# Force CPU mode
set USE_GPU=false     # Windows
export USE_GPU=false  # Linux/macOS
```

---

## Environment Variables (AI Service)

| Variable | Default | Description |
|---|---|---|
| `USE_GPU` | `true` | Enable GPU acceleration |
| `YOLO_MODEL_PREFERENCE` | `lp` | `lp` = dedicated LP model, `coco` = YOLOv8n |
| `YOLO_CONF` | `0.25` | Detection confidence threshold |
| `REALESRGAN_SCALE` | `4` | Super-resolution scale (2 or 4) |
| `ZERO_DCE_THRESHOLD` | `80` | Brightness below which Zero-DCE activates |
| `FORCE_FULL_PIPELINE` | `false` | Always run all enhancement stages |
| `MAX_IMAGE_SIZE_MB` | `20` | Max upload size in MB |
| `TEMP_RETENTION_SEC` | `3600` | Temp file retention period |

---

## API Endpoint

### `POST /api/ai/analyze-image`

**Request:** `multipart/form-data`
- `image` — image file (JPG/JPEG/PNG, max 20 MB)

**Response:**
```json
{
  "success": true,
  "total_plates_detected": 2,
  "original_image": "data:image/jpeg;base64,...",
  "processed_image": "data:image/jpeg;base64,...",
  "plates": [
    {
      "plate_id": 1,
      "bbox": { "x": 240, "y": 310, "width": 120, "height": 40 },
      "original_crop": "data:image/jpeg;base64,...",
      "enhanced_crop": "data:image/jpeg;base64,...",
      "raw_ocr": "GJ 01 AB 1234",
      "normalized_plate": "GJ01AB1234",
      "detection_confidence": 0.94,
      "ocr_confidence": 0.962,
      "overall_confidence": 0.951,
      "validation_status": "VALID_FORMAT",
      "validation_note": "Standard plate, state: GJ",
      "processing_status": "SUCCESS",
      "stages_applied": ["opencv_preprocess", "zero_dce", "clahe", "bicubic_upscale", "paddleocr"],
      "timings": { "preprocess": 0.02, "zero_dce": 0.15, "clahe": 0.01, "super_resolution": 2.1, "ocr": 0.3 }
    }
  ],
  "timings": { "detection": 0.8, "plate_processing": 2.5, "total": 3.3 }
}
```

---

## Pipeline Stages

```
1. Image Validation       — MIME type, size, integrity
2. YOLO Detection         — All plates detected simultaneously
3. Plate Cropping         — Safe crop with padding per plate
4. OpenCV Preprocessing   — Adaptive denoising + sharpening
5. Zero-DCE               — Only for dark plates (brightness < threshold)
6. CLAHE                  — Only for low-contrast plates
7. Real-ESRGAN            — x4 super-resolution (bicubic fallback)
8. PaddleOCR              — Text extraction with confidence
9. Indian Plate Validation — Normalization + format classification
10. Result Aggregation    — Per-plate JSON + annotated image
```

---

## Model Configuration

All model paths and parameters are centralized in:
`ai-service/app/config/settings.py`

Do not hardcode paths elsewhere.

---

## Running Tests

```bash
cd ai-service
pytest tests/ -v
```

Tests cover:
- Image utility functions
- OpenCV preprocessing
- CLAHE enhancement
- Indian plate validation (all format variants)
- Pipeline integration (with mocked YOLO/OCR)

---

## Known Limitations

> ⚠️ **AI enhancement cannot reliably reconstruct characters that contain
> insufficient information in the original image.**
> Super-resolution and enhancement improve clarity but cannot recover
> plate text that is genuinely absent or illegible in the source image.

- Very small plates (<30px height in original) may not be detected
- Heavily occluded plates may produce incorrect OCR
- PaddleOCR is English-trained; Devanagari/regional scripts on plates may not be recognized
- Real-ESRGAN on CPU is slow (~5–20s per plate crop)
- Zero-DCE requires PyTorch and the pretrained weights file

---

## Security

- File type validated by MIME type + extension (backend + AI service)
- Max file size enforced at both layers
- Temporary files cleaned up after each session
- No arbitrary file execution
- All filenames are safe (UUID-based internally)

---

## Project Structure

```
ANPR/
├── frontend/          React + Vite UI
├── backend/           Node.js Express proxy
├── ai-service/        Python FastAPI AI engine
│   ├── app/
│   │   ├── config/        Centralized config
│   │   ├── detection/     YOLO detector
│   │   ├── preprocessing/ OpenCV preprocessing
│   │   ├── enhancement/   Zero-DCE + CLAHE
│   │   ├── super_resolution/ Real-ESRGAN
│   │   ├── ocr/           PaddleOCR wrapper
│   │   ├── validation/    Indian plate validation
│   │   ├── pipeline/      Orchestrator
│   │   ├── utils/         Shared utilities
│   │   └── api/           FastAPI routes
│   ├── model_weights/ ML model files
│   ├── temp/          Temporary processing files
│   └── tests/         Unit + integration tests
└── README.md
```
