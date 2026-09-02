# DrishtiGrid 
### *Gujarat State CCTV Surveillance, GIS Command & Low-Latency Video Intelligence Platform*

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg?logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-blue.svg?logo=react)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg?logo=tailwindcss)](https://tailwindcss.com)
[![WebRTC](https://img.shields.io/badge/Streaming-WebRTC%20%7C%20WHEP%20%7C%20HLS-orange.svg)](https://webrtc.org)
[![Leaflet](https://img.shields.io/badge/GIS-Leaflet%20%7C%20OpenStreetMap-199900.svg?logo=leaflet)](https://leafletjs.com)
[![License](https://img.shields.io/badge/License-Government%20Internal%20Use-red.svg)](#)

---

## 🏛️ Executive Summary

**DrishtiGrid** is an industry-grade Command and Control (C2) situational awareness platform engineered specifically for the **Government of Gujarat Home Department**, Smart City missions, and state police headquarters.

The platform bridges real-time physical security and geospatial intelligence by ingesting live video streams across Gujarat's critical infrastructure—highways, religious shrines, railway junctions, ports, and urban market squares—projecting them onto an interactive GIS grid without persistent storage overhead.

---

## 🎯 The Core Problem & Architectural Challenges

| Challenge | Traditional Approach | DrishtiGrid Solution |
|---|---|---|
| **Storage Explosion** | Saving video streams and snapshots to MongoDB/S3, quickly exhausting storage limits. | **Zero-DB Streaming Pipeline:** Feeds are consumed live in memory via WebRTC/HLS directly into browser hardware canvas. Zero video bytes or feed buffers touch MongoDB. |
| **Network & Browser Overload** | Loading dozens of high-definition camera feeds simultaneously, crashing client browsers and hogging WAN bandwidth. | **On-Demand Pacing:** Standby preview mode loads 0 KB/s in grid view. WebRTC WHEP peer connections negotiate strictly when an operator selects or opens a camera. |
| **Latency in Remote AI & Monitoring** | HLS/RTMP pipelines with 5 to 30 second lag, causing stale tactical decisions. | **Sub-500ms WebRTC (WHEP):** Ultra-low latency real-time streaming directly from gateway (`103.250.160.189`), with automatic HLS CDN fallback. |
| **Heterogeneous Stream Consumption** | Separate silos for web dashboards, AI inference pipelines, and field control rooms. | **Unified Multi-Protocol Hub:** WebRTC for browser operator preview, RTSP for Python OpenCV / DeepStream AI models, and HLS for CDN delivery. |

---

## 🏗️ System Architecture

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
      │   AI Inference Pipeline   │                                               │   DrishtiGrid Web Client  │
      │   (Python, OpenCV, YOLO)  │                                               │   React 19 + Tailwind v4  │
      └───────────────────────────┘                                               └─────────────┬─────────────┘
                                                                                                │
                                                       ┌────────────────────────────────────────┴───────────────────────────────────────┐
                                                       ▼                                                                                ▼
                                        ┌─────────────────────────────┐                                                  ┌─────────────────────────────┐
                                        │   GIS Map (Leaflet / OSM)   │                                                  │   Command Telemetry & RBAC  │
                                        │   Spatial Geo-indexing      │                                                  │   Express API (Port 5001)   │
                                        └─────────────────────────────┘                                                  └──────────────┬──────────────┘
                                                                                                                                        │
                                                                                                                                        ▼
                                                                                                                         ┌─────────────────────────────┐
                                                                                                                         │        MongoDB Atlas        │
                                                                                                                         │   Metadata only (Zero-DB)   │
                                                                                                                         └─────────────────────────────┘
```

---

## ⚡ Key Modules & Capabilities

### 1. 🎥 Zero-DB Live Camera Monitoring (`cam01` – `cam30`)
- **Direct WebRTC (WHEP) Preview:** Real-time `<500ms` peer connection directly from `http://103.250.160.189:8889/stream/camXX/whep`.
- **HLS CDN Fallback:** High-compatibility HLS streaming powered by `hls.js` (`https://cctv.corp8.cloud/camXX/index.m3u8`).
- **Paced Bandwidth Conservation:** Standby cards consume zero bandwidth until an operator initiates a feed.
- **Multi-Layout Switcher:**
  - **Grid (30):** Overview of all 30 live Gujarat feeds in standby status.
  - **Quad (2x2):** 4 active simultaneous feeds for incident tracking.
  - **Matrix (3x3):** 9 feeds for sector surveillance.
  - **Cinema Mode:** Spotlight player with quick camera carousel.
- **Watermarked Snapshots:** Captures high-resolution frame with timestamp and CCTV watermark to PNG.
- **PTZ Simulation:** Pan, tilt, and digital zoom controls with responsive reticle HUD.

### 2. 🗺️ Gujarat GIS Spatial Command Map
- Built using **Leaflet** & **OpenStreetMap** with custom dark tactical styling.
- Pins cameras across major districts: Ahmedabad, Gandhinagar, Surat, Vadodara, Rajkot, Bhavnagar, Jamnagar, Junagadh, Anand, Bharuch, Mehsana.
- Status-coded markers (Online, Offline, Maintenance).
- Click-to-inspect popup with live coordinates, location type, and zone categorization.

### 3. 📊 Analytics & Telemetry Dashboard
- KPI overview cards (Total cameras, Online percentage, Active alerts, 24h event counter).
- Status distribution pie chart and district-wise camera bar chart using **Recharts**.
- Live operational activity log and security feed ticker.
- Real-time online operator telemetry via **Socket.IO**.

### 4. 🔒 Government-Grade Security & Authentication
- Admin-only access guard with JWT token rotation (Access Token + Refresh Token).
- Brute-force protection with account locking after 5 failed attempts.
- Bcrypt 12-round salted password hashing.
- Helmet HTTP security headers, CORS origin whitelist, and Express request rate limiting.

### 5. 🤖 AI & Developer Hub
For law enforcement AI models and hackathon evaluators, each camera provides 1-click copyable commands:
- **RTSP Endpoint:** `rtsp://103.250.160.189:8554/stream/camXX`
- **WebRTC WHEP:** `http://103.250.160.189:8889/stream/camXX/whep`
- **Python OpenCV Code:**
  ```python
  import cv2

  cap = cv2.VideoCapture("rtsp://103.250.160.189:8554/stream/cam01")
  while True:
      ret, frame = cap.read()
      if not ret: break
      cv2.imshow("DrishtiGrid-Live", frame)
      if cv2.waitKey(1) & 0xFF == ord('q'): break
  cap.release()
  cv2.destroyAllWindows()
  ```
- **FFmpeg Stream Verification:**
  ```bash
  ffplay -rtsp_transport tcp rtsp://103.250.160.189:8554/stream/cam01
  ```

---

## 📂 Project Structure

```
DrishtiGrid/
├── client/                           # React 19 Frontend (Vite + Tailwind v4)
│   ├── src/
│   │   ├── api/                      # Axios client with JWT auto-refresh interceptors
│   │   ├── components/
│   │   │   ├── cameras/
│   │   │   │   ├── CameraPlayer.jsx  # WebRTC (WHEP) + HLS dual video engine
│   │   │   │   └── CameraStreamModal.jsx # HD stream theater with PTZ & commands
│   │   │   └── layout/
│   │   │       └── DashboardLayout.jsx # Command center shell & navigation
│   │   ├── hooks/                    # useSocket real-time connection hook
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx         # Glassmorphism login with 1-click demo filler
│   │   │   ├── DashboardPage.jsx     # Command telemetry & overview
│   │   │   ├── GISMapPage.jsx        # Full-screen Gujarat Leaflet GIS
│   │   │   ├── CameraMonitoringPage.jsx # Multi-layout live feeds engine
│   │   │   ├── CameraManagementPage.jsx # Metadata catalog and management
│   │   │   └── AlertsPage.jsx        # Security alert dispatch & triage
│   │   ├── store/                    # Zustand state (authStore, socketStore)
│   │   └── index.css                 # Tailwind v4 theme tokens & styles
│   └── vite.config.js                # Vite reverse proxy & optimization
│
├── server/                           # Node.js + Express Backend
│   ├── src/
│   │   ├── config/db.js              # MongoDB Atlas connection
│   │   ├── controllers/              # Auth, Camera, and Alert controllers
│   │   ├── middleware/               # JWT auth & centralized error handler
│   │   ├── models/                   # Mongoose schemas (User, Camera, Alert)
│   │   ├── routes/
│   │   │   ├── auth.js               # Login, refresh, logout routes
│   │   │   ├── cameras.js            # Camera metadata CRUD & stats
│   │   │   ├── stream.js             # Zero-DB dynamic stream catalog & WHEP proxy
│   │   │   └── alerts.js             # Alert tracking & resolution
│   │   └── socket/socketHandler.js   # Real-time WebSocket rooms
│   ├── scripts/seed.js               # Initial Gujarat camera & admin seeder
│   └── index.js                      # Server entry point
│
├── .gitignore                        # Strict secrets and build artifact protection
└── README.md                         # Platform design and solution documentation
```

---

## 🚦 Quick Start Guide

### 1. Clone & Install
```bash
git clone https://github.com/Rishabh-verma-2/DrishtiGrid.git
cd DrishtiGrid

# Install Backend Dependencies
cd server
npm install

# Install Frontend Dependencies
cd ../client
npm install
```

### 2. Environment Configuration

Create `server/.env`:
```env
PORT=5001
NODE_ENV=development
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_super_secret_jwt_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
CLIENT_URL=http://localhost:5173
```

Create `client/.env`:
```env
VITE_API_URL=http://localhost:5001/api
VITE_SOCKET_URL=http://localhost:5001
```

### 3. Seed Database
```bash
cd server
npm run seed
```
> **Default Admin Credentials:**
> - **Email:** `adminuser@gov.in`
> - **Password:** `adminpass@123`

### 4. Run Locally

**Terminal 1 (Backend API & Socket):**
```bash
cd server
npm run dev
```

**Terminal 2 (Frontend Client):**
```bash
cd client
npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

## 🛡️ Compliance & Hackathon Verification Notes
- **Zero Video DB Footprint:** Confirmed via `db.cameras.find()`—no video files, frames, or streams stored in MongoDB.
- **Port Standard:** Backend runs on `5001` (avoiding macOS Control Center on port 5000) with dynamic CORS allowing any localhost port.
- **Network Resilience:** Fallback to backend WHEP proxy in case of client-side port restrictions on port 8889.

---

**Built with dedication for the Government of Gujarat Digital Initiatives.**
