# 🏛️ DrishtiGrid (દ્રષ્ટિગ્રીડ)
### *Gujarat State CCTV Surveillance, Geospatial GIS Command & AI-Powered Video Intelligence Platform*

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933.svg?logo=node.js)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB.svg?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38BDF8.svg?logo=tailwindcss)](https://tailwindcss.com)
[![WebRTC](https://img.shields.io/badge/Streaming-WebRTC%20%7C%20WHEP%20%7C%20HLS-FF6B00.svg)](https://webrtc.org)
[![Leaflet](https://img.shields.io/badge/GIS-Leaflet%20%7C%20OpenStreetMap-199900.svg?logo=leaflet)](https://leafletjs.com)
[![License](https://img.shields.io/badge/License-Government%20Internal%20Use-red.svg)](#)

---

## 📋 Table of Contents
1. [Executive Summary](#-executive-summary)
2. [Platform Architecture](#-platform-architecture)
3. [Key Modules & Capabilities](#-key-modules--capabilities)
   - [1. 🎥 Zero-DB Live Camera Monitoring](#1--zero-db-live-camera-monitoring)
   - [2. 🗺️ Gujarat GIS Spatial Command Map](#2-️-gujarat-gis-spatial-command-map)
   - [3. 🚔 ANPR & AI Vehicle Surveillance Engine](#3--anpr--ai-vehicle-surveillance-engine)
   - [4. 📼 1-FPS Video Surveillance & Temporal Tracking](#4--1-fps-video-surveillance--temporal-tracking)
   - [5. 🚨 Gujarat Police ICCC Tactical Intercept Modal](#5--gujarat-police-iccc-tactical-intercept-modal)
   - [6. 🔍 Intelligence Explorer & Persistent Registry](#6--intelligence-explorer--persistent-registry)
   - [7. 🎫 Secure Footage Ticketing & Cryptographic Evidence Chain](#7--secure-footage-ticketing--cryptographic-evidence-chain)
   - [8. 👥 3-Role Government RBAC & Security](#8--3-role-government-rbac--security)
   - [9. 🔔 Real-Time Notification & Alert Dispatch](#9--real-time-notification--alert-dispatch)
4. [Project Directory Structure](#-project-directory-structure)
5. [Quick Start Guide (One-Click Setup & Launch)](#-quick-start-guide)
6. [API Reference Overview](#-api-reference-overview)
7. [Environment Variables](#-environment-variables)
8. [Hackathon Evaluation & Compliance Highlights](#-hackathon-evaluation--compliance-highlights)

---

## 🏛️ Executive Summary

**DrishtiGrid** is an enterprise Command & Control (C2) situational awareness and video intelligence platform engineered for the **Government of Gujarat Home Department**, State Police Headquarters, and Municipal Smart City Operations Centers (Netram ICCC).

The platform unifies live CCTV video streaming, geospatial GIS telemetry, cryptographic evidence preservation, and **state-of-the-art Automatic Number Plate Recognition (ANPR)** with temporal vehicle tracking into a single, cohesive, bilingual (English/Gujarati) dashboard supporting authentic state portal themes in both Light and Dark modes.

---

## 🏗️ Platform Architecture

```
                                  ┌──────────────────────────────────────────────┐
                                  │      Gujarat Surveillance Camera Network     │
                                  │   (Ahmedabad, Surat, Gandhinagar, Rajkot...)  │
                                  └──────────────────────┬───────────────────────┘
                                                         │ Media Ingest (RTSP / RTMP / MP4)
                                                         ▼
                                  ┌──────────────────────────────────────────────┐
                                  │           MediaMTX Streaming Gateway         │
                                  │       Host: 103.250.160.189 / corp8.cloud    │
                                  └──────────────┬───────────────┬───────────────┘
                                                 │               │
                        RTSP (Port 8554)         │               │  WebRTC WHEP (Port 8889)
                   ┌─────────────────────────────┘               └─────────────────────────────┐
                   ▼                                                                           ▼
      ┌───────────────────────────┐                                               ┌───────────────────────────┐
      │   Python AI Microservice  │                                               │   DrishtiGrid Web Client  │
      │   (:8000) FastAPI         │                                               │   React 19 + Tailwind v4  │
      │   - YOLOv8 Detection      │                                               └─────────────┬─────────────┘
      │   - Zero-DCE Enhancement  │                                                             │
      │   - PaddleOCR Extraction  │                                                             │
      │   - Vehicle Attributes    │                                                             │
      └─────────────┬─────────────┘                                                             │
                    │  Inference Telemetry                                                      │
                    ▼                                                                           │
      ┌───────────────────────────┐                                                             │
      │    Node.js Server API     │◄─────────────────── Socket.IO & REST ───────────────────────┤
      │    (:5001) Express 5      │                                                             │
      │  - 1-FPS Video Pipeline   │                                               - GIS Tactical Map (Leaflet)
      │  - Temporal Deduplication │                                               - Live Video Monitoring
      │  - Watchlist Cross-Match  │                                               - Multi-Image ANPR Scanner
      │  - HTTP 206 Streamer      │                                               - 1-FPS Video Surveillance
      │  - 3-Role RBAC & JWT      │                                               - Netram ICCC Intercept HUD
      └─────────────┬─────────────┘                                               - Intelligence Explorer
                    │                                                             - Footage Chain of Custody
                    ▼
      ┌───────────────────────────┐         ┌───────────────────────────┐
      │       MongoDB Atlas       │         │    File System Storage    │
      │   - Watchlist Hotlists    │         │  - storage_data/*.json    │
      │   - PlateDetections       │         │  - storage_data/*.txt     │
      │   - StoredPlates Registry │         │  - Local Stream Cache     │
      │   - Cryptographic Audit   │         └───────────────────────────┘
      └───────────────────────────┘
```

---

## ⚡ Key Modules & Capabilities

### 1. 🎥 Zero-DB Live Camera Monitoring
- **Direct WebRTC (WHEP) Preview:** Real-time sub-500ms video directly from MediaMTX gateway (`http://103.250.160.189:8889/stream/camXX/whep`).
- **HLS CDN Fallback:** Powered by `hls.js` (`https://cctv.corp8.cloud/camXX/index.m3u8`).
- **Bandwidth Conservation:** Standby preview tiles consume 0 KB/s until activated by an operator.
- **Multi-Layout Switcher:** Grid (30 feeds), Quad (2x2), Matrix (3x3), and Theater/Spotlight mode.
- **PTZ Simulation & HUD:** Pan, tilt, digital zoom reticle, and watermarked PNG frame capture.

### 2. 🗺️ Gujarat GIS Spatial Command Map
- Interactive geospatial map built on **Leaflet** & **OpenStreetMap** with camera clustering (`leaflet.markercluster`).
- Covers all major Gujarat districts: Ahmedabad, Gandhinagar, Surat, Vadodara, Rajkot, Bhavnagar, Jamnagar, Junagadh, Anand, Bharuch, Mehsana, Kutch, and more.
- Real-time unit distribution, live camera density heatmap, and click-to-inspect feeds.

### 3. 🚔 ANPR & AI Vehicle Surveillance Engine
- **Multi-Stage Deep Learning Pipeline:**
  1. **YOLOv8 Plate Detection:** Detects license plate bounding boxes with high precision across complex urban scenes.
  2. **Zero-DCE Neural Enhancement:** Dynamic low-light enhancement for dark, nighttime, or under-illuminated surveillance footage.
  3. **PaddleOCR Engine:** Extracts alphanumeric characters with Indian registration layout validation.
  4. **Vehicle Attribute Classifier:** Detects vehicle color (White, Silver, Black, Red, Blue, etc.), vehicle category (car, bus, truck, motorcycle), and confidence metrics.
- **Indian Plate Canonical Disambiguation:** Disambiguates OCR confusion based on positional syntax (`[State 2L][District 2D][Series 1-3L][Number 4D]`), automatically resolving `O/0`, `I/1`, `Z/2`, `B/8`, and `S/5`. Supports Bharat Series (`BH`), Electric Vehicles (`EV`), and standard formats.
- **Sequential Multi-Image Scanner:** Upload up to 10 vehicle images; processed sequentially with real-time UI previews. Includes **Annotated**, **Raw Frame**, and **Side-by-Side** views with an interactive modal zoom (70% - 250%).
- **Hotlist & Watchlist Cross-Referencing:** Instant matching against database records categorized by `STOLEN`, `WANTED`, `SUSPECT`, `VIP`, and `BLACKLISTED`.

### 4. 📼 1-FPS Video Surveillance & Temporal Tracking
- **Automated 1-FPS Sampling:** Samples video footage frame-by-frame using FFmpeg for optimal throughput without server overload.
- **Temporal Vehicle Deduplication (30s Window):** Deduplicates vehicle sightings across frames, tracking a vehicle from entry to exit with `first_seen_second`, `last_seen_second`, and `occurrence_count`.
- **Consensus Vehicle Color:** Aggregates attribute predictions across all frames to determine the vehicle's true consensus color.
- **HTTP 206 Partial Content Video Streaming:** Native HTML5 scrubber video player powered by custom byte-range HTTP 206 streaming (`/api/anpr/video/stream/:videoId`).
- **Real-Time Progress:** Emits WebSocket progress updates (`video:progress`, `video:completed`) with frame-by-frame telemetry.

### 5. 🚨 Gujarat Police ICCC Tactical Intercept Modal
- **Law Enforcement Authenticity:** Designed following Gujarat Police Netram ICCC Gandhinagar and State Emergency Operation Centre (SEOC) operational guidelines.
- **Statutory Offense Citations:** Maps violations to legal codes (Bharatiya Nyaya Sanhita / Indian Penal Code / Motor Vehicles Act, 1988).
- **Side-by-Side Exhibit Verification:** High-resolution optical plate crops, vehicle consensus color badges, and confidence meters.
- **Immediate Tactical Dispatch:** One-click intercept unit deployment, VHF/SMS broadcast, barricade checkpoint activation, and automated e-challan generation.

### 6. 🔍 Intelligence Explorer & Persistent Registry
- **Dual Storage Architecture:** All detected plates are stored simultaneously in MongoDB (`platedetections`, `storedplates`) and backed up to clean local files (`storage_data/stored_number_plates.json` and `.txt`).
- **Interactive Query Engine:** Filter historical detections by plate number, vehicle color, source type (Image / Video), and watchlist match status.
- **Database Maintenance & Purge:** Added `DELETE /api/anpr/incidents` endpoint and a 1-click **"Clear Incidents"** button on the UI to reset detection logs to a fresh state while preserving monitored watchlist records.

### 7. 🎫 Secure Footage Ticketing & Cryptographic Evidence Chain
- Official workflow for law enforcement requesting locked CCTV footage segments.
- **AES-256-GCM** encryption for stored evidence assets.
- **SHA-256 Cryptographic Hash Sealing:** Every uploaded evidence file receives an immutable SHA-256 integrity digest stored in the database.
- One-click **Cryptographic Verification**: Re-hashes the file and verifies bit-for-bit authenticity to prevent evidence tampering in court.

### 8. 👥 3-Role Government RBAC & Security
- **Strict Role-Based Access Control:**
  - `ADMIN`: Full system administration, camera management, user provisioning, system health, and audit logs.
  - `POLICE`: Live monitoring, GIS maps, footage requests, ANPR scanner, hotlist management, and alert triage.
  - `TRAFFIC_POLICE`: Traffic surveillance, ANPR plate tracking, speed/violation alerts, and live monitoring.
- **JWT Authentication:** Dual-token mechanism with rotating short-lived Access Tokens and HttpOnly Refresh Tokens.
- **Immutable Audit Trail:** Logs all user actions, logins, ticket responses, and batch ANPR scans.

### 9. 🔔 Real-Time Notification & Alert Dispatch
- Real-time push via **Socket.IO** (`alert:new`, `anpr:match`, `anpr:cleared`, `notification:new`, `camera:status`).
- Audio-visual alert toasts and top-bar Notification Center with unread counters.

---

## 📂 Project Directory Structure

```
DrishtiGrid/
├── ai-service/                       # Python FastAPI AI Microservice (:8000)
│   ├── app/
│   │   ├── api/routes.py             # /health, /process, /ocr endpoints
│   │   ├── config/settings.py        # Model thresholds, GPU flags
│   │   ├── detection/
│   │   │   ├── yolo_detector.py      # YOLOv8 plate detector
│   │   │   └── vehicle_attributes.py # Vehicle color & type classification
│   │   ├── enhancement/              # CLAHE & Zero-DCE neural low-light
│   │   ├── ocr/paddle_ocr.py         # PaddleOCR extraction
│   │   ├── pipeline/plate_pipeline.py # Orchestrated multi-stage pipeline
│   │   ├── super_resolution/         # Real-ESRGAN upscaler
│   │   └── validation/indian_plate.py # Indian regex & character repair
│   ├── download_models.py            # AI model weight downloader
│   ├── requirements.txt              # PyTorch, Ultralytics, PaddleOCR specs
│   └── README.md                     # Dedicated AI microservice docs
│
├── client/                           # React 19 Frontend (Vite + Tailwind v4) (:5173)
│   ├── src/
│   │   ├── api/index.js              # Centralized API client (auth, cameras, anpr, alerts)
│   │   ├── components/
│   │   │   ├── anpr/
│   │   │   │   ├── MatchAlertModal.jsx      # Gujarat Police ICCC tactical intercept modal
│   │   │   │   ├── WatchlistModal.jsx       # Add/Edit hotlist records
│   │   │   │   ├── VideoUploadZone.jsx      # Video drag-and-drop & progress HUD
│   │   │   │   ├── VideoAnalysisResults.jsx # Scrubber player & vehicle timeline cards
│   │   │   │   └── DetectionsExplorer.jsx   # Filterable sighting registry
│   │   │   ├── cameras/              # CameraPlayer.jsx, CameraStreamModal.jsx
│   │   │   ├── layout/               # DashboardLayout.jsx (Bilingual Gov Navigation)
│   │   │   └── notifications/        # NotificationCenter.jsx
│   │   ├── pages/
│   │   │   ├── ANPRPage.jsx          # ANPR 5-Tab Command Center
│   │   │   ├── AlertsPage.jsx        # Security alert dispatch & triage
│   │   │   ├── CameraMonitoringPage.jsx # Multi-layout live CCTV feeds
│   │   │   ├── GISMapPage.jsx        # Full-screen Gujarat Leaflet GIS
│   │   │   ├── FootageRequestsPage.jsx # Chain-of-custody ticketing
│   │   │   └── DashboardPage.jsx     # Executive telemetry
│   │   ├── store/
│   │   │   ├── authStore.js          # Authentication & token store
│   │   │   ├── anprStore.js          # Persistent batch cache & active tab state
│   │   │   └── themeStore.js         # Gujarat Gov light/dark themes
│   │   └── index.css                 # Gujarat Government theme tokens & plate pills
│   └── vite.config.js
│
├── server/                           # Node.js Express 5 Backend (:5001)
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── anprController.js     # Image batch, video pipeline, watchlist, stats, clear
│   │   │   ├── alertController.js    # Alert dispatch & triage
│   │   │   └── cameraController.js   # Camera catalog & heartbeat
│   │   ├── middleware/               # auth.js (JWT & RBAC), errorHandler.js
│   │   ├── models/
│   │   │   ├── PlateRecord.js        # Monitored watchlist definitions
│   │   │   ├── PlateDetection.js     # Timestamped sightings with frame seconds
│   │   │   ├── StoredPlate.js        # Unique vehicle registry
│   │   │   ├── Alert.js              # Native incident alerts
│   │   │   ├── Camera.js             # Camera metadata & coordinates
│   │   │   └── User.js               # Police/Admin user accounts
│   │   ├── routes/                   # anpr.js, alerts.js, cameras.js, stream.js
│   │   ├── services/
│   │   │   ├── videoService.js       # 1-FPS video pipeline & temporal deduplication
│   │   │   ├── plateStorageService.js# Local JSON/TXT + MongoDB sync
│   │   │   ├── cloudinaryService.js  # Evidence snapshot hosting (with local fallback)
│   │   │   └── cryptoService.js      # AES-256 & SHA-256 evidence sealing
│   │   ├── socket/socketHandler.js   # Real-time WebSocket broadcasting
│   │   └── utils/plateUtils.js       # Positional repair & Levenshtein matching
│   └── scripts/seed.js               # Gujarat cameras & users seeder
│
├── storage_data/                     # Local file-based plate registry backup
│   ├── stored_number_plates.json     # JSON plate export
│   └── stored_number_plates.txt      # Formatted text registry
│
├── setup-anpr.bat / setup-anpr.ps1    # Automated installer for AI venv & dependencies
├── start-all.bat / start-all.ps1      # Master 1-click launcher for all 3 services
└── README.md                         # Main platform documentation
```

---

## 🚦 Quick Start Guide

### Option A — One-Click Master Launcher (Recommended for Windows)

1. **First-Time Setup (Node dependencies):**
   ```cmd
   cd server && npm install
   cd ../client && npm install
   cd ..
   ```
2. **Launch All Services:**
   Simply double-click **`start-all.bat`** (or run `.\start-all.ps1` in PowerShell).
   - Automatically starts the **Node.js Backend** on port `5001`
   - Automatically starts the **React Web Console** on port `5173`
   - Starts the **Python AI Service** on port `8000` (if venv is configured; otherwise operates in intelligent simulation mode)
   - Opens your browser to **`http://localhost:5173`**

---

### Option B — Setting Up the Deep Learning AI Microservice

When you are ready to download model weights (~75 MB) and run the full local neural network pipeline:

```cmd
setup-anpr.bat
```
*(or run `.\setup-anpr.ps1` in PowerShell)*

This automated script:
- Creates `ai-service/venv`
- Installs PyTorch, Torchvision, Ultralytics YOLOv8, and PaddleOCR
- Executes `download_models.py` to retrieve `yolov8n.pt`, `zero_dce.pth`, and `RealESRGAN_x4plus.pth`

---

### Option C — Manual Startup (Terminal by Terminal)

**Terminal 1 — Python AI Service:**
```bash
cd ai-service
call venv\Scripts\activate.bat
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — Node.js Server:**
```bash
cd server
npm run dev
```

**Terminal 3 — React Client:**
```bash
cd client
npm run dev
```

---

## 🔑 Default Credentials

Run database seed script to populate Gujarat cameras and users:
```bash
cd server
npm run seed
```

| Role | Email | Password | Access Scope |
|---|---|---|---|
| **Super Admin** | `adminuser@gov.in` | `adminpass@123` | Full Access (Users, Health, Audits, Settings) |
| **Police Officer** | `police@gov.in` | `police123` | Monitoring, GIS, ANPR, Footage Requests |
| **Traffic Police** | `traffic@gov.in` | `traffic123` | Traffic Cameras, ANPR Hotlist, Live Feeds |

---

## 📡 API Reference Overview

### ANPR & Surveillance Endpoints
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/api/anpr/analyze` | Police, Traffic, Admin | Upload single/batch vehicle images (multipart) |
| `POST` | `/api/anpr/video/upload` | Police, Traffic, Admin | Upload surveillance video for 1-FPS sampling |
| `GET` | `/api/anpr/video/job/:jobId` | Police, Traffic, Admin | Query video analysis progress status |
| `GET` | `/api/anpr/video/detections/:videoId` | Police, Traffic, Admin | Retrieve unique vehicle tracks from video |
| `GET` | `/api/anpr/video/stream/:videoId` | Public / Stream | HTTP 206 partial content video player streaming |
| `GET` | `/api/anpr/detections` | Police, Traffic, Admin | Historical plate detections with timestamp filters |
| `GET` | `/api/anpr/stored-plates` | Police, Traffic, Admin | Persistent plate registry with color/match filters |
| `GET` | `/api/anpr/watchlist` | Police, Traffic, Admin | Query monitored vehicle hotlist |
| `POST` | `/api/anpr/watchlist` | Police, Traffic, Admin | Register target vehicle into hotlist |
| `PATCH` | `/api/anpr/watchlist/:id` | Police, Traffic, Admin | Update watchlist entry |
| `DELETE`| `/api/anpr/watchlist/:id` | Police, Traffic, Admin | Deactivate / delete watchlist entry |
| `DELETE`| `/api/anpr/incidents` | Police, Traffic, Admin | Purge incident alerts and logs for a clean run |
| `GET` | `/api/anpr/stats` | Police, Traffic, Admin | Active records, hits today, engine status |

### Surveillance & Camera Endpoints
| Method | Route | Access | Description |
|---|---|---|---|
| `GET` | `/api/cameras` | Authenticated | List all 30 Gujarat CCTV cameras |
| `GET` | `/api/stream/feeds` | Authenticated | Zero-DB WebRTC WHEP & HLS stream catalog |
| `GET` | `/api/alerts` | Authenticated | Query security alerts with severity filters |
| `POST` | `/api/alerts` | Authenticated | Create manual or automated alert |
| `PATCH` | `/api/alerts/:id/acknowledge` | Authenticated | Acknowledge active incident |
| `POST` | `/api/footage-tickets` | Authenticated | Submit chain-of-custody footage request |
| `POST` | `/api/footage-tickets/:id/evidence` | Authenticated | Upload SHA-256 sealed evidence clip |

---

## 🔐 Environment Variables

### Backend (`server/.env`)
```env
PORT=5001
NODE_ENV=development
AI_SERVICE_URL=http://127.0.0.1:8000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/drishtigrid
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_refresh_secret_key
EVIDENCE_ENCRYPTION_KEY=32_byte_hex_key_for_aes_256_gcm
```

### Frontend (`client/.env`)
```env
VITE_API_URL=http://localhost:5001/api
VITE_SOCKET_URL=http://localhost:5001
VITE_APP_NAME=DrishtiGrid
```

---

## 🛡️ Hackathon Evaluation & Compliance Highlights
1. **Zero-DB Video Storage:** Live streams are parsed directly in the browser via WebRTC (WHEP) and hardware canvas decoding without consuming database storage.
2. **1-FPS Temporal Video Processing:** Deep learning frame sampling at 1 frame per second with 30s vehicle tracking deduplication, consensus color extraction, and HTTP 206 byte-range playback.
3. **Cryptographic Integrity:** Evidence files are sealed with SHA-256 digests and AES-256-GCM encryption for court-admissible chain of custody.
4. **Resilient AI Pipeline:** Even if the Python deep learning server is offline, DrishtiGrid's built-in fallback simulation guarantees uninterrupted operation.
5. **Law Enforcement Realism:** Authentic Gujarat Police Netram ICCC design, BNS/IPC legal citations, tactical dispatch actions, and bilingual Gujarati/English interfaces in both Light and Dark modes.

---

*Developed with pride for the Government of Gujarat Home Department Digital Surveillance Missions.*
