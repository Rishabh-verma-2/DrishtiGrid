# DrishtiGrid ANPR — End-to-End System Architecture & Workflow Specification

This document provides a comprehensive, technical reference for the complete architecture, data models, processing pipelines, video stream handling, cloud storage integrations, and operational procedures in the **DrishtiGrid Automated Number Plate Recognition (ANPR)** surveillance platform.

---

## 📑 Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Global Architecture & Service Topology](#2-global-architecture--service-topology)
3. [Dual Ingestion Workflows](#3-dual-ingestion-workflows)
   - [3.1 Multi-Image Batch Mode](#31-multi-image-batch-mode)
   - [3.2 1-FPS Asynchronous Video Stream Mode](#32-1-fps-asynchronous-video-stream-mode)
4. [AI Vision Pipeline Deep-Dive](#4-ai-vision-pipeline-deep-dive)
   - [4.1 Plate Detection & Geometry Filtering](#41-plate-detection--geometry-filtering)
   - [4.2 Visual Enhancement (Zero-DCE + CLAHE)](#42-visual-enhancement-zero-dce--clahe)
   - [4.3 Real-ESRGAN Super-Resolution](#43-real-esrgan-super-resolution)
   - [4.4 PaddleOCR & Text Extraction](#44-paddleocr--text-extraction)
   - [4.5 Indian Registration Normalization & Canonical Matching](#45-indian-registration-normalization--canonical-matching)
   - [4.6 Vehicle Attribute Detection (COCO YOLOv8 + HSV Color)](#46-vehicle-attribute-detection-coco-yolov8--hsv-color)
5. [Cloudinary Integration & Forensic Asset Lifecycle](#5-cloudinary-integration--forensic-asset-lifecycle)
6. [Data Models & Storage Architecture](#6-data-models--storage-architecture)
   - [6.1 Watchlist Records (`plate_records.json` / `PlateRecord`)](#61-watchlist-records)
   - [6.2 Video Plate Detections (`plate_detections.json` / `PlateDetection`)](#62-video-plate-detections)
   - [6.3 Security Alerts (`plate_alerts.json` / `PlateAlert`)](#63-security-alerts)
   - [6.4 Audit Trail (`audit_logs.json` / `AuditLog`)](#64-audit-trail)
7. [Post-Processing Privacy Cleanup Protocol](#7-post-processing-privacy-cleanup-protocol)
8. [Comprehensive API Reference](#8-comprehensive-api-reference)
9. [Deployment & Run Guide](#9-deployment--run-guide)

---

## 1. Executive Summary

DrishtiGrid ANPR is an institutional surveillance and automated watchlist enforcement platform. It processes vehicle captures from static cameras, multi-image surveillance dumps, and recorded video feeds.

The platform executes real-time license plate localization, dynamic contrast enhancement, super-resolution reconstruction, deep-learning optical character recognition (OCR), vehicle attribute classification (body color and vehicle category), and canonical format normalization specifically tuned for Indian high-security registration plates (HSRP). When a plate matches an active monitored watchlist, the system instantly triggers prioritized forensic security alerts. When a detected plate does not match any watchlist record, automated post-processing triggers privacy cleanup to delete forensic image crops from cloud storage while retaining statistical detection logs.

---

## 2. Global Architecture & Service Topology

The system operates across three coordinated tiers and external cloud infrastructure:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT PRESENTATION TIER                             │
│                         React 18 + Vite (Port 3000)                              │
│                                                                                  │
│   ┌─────────────────────┐  ┌──────────────────────┐  ┌────────────────────────┐ │
│   │ Multi-Image Batch   │  │ 1-FPS Video Stream   │  │ Watchlist & Security   │ │
│   │ Inspection View     │  │ Surveillance Monitor │  │ Alert Administration   │ │
│   └──────────┬──────────┘  └──────────┬───────────┘  └───────────┬────────────┘ │
└──────────────┼────────────────────────┼──────────────────────────┼───────────────┘
               │ HTTP Proxy             │ HTTP / Multipart         │ REST
               ▼                        ▼                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             BACKEND COORDINATION TIER                            │
│                       Node.js + Express (Port 5000)                              │
│                                                                                  │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │  Routes: /api/ai, /api/plate-records, /api/plate-alerts, /api/dashboard  │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
│   ┌──────────────────────┐  ┌─────────────────────┐  ┌───────────────────────┐   │
│   │ videoService.js      │  │ cloudinaryService.js│  │ geocodingService.js   │   │
│   │ (ffmpeg-static, 1fps)│  │ (Upload, Delete)    │  │ (Reverse Geocoding)   │   │
│   └──────────┬───────────┘  └──────────┬──────────┘  └───────────┬───────────┘   │
│              │                         │                         │               │
│              │ Multi-part Image Frame  │ Direct Stream Upload    │ HTTP          │
│              ▼                         ▼                         ▼               │
│   ┌──────────────────────┐  ┌─────────────────────┐  ┌───────────────────────┐   │
│   │ storage.js Adapter   │  │ Cloudinary CDN      │  │ Maps / Nominatim API  │   │
│   │ (JSON Flat-File      │  │ Raw Videos & Plate  │  │ Coordinate Address    │   │
│   │  / MongoDB Atlas)    │  │ Forensic Crops      │  │ Resolution            │   │
│   └──────────────────────┘  └─────────────────────┘  └───────────────────────┘   │
└──────────────┼───────────────────────────────────────────────────────────────────┘
               │ HTTP POST /process
               ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               AI INFERENCE TIER                                  │
│                         Python FastAPI (Port 8000)                               │
│                                                                                  │
│   ┌───────────────────────┐   ┌───────────────────────┐   ┌──────────────────┐   │
│   │ YOLOv8 Plate Detector │──▶│ Preprocessing (OpenCV)│──▶│ Zero-DCE Contrast│   │
│   │ (Dedicated LP Weights)│   │ Denoise & Edge Sharpen│   │ Low-Light Boost  │   │
│   └───────────────────────┘   └───────────────────────┘   └────────┬─────────┘   │
│                                                                    ▼             │
│   ┌───────────────────────┐   ┌───────────────────────┐   ┌──────────────────┐   │
│   │ Indian Plate Matcher  │◀──│ PaddleOCR Deep Engine │◀──│ Real-ESRGAN (x4) │   │
│   │ State / District Rules│   │ Text Recognition      │   │ Super-Resolution │   │
│   └──────────┬────────────┘   └───────────────────────┘   └──────────────────┘   │
│              ▼                                                                   │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │ Vehicle Attribute Detection: ultralytics YOLOv8n (COCO classes 2,3,5,7)  │   │
│   │ Bounding Box Enclosure Matching + HSV K-Means Body Color Classification  │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Dual Ingestion Workflows

### 3.1 Multi-Image Batch Mode
Ideal for batch uploading static checkpoint photographs or folder dumps:

1. **Client Ingestion**: User drops 1 to 20 image files into `MultiUploadZone.jsx`.
2. **Batch Dispatcher**: The frontend sequentially sends each image buffer to `POST /api/ai/analyze-image`.
3. **AI Execution**: Backend proxies the image to Python AI service (`POST /process`).
4. **Matching & Alerting**: Backend receives detected plates, runs canonical matching against `plate_records.json`, stores matching events in `plate_alerts.json`, and returns enriched JSON.
5. **Visual Forensic Showcase**: Results are grouped with bounding boxes, side-by-side original vs. enhanced crops, and instant watchlist popups.

### 3.2 1-FPS Asynchronous Video Stream Mode
Engineered for surveillance video feeds (MP4, MOV, MKV, AVI, WEBM):

```
User Uploads Video (+ Optional Start Time & GPS Coordinates)
                       │
                       ▼
         POST /api/ai/analyze-video
                       │
     ┌─────────────────┴─────────────────┐
     ▼                                   ▼
Upload Raw Video to Cloudinary     Generate Unique Job ID & Video ID
(Stores secure_url & public_id)    Immediately Respond 202 Accepted { jobId }
                                         │
                                         ▼
                     Background In-Process Worker Initiated
                                         │
                                         ▼
                     Extract Frames at 1 FPS via ffmpeg-static
                                         │
                  For each extracted frame (second 0, 1, 2, ...):
                     ├── Compute Wall-Clock Timestamp
                     ├── Invoke AI Service (Plate Pipeline + Vehicle Attributes)
                     ├── Upload Enhanced Plate Crop to Cloudinary
                     ├── Cross-reference against Active Watchlist
                     ├── If Match: Create Security Alert in DB
                     └── Store Row in plate_detections Store
                                         │
                                         ▼
                      Post-Processing Cleanup (Feature 5)
                     ├── For NO_MATCH: Delete crop from Cloudinary, set image_deleted = true
                     ├── For MATCH: Retain Cloudinary crop evidence
                     └── Record VIDEO_DETECTION_CLEANUP in Audit Trail
```

---

## 4. AI Vision Pipeline Deep-Dive

Every image or extracted video frame flows through an isolated, multi-stage enhancement and recognition sequence. Individual plate crop errors are isolated so one degraded plate never aborts processing.

### 4.1 Plate Detection & Geometry Filtering
- **Model**: YOLOv8 architecture fine-tuned on license plate datasets (`model_weights/license_plate_detector.pt`) with fallback to general YOLOv8.
- **Geometric Sanity Check**: Aspect ratios strictly checked between $1.5$ and $6.5$. Candidates with extreme non-plate geometry are excluded.
- **False Positive Elimination**: Plates with zero alphanumeric OCR characters, zero OCR confidence, and detection confidence $< 0.70$ are discarded (filtering out headlights, grilles, and logos).

### 4.2 Visual Enhancement (Zero-DCE + CLAHE)
- **Zero-DCE (Zero-Reference Deep Curve Estimation)**: Evaluates image brightness. If mean luminance is below threshold ($L < 90$), non-linear light-enhancement curves are applied without noise over-amplification.
- **CLAHE (Contrast Limited Adaptive Histogram Equalization)**: Equalizes luminance in the LAB/YCrCb color space to boost embossed character visibility under heavy shadows or glare.

### 4.3 Real-ESRGAN Super-Resolution
- **Model**: Real-ESRGAN x4 super-resolution network (`RealESRGAN_x4plus`).
- **Upscaling**: Quadruples plate resolution ($4\times$), reconstructing degraded edge features and font strokes on low-resolution or distant crops.

### 4.4 PaddleOCR & Text Extraction
- **Engine**: PaddleOCR angle-classification and text recognition module with optimized beam-search decoding.
- **Character Scoring**: Generates raw character sequence along with per-character and aggregated confidence scores.

### 4.5 Indian Registration Normalization & Canonical Matching
Standard Indian plates adhere to the format:
$$\text{[State Code: 2L]} \quad \text{[District Code: 2D]} \quad \text{[Series: 1--3L]} \quad \text{[Number: 1--4D]}$$

The normalization engine (`indian_plate.py` and `plateUtils.js`) executes positional character disambiguation:
- **Positions 0 & 1 (State Letters)**: Disambiguates `0` $\rightarrow$ `O`, `1` $\rightarrow$ `I`, `8` $\rightarrow$ `B`.
- **Positions 2 & 3 (District Digits)**: Disambiguates `O/Q/D` $\rightarrow$ `0`, `I/L` $\rightarrow$ `1`, `Z` $\rightarrow$ `2`, `B` $\rightarrow$ `8`, `S` $\rightarrow$ `5`.
- **Suffix Digits (Registration Number)**: Disambiguates letters back to numbers based on strict positional syntax.
- **Matching Levels**:
  - `MATCH_FOUND`: Exact normalized or canonical match against an active watchlist record.
  - `POSSIBLE_MATCH`: Levenshtein edit distance $\le 1$ against an active watchlist record.
  - `NO_MATCH`: No corresponding active watchlist record found.
  - `OCR_UNCERTAIN`: Character confidence below readable threshold.

### 4.6 Vehicle Attribute Detection (`vehicle_attributes.py`)
For every frame where a plate is detected:
1. **Vehicle Bounding Box**: Ultralytics YOLOv8 nano runs on the full frame, filtered to COCO vehicle classes:
   - `2`: Car
   - `3`: Motorcycle
   - `5`: Bus
   - `7`: Truck
2. **Association**: The vehicle bounding box containing or having highest spatial overlap with the license plate bounding box is identified.
3. **Dominant Color Extraction (`car_color`)**:
   - The vehicle body is cropped, excluding bottom 18% (tires/road) and top 25% (roof/windshield).
   - Converted to HSV space, dark shadow pixels ($V < 25$) filtered out.
   - K-Means clustering ($K=3$) isolates the dominant body pigment cluster.
   - Centroid is mapped to common names: `White`, `Black`, `Silver / Gray`, `Red`, `Blue`, `Green`, `Yellow`, `Orange`, `Brown`.
4. **Vehicle Model (`car_model`)**: Returns `null` cleanly unless an external vehicle make/model classifier is loaded, strictly avoiding fabricated predictions.

---

## 5. Cloudinary Integration & Forensic Asset Lifecycle

Cloudinary handles cloud storage of video streams and evidence crops. Configured in `backend/src/services/cloudinaryService.js`:

- **Credentials**: Configured via `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env`.
- **Video Storage**: Uploaded immediately upon video ingestion via stream:
  - Public ID: `drishtigrid/videos/{videoId}`
  - Resource Type: `video`
- **Plate Crop Storage**:
  - Public ID: `drishtigrid/{videoId}/{frameSecond}_{plateIndex}`
  - Resource Type: `image`
- **Resilience**: Methods return structured status objects (`{ url, public_id }`) wrapped in try/catch. Any upstream permission or connectivity limitation logs an error without failing the video pipeline.

---

## 6. Data Models & Storage Architecture

The platform uses a hybrid storage adapter (`storage.js`). It connects to MongoDB Atlas if reachable; otherwise it seamlessly falls back to JSON persistence in `backend/data/`.

### 6.1 Watchlist Records (`plate_records.json` / `PlateRecord`)
Maintains monitored target vehicles:
```json
{
  "id": "rec_001",
  "recordId": "PR-0001",
  "plate_number": "MH01BM4679",
  "normalized_plate_number": "MH01BM4679",
  "vehicle_make": "Honda",
  "vehicle_model": "City",
  "vehicle_color": "White",
  "category": "STOLEN_VEHICLE",
  "priority": "HIGH",
  "status": "ACTIVE",
  "description": "Reported stolen in South Mumbai"
}
```

### 6.2 Video Plate Detections (`plate_detections.json` / `PlateDetection`)
Records every license plate detected across video frames:
```json
{
  "detectionId": "DET-1788495841924-CMA3",
  "video_id": "vid_1788495839595",
  "frame_second": 12,
  "plate_number": "DL01AB1234",
  "raw_ocr": "DL-01-AB-1234",
  "timestamp": "2026-09-04T04:24:01.922Z",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "location_address": "Connaught Place, New Delhi, India",
  "cropped_image_url": "https://res.cloudinary.com/.../12_1.jpg",
  "cropped_image_public_id": "drishtigrid/vid_.../12_1",
  "source_video_url": "https://res.cloudinary.com/.../vid_....mp4",
  "car_color": "White",
  "car_model": null,
  "detection_confidence": 0.94,
  "ocr_confidence": 0.92,
  "overall_confidence": 0.93,
  "match_status": "MATCH_FOUND",
  "matched_record": { ... },
  "image_deleted": false
}
```

### 6.3 Security Alerts (`plate_alerts.json` / `PlateAlert`)
Stores high-priority alerts generated when a detected plate matches an active record:
```json
{
  "alertId": "ALT-0001",
  "plate_record_id": "rec_001",
  "plate_record_ref": "PR-0001",
  "category": "STOLEN_VEHICLE",
  "detected_plate_number": "MH01BM4679",
  "priority": "HIGH",
  "status": "NEW",
  "source_image_name": "video_vid_123_sec_12.jpg",
  "enhanced_crop": "https://res.cloudinary.com/...",
  "detected_at": "2026-09-04T04:24:01.922Z"
}
```

### 6.4 Audit Trail (`audit_logs.json` / `AuditLog`)
Maintains an immutable record of administrative actions and automated cleanup operations:
```json
{
  "id": "aud_1788495865835_u1z26",
  "action": "VIDEO_DETECTION_CLEANUP",
  "entity_type": "VIDEO",
  "entity_id": "vid_1788495839595",
  "details": {
    "video_id": "vid_1788495839595",
    "total_detections": 15,
    "deleted_images": 14,
    "retained_images": 1
  },
  "timestamp": "2026-09-04T04:24:25.835Z"
}
```

---

## 7. Post-Processing Privacy Cleanup Protocol

To comply with data privacy standards and cloud storage governance, DrishtiGrid implements automated post-processing cleanup at the completion of each video analysis job:

1. **NO_MATCH Evaluation**: Every plate occurrence with `match_status === "NO_MATCH"` is targeted.
2. **Cloud Deletion**: `cloudinaryService.deleteAsset(cropped_image_public_id, "image")` purges the plate crop image from Cloudinary servers.
3. **Record Sanitization**: In `plate_detections.json`, `cropped_image_url` is set to `null` and `image_deleted` is flagged `true`.
4. **Metadata Preservation**: All tabular metadata (plate number, frame second, timestamp, GPS coordinates, address, vehicle color, confidence scores) is preserved for statistical traffic analysis.
5. **Match Retention**: Any occurrence with `MATCH_FOUND` or `POSSIBLE_MATCH` retains its Cloudinary image as evidence.
6. **Audit Registration**: Logs the exact count of deleted vs. retained crops in the audit log under `VIDEO_DETECTION_CLEANUP`.

---

## 8. Comprehensive API Reference

### AI & Video Analysis Endpoints
| Method | Route | Description |
|---|---|---|
| `POST` | `/api/ai/analyze-image` | Upload single image (`image` file) for synchronous ANPR & matching. |
| `POST` | `/api/ai/analyze-batch` | Upload multiple images (up to 20) for batch ANPR & matching. |
| `POST` | `/api/ai/analyze-video` | Upload video (`video` file, optional `recorded_at`, `latitude`, `longitude`). Asynchronous. |
| `GET` | `/api/ai/video-job/:jobId` | Poll real-time progress, processed frames, and counts for a video job. |
| `GET` | `/api/ai/video-detections/:videoId` | Retrieve all persistent detection events recorded for a given video. |

### Watchlist & Alerts Endpoints
| Method | Route | Description |
|---|---|---|
| `GET` | `/api/plate-records` | List watchlist records with optional search, status, category, priority filters. |
| `POST` | `/api/plate-records` | Register a new monitored vehicle record. |
| `PUT` | `/api/plate-records/:id` | Update an existing monitored vehicle record. |
| `DELETE` | `/api/plate-records/:id` | Soft-deactivate or delete a monitored vehicle record. |
| `GET` | `/api/plate-alerts` | List generated security alerts with status and priority filtering. |
| `PATCH` | `/api/plate-alerts/:id/status` | Update alert state (`NEW` $\rightarrow$ `ACKNOWLEDGED` $\rightarrow$ `RESOLVED`). |
| `GET` | `/api/dashboard/stats` | Aggregate dashboard metrics (active records, alerts today, recent events). |
| `GET` | `/api/dashboard/audit-logs` | Retrieve recent administrative and automated audit trail entries. |

---

## 9. Deployment & Run Guide

### Prerequisites
- **Node.js**: v18+ (tested on v24.14)
- **Python**: 3.10+ (tested in `ai-service/.venv`)
- **System Memory**: 8 GB+ RAM recommended for Real-ESRGAN / YOLO inference

### Environment Variables Setup (`backend/.env`)
```env
PORT=5000
AI_SERVICE_URL=http://localhost:8000
MAX_FILE_SIZE_MB=20
MAX_VIDEO_SIZE_MB=150
NODE_ENV=development

# MongoDB Atlas (Optional — falls back to backend/data/ JSON files if unreachable)
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/drishtigrid?retryWrites=true&w=majority

# Cloudinary CDN Configuration
CLOUDINARY_CLOUD_NAME=qyh6yqnc
CLOUDINARY_API_KEY=316587485123924
CLOUDINARY_API_SECRET=uIPGJAsCvjRxJaAHTrVAXgj9XU8

# Optional Reverse Geocoding API Key (Google Maps API)
GEOCODING_API_KEY=
```

### Launch Commands

```bash
# 1. Start AI Inference Service (FastAPI)
cd ai-service
.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Start Backend Proxy & Processing Coordinator (Express)
cd backend
npm run dev

# 3. Start Web Dashboard (React + Vite)
cd frontend
npm run dev
```

The web dashboard is available at **`http://localhost:3000`**.
To inspect video analysis, navigate to **Plate Verification** and switch to **`📹 1-FPS Video Stream Analysis`**.
