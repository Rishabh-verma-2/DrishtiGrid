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
   - [3. 🚔 ANPR & AI Vehicle Surveillance Engine](#3--anpr--ai-vehicle-surveillance-engine-new)
   - [4. 🎫 Secure Footage Ticketing & Cryptographic Evidence Chain](#4--secure-footage-ticketing--cryptographic-evidence-chain)
   - [5. 👥 3-Role Government RBAC & Security](#5--3-role-government-rbac--security)
   - [6. 🔔 Real-Time Notification & Alert Dispatch](#6--real-time-notification--alert-dispatch)
4. [Project Directory Structure](#-project-directory-structure)
5. [Quick Start Guide (One-Click Setup & Launch)](#-quick-start-guide)
6. [API Reference Overview](#-api-reference-overview)
7. [Environment Variables](#-environment-variables)
8. [Hardware & Deployment Guidelines](#-hardware--deployment-guidelines)

---

## 🏛️ Executive Summary

**DrishtiGrid** is an enterprise Command & Control (C2) situational awareness and video intelligence platform engineered for the **Government of Gujarat Home Department**, State Police Headquarters, and Municipal Smart City Operations Centers.

The platform unifies live CCTV video streaming, geospatial GIS telemetry, cryptographic evidence preservation, and **Automatic Number Plate Recognition (ANPR)** into a single, cohesive, bilingual (English/Gujarati) dashboard with authentic state portal themes (Light and Dark modes).

---

## 🏗️ Platform Architecture

```
                                  ┌──────────────────────────────────────────────┐
                                  │      Gujarat Surveillance Camera Network     │
                                  │   (Ahmedabad, Surat, Gandhinagar, Rajkot...)  │
                                  └──────────────────────┬───────────────────────┘
                                                         │ Media Ingest (RTSP / RTMP)
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
      │   YOLOv8 + PaddleOCR      │                                               └─────────────┬─────────────┘
      │   Zero-DCE + Real-ESRGAN  │                                                             │
      └─────────────┬─────────────┘                                                             │
                    │  Inference Response                                                       │
                    ▼                                                                           ▼
      ┌───────────────────────────┐                                               ┌───────────────────────────┐
      │    Node.js Server API     │◄─────────────────── Socket.IO & REST ─────────┤  - GIS Tactical Map (OSM) │
      │    (:5001) Express 5      │                                               │  - Live Video Monitoring  │
      │  - Plate Normalization    │                                               │  - ANPR Scanner & Hotlist │
      │  - Watchlist Matching     │                                               │  - Footage Ticketing      │
      │  - 3-Role RBAC & JWT      │                                               │  - Notification Center    │
      └─────────────┬─────────────┘                                               └───────────────────────────┘
                    │
                    ▼
      ┌───────────────────────────┐
      │       MongoDB Atlas       │
      │   - Metadata & Hotlists   │
      │   - Audit Logs & Evidence │
      │   - Native Alerts         │
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

### 3. 🚔 ANPR & AI Vehicle Surveillance Engine *(NEW)*
- **5-Stage Deep Learning Pipeline:**
  1. **YOLOv8 Plate Detection:** Identifies plate bounding boxes with aspect ratio filtering.
  2. **OpenCV Preprocessing:** Denoising, unsharp mask sharpening, and contrast normalization.
  3. **Zero-DCE Enhancement:** Low-light neural enhancement for nighttime surveillance frames.
  4. **Real-ESRGAN x4plus:** 4x super-resolution upscaling for distant or low-resolution plates.
  5. **PaddleOCR Engine:** Text extraction with Indian registration pattern validation.
- **Indian Plate Canonical Disambiguation:** Disambiguates OCR errors based on positional syntax (`[State 2L][District 2D][Series 1-3L][Number 4D]`), automatically resolving `O/0`, `I/1`, `Z/2`, `B/8`, and `S/5`. Supports Bharat Series (`BH`), Electric Vehicles (`EV`), and standard formats.
- **Hotlist & Watchlist Cross-Referencing:** Instant comparison against active database records categorized by `STOLEN`, `WANTED`, `SUSPECT`, `VIP`, and `BLACKLISTED`.
- **Flashing Interception Alert:** Real-time red emergency modal popup with optical crop comparisons, dossier details, and instant unit dispatch.
- **Dual-Mode Execution:** Full deep learning inference when the Python AI service is running; **intelligent fallback simulation** when the AI service is offline, ensuring zero operational downtime.

### 4. 🎫 Secure Footage Ticketing & Cryptographic Evidence Chain
- Official workflow for law enforcement requesting locked CCTV footage segments.
- **AES-256-GCM** encryption for stored evidence assets.
- **SHA-256 Cryptographic Hash Sealing:** Every uploaded evidence file receives an immutable SHA-256 integrity digest stored in the database.
- One-click **Cryptographic Verification**: Re-hashes the file and verifies bit-for-bit authenticity to prevent evidence tampering in court.

### 5. 👥 3-Role Government RBAC & Security
- **Strict Role-Based Access Control:**
  - `ADMIN`: Full system administration, camera management, user provisioning, system health, and audit logs.
  - `POLICE`: Live monitoring, GIS maps, footage requests, ANPR scanner, hotlist management, and alert triage.
  - `TRAFFIC_POLICE`: Traffic surveillance, ANPR plate tracking, speed/violation alerts, and live monitoring.
- **JWT Authentication:** Dual-token mechanism with rotating short-lived Access Tokens and HttpOnly Refresh Tokens.
- **Immutable Audit Trail:** Logs all user actions, logins, ticket responses, and batch ANPR scans.

### 6. 🔔 Real-Time Notification & Alert Dispatch
- Real-time push via **Socket.IO** (`alert:new`, `anpr:match`, `notification:new`, `camera:status`).
- Audio-visual alert toasts and top-bar Notification Center with unread counters.

---

## 📂 Project Directory Structure

```
DrishtiGrid/
├── ai-service/                       # Python FastAPI AI Microservice (:8000)
│   ├── app/
│   │   ├── api/routes.py             # /health, /process endpoints
│   │   ├── config/settings.py        # Model thresholds, GPU flags
│   │   ├── detection/yolo_detector.py # YOLOv8 plate detector
│   │   ├── enhancement/              # CLAHE & Zero-DCE neural low-light
│   │   ├── ocr/paddle_ocr.py         # PaddleOCR extraction
│   │   ├── pipeline/plate_pipeline.py # 5-stage orchestration pipeline
│   │   ├── super_resolution/         # Real-ESRGAN x4 upscaler
│   │   └── validation/indian_plate.py # Indian regex & character repair
│   ├── download_models.py            # AI model weight downloader
│   ├── requirements.txt              # PyTorch, Ultralytics, PaddleOCR specs
│   └── README.md                     # Dedicated AI microservice docs
│
├── client/                           # React 19 Frontend (Vite 8 + Tailwind v4) (:5173)
│   ├── src/
│   │   ├── api/index.js              # Centralized API client (auth, cameras, anpr, alerts)
│   │   ├── components/
│   │   │   ├── anpr/                 # MatchAlertModal.jsx, WatchlistModal.jsx
│   │   │   ├── cameras/              # CameraPlayer.jsx, CameraStreamModal.jsx
│   │   │   ├── layout/               # DashboardLayout.jsx (Bilingual Gov Navigation)
│   │   │   └── notifications/        # NotificationCenter.jsx
│   │   ├── pages/
│   │   │   ├── ANPRPage.jsx          # ANPR Scanner, Watchlist & Incidents Hub
│   │   │   ├── AlertsPage.jsx        # Security alert dispatch & triage
│   │   │   ├── CameraMonitoringPage.jsx # Multi-layout live CCTV feeds
│   │   │   ├── GISMapPage.jsx        # Full-screen Gujarat Leaflet GIS
│   │   │   ├── FootageRequestsPage.jsx # Chain-of-custody ticketing
│   │   │   └── DashboardPage.jsx     # Executive telemetry
│   │   └── index.css                 # Gujarat Government theme tokens & plate pills
│   └── vite.config.js
│
├── server/                           # Node.js Express 5 Backend (:5001)
│   ├── src/
│   │   ├── controllers/              # anprController.js, alertController.js, etc.
│   │   ├── middleware/               # auth.js (JWT & RBAC), errorHandler.js
│   │   ├── models/                   # PlateRecord.js, Alert.js, Camera.js, User.js
│   │   ├── routes/                   # anpr.js, alerts.js, cameras.js, stream.js
│   │   ├── services/                 # cryptoService.js, cloudinaryService.js
│   │   ├── socket/socketHandler.js   # Real-time WebSocket broadcasting
│   │   └── utils/plateUtils.js       # Positional repair & Levenshtein matching
│   └── scripts/seed.js               # Gujarat cameras & users seeder
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
- Installs PyTorch, Torchvision, Ultralytics YOLOv8, Real-ESRGAN, and PaddleOCR
- Executes `download_models.py` to retrieve `yolov8n.pt`, `zero_dce.pth`, and `RealESRGAN_x4plus.pth`

---

### Option C — Manual Startup (Terminal by Terminal)

**Terminal 1 — Python AI Service:**
```bash
cd ai-service
call venv\Scripts\activate.bat
uvicorn app.main:app --host 0.0.0.0 --port 8000
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

### ANPR & Intelligence Endpoints
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/api/anpr/analyze` | Police, Traffic, Admin | Upload single/batch vehicle images (multipart) |
| `GET` | `/api/anpr/watchlist` | Police, Traffic, Admin | Query monitored vehicle hotlist |
| `POST` | `/api/anpr/watchlist` | Police, Traffic, Admin | Register target vehicle into hotlist |
| `PATCH` | `/api/anpr/watchlist/:id` | Police, Traffic, Admin | Update watchlist entry |
| `DELETE`| `/api/anpr/watchlist/:id` | Police, Traffic, Admin | Deactivate / delete watchlist entry |
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
AI_SERVICE_URL=http://localhost:8000
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
1. **Zero-DB Video Storage:** No raw video files or feed buffers touch MongoDB. Streams are parsed directly in the browser via WebRTC (WHEP) and hardware canvas decoding.
2. **Cryptographic Integrity:** Evidence files are sealed with SHA-256 digests and AES-256-GCM encryption.
3. **Resilient AI Pipeline:** Even if the Python deep learning server is offline, DrishtiGrid's built-in fallback simulation guarantees uninterrupted operation.
4. **Bilingual Institutional UI:** Gujarat Government branding in Gujarati (ગુજરાતી) and English, supporting full Light and Dark modes.

---

*Developed with pride for the Government of Gujarat Home Department Digital Surveillance Missions.*
