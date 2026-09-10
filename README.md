# 🏛️ DrishtiGrid (દ્રષ્ટિગ્રીડ)
### *Gujarat State CCTV Surveillance, Geospatial GIS Command & AI-Powered Video Intelligence Platform*

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933.svg?logo=node.js)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB.svg?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38BDF8.svg?logo=tailwindcss)](https://tailwindcss.com)
[![WebRTC](https://img.shields.io/badge/Streaming-WebRTC%20%7C%20WHEP%20%7C%20HLS-FF6B00.svg)](https://webrtc.org)
[![Leaflet](https://img.shields.io/badge/GIS-Leaflet%20%7C%20OpenStreetMap-199900.svg?logo=leaflet)](https://leafletjs.com)
[![YOLOv8](https://img.shields.io/badge/AI-YOLOv8%20%7C%20PaddleOCR%20%7C%20Soft--NMS-blueviolet.svg)](https://ultralytics.com)
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
   - [10. 🧠 Crowd Detection & Scene Object Inventory](#10--crowd-detection--scene-object-inventory)
   - [11. 📤 Bulk Camera Onboarding & GIS Registry Import](#11--bulk-camera-onboarding--gis-registry-import)
   - [12. 🏢 Department Escalation & Offline Camera Ticketing](#12--department-escalation--offline-camera-ticketing)
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

### 2. 🗺️ Gujarat GIS Spatial Command & Control System
A state-grade geospatial command center built on **Leaflet**, **OpenStreetMap**, and **MongoDB 2dsphere Geospatial Indexing**, engineered for Gujarat State Police Headquarters and Municipal Smart Cities (Netram ICCC).

- **Unified Omnibar Search & Inverted Area Masking**:
  - Global debounced search indexing administrative districts, live camera units, operational geofence zones, and critical infrastructure.
  - GeoJSON boundary highlighting with inverted masking (darkens non-selected regions to focus law enforcement attention on the active jurisdiction).
  - Smooth camera flight animations (`map.flyTo` and dynamic bounding-box auto-zoom).
- **Streamlined Single-Line Government Command Header**:
  - Unified search bar, quick 33-district selector, and cascading jurisdiction filters arranged in an ergonomic, non-wrapping single line.
  - Secondary cascading hierarchy filter (`AdminHierarchyFilter`): District ➔ City / Taluka ➔ Operational Zone ➔ Police Station jurisdiction.
- **OpenStreetMap Real Critical Infrastructure Pipeline (6,200+ Gujarat Facilities)**:
  - Live Overpass API ingestion script (`server/scripts/fetchGujaratOsmData.js` / `npm run fetch:osm`) fetching authentic facilities across Gujarat.
  - Ingested **6,216 real-world facilities**: **5,451 Hospitals & Health Centers**, **76 Police Stations**, **678 Railway Stations**, and **Fire Stations**.
  - Dynamic bottom-left Map Legend displaying real aggregate infrastructure counts per district with 1-click surrounding camera discovery.
- **Admin Geofencing & Operational Zone Management Hub**:
  - Dedicated **Zone Manager Hub** (`ZoneManagerModal`) empowering Admins and Police Chiefs to view, search, filter, fly-to, toggle active/inactive, delete, and create radial or polygon geofences.
  - Custom rule engine for intrusion detection, curfew hours, speed limits, vehicle restrictions, and automatic alert dispatch via Socket.IO.
- **CCTV Coverage Gap & Blind Spot Analysis**:
  - Real-time geospatial visual radius coverage modeling (150m, 300m, 500m per camera node).
  - Unmonitored intersection detection, coverage efficiency scores (%), and 1-click strategic camera deployment placement markers.
- **Route-Based Camera Discovery (Corridor Tracking)**:
  - Source-to-destination route corridor discovery with configurable spatial buffers (100m, 250m, 500m).
  - Sequenced camera discovery along major state corridors (e.g., SG Highway, SP Ring Road, Ahmedabad–Gandhinagar Expressway) for suspect vehicle pursuit and convoy protection.
- **Nearby Intelligence & Incident Radius Engine**:
  - Radial spatial analysis (500m, 1km, 2km) around any map coordinate or camera node.
  - Immediate proximity breakdown of nearby active cameras, police stations, civil hospitals, active incidents, and crowd density.
- **Adaptive Government Theme & Stacking Hierarchy**:
  - Non-overlapping z-index hierarchy (`z-[1500]` toolbar, `z-[3000]` autocomplete dropdown, `z-[99999]` modals/notifications, `z-[1000]` map controls).
  - Bulletproof High-Contrast Light Mode (`theme-light`) and Tactical Dark Mode (`theme-dark`) with real-time dynamic evaluation.

### 3. 🚔 ANPR & AI Vehicle Surveillance Engine — *Vehicle-First Multi-Vehicle Architecture*
- **Strict Vehicle-First Detection Pipeline**:
  - Localizes vehicles first (cars, motorcycles, buses, trucks, and auto-rickshaws) and searches for license plates strictly inside expanded vehicle ROIs (+8–15% padding), eliminating false detections from roadside signboards, billboards, and background text.
  - Full-frame global plate detection acts solely as a fallback if 0 vehicles are detected.
  - Dedicated lower-40% bumper and grille sub-scans for high-clearance commercial trucks and buses.
- **Global Bipartite Matching (Scipy Hungarian Algorithm)**:
  - Replaced greedy matching with optimal bipartite assignment (`scipy.optimize.linear_sum_assignment`), incorporating spatial containment, IoU, area ratio, vertical priors (lower 50%), and vehicle ROI identity locks to resolve dense traffic queues without cross-assignment.
- **Anti-Hallucination Quality Gate**:
  - Distant, blurry, or occluded plates failing the quality gate (`PlateQualityState.UNREADABLE`) bypass OCR and are recorded as `PLATE_DETECTED_OCR_UNREADABLE`. Prevents OCR text hallucinations while preserving spatial bounding box evidence.
- **Indian Plate Validation & Disambiguation**:
  - Validates against all 36 Indian state & UT codes, with first-class support for **Standard** (`GJ01AB1234`), **Bharat Series (BH)** (`22BH1234AA`), **Electric Vehicles (EV)** (`GJ01AB1234E`), and **Commercial** yellow plates.
  - Positional canonical repair: resolves `O/0`, `I/1`, `Z/2`, `B/8`, `S/5` based on regulatory position syntax.
- **Forensic Visual Presentation & "ANALYZED VEHICLES" Dashboard**:
  - Subtle vehicle boxes (`Vehicle #1 • Car | White`) and tight plate boxes with solid contrast pills showing percentage confidence (`GJ01AB1234  92%`) and collision-avoidance label positioning.
  - Responsive summary table (desktop/tablet) and cards (mobile) below the analyzed viewports showing vehicle index, type, color circle, Indian number plate badge, percentage confidences, and status (`MATCH`, `CLEAR`, `UNREADABLE`, `NO PLATE`).
  - Interactive hover/click focus tracking with a floating highlight banner over the analyzed image.
- **Zero-DCE Neural Enhancement:** Dynamic low-light illumination curve estimation for nighttime footage.
- **Hotlist & Watchlist Cross-Referencing:** Automatic matching against `STOLEN`, `WANTED`, `SUSPECT`, `VIP`, `BLACKLISTED` databases with 1-click tactical dossier access.
- **60/60 Unit Test Suite:** Full operational coverage across 20 multi-vehicle traffic scenarios in `tests/test_vehicle_first_anpr.py`.

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
- Real-time push via **Socket.IO** (`alert:new`, `anpr:match`, `anpr:cleared`, `notification:new`, `camera:status`, `crowd:analysis`, `crowd:alert`).
- Audio-visual alert toasts and top-bar Notification Center with unread counters.

### 10. 🧠 Crowd Detection & Scene Object Inventory

A fully integrated, zero-new-install crowd intelligence module built on the existing YOLOv8 + OpenCV stack.

**Person counting — maximum accuracy techniques:**

| Technique | What it solves |
|-----------|---------------|
| **4-pass multi-scale inference** (full-frame + 1.25× + 3×3 tiles 40% overlap + all-class) | Small/distant people, persons near tile edges, deep-crowd resolution |
| **Gaussian Soft-NMS** (Bodla et al.) | Preserves partially-occluded people that hard NMS deletes |
| **Occlusion correction estimator** | Estimates hidden persons behind front rows based on packing density |
| **Gaussian KDE heatmap** | Smooth continuous density map from person centroids (JET colourmap overlay) |
| **Blended density score** (count-based 55% + area-based 45%) | More accurate density vs. naive count/area ratio |

**Output fields:**
- `detected_count` — persons YOLO directly found
- `occluded_est` — hidden persons estimated by the occlusion corrector
- `total_count` — `detected_count + occluded_est` (the number shown in the panel)
- `crowd_level` — `LOW` (0–9) / `MEDIUM` (10–29) / `HIGH` (30–59) / `CRITICAL` (60+)
- `density_score` — blended 0–1 float
- `zones` — 4×4 density grid with `clear` / `moderate` / `dense` / `critical` per cell
- `object_inventory` — full COCO 80-class scene inventory:
  ```json
  {
    "vehicles": { "car": 6, "motorcycle": 2, "bus": 1 },
    "vehicle_total": 9,
    "other_objects": { "bench": 3, "umbrella": 1 },
    "detections": [ { "class": "car", "count": 6, "boxes": [...] } ]
  }
  ```
- `surge` — detected when count exceeds 30-frame rolling baseline by ≥40%
- `annotated_image_b64` — richly annotated frame: JET KDE heatmap overlay, per-person boxes coloured by zone density, vehicle boxes (blue), dual info panels

**Alert integration:** `HIGH` or `CRITICAL` crowd or a surge event creates a `crowd_surge` MongoDB Alert and emits `crowd:analysis` / `crowd:alert` / `alert:new` via Socket.IO (60-second per-camera cooldown).

**API:** `POST /api/crowd/analyze` · `GET /api/crowd/alerts` · `GET /api/crowd/stats` · `POST /api/crowd/reset/:camId`

### 11. 📤 Bulk Camera Onboarding & GIS Registry Import
A production-grade, government-spec spreadsheet ingestion engine enabling authorized administrators to safely onboard hundreds of surveillance camera nodes at once via Excel (`.xlsx` or `.xls`) without risking database corruption or duplicate records.

- **Multi-Sheet Template Generator (`GET /api/cameras/bulk/template`)**:
  - Dynamically generated via `exceljs` with an **Instructions & Field Definitions** sheet, a stylized **Camera Data Entry** sheet with embedded data-validation dropdowns, and an **Allowed Values & Enums Reference** sheet.
- **Smart Header & Column Aliasing**:
  - Automatically resolves colloquial or legacy column headers (e.g., `cam_id` / `Camera ID` ➔ `cameraId`, `lat` ➔ `latitude`, `lng_coord` ➔ `longitude`, `dist` ➔ `district`, `dept` ➔ `departmentCode`).
- **Comprehensive Geolocation Bounds Validation**:
  - **Global Bounds**: Strictly enforces valid geographic coordinates ($-90 \le \text{lat} \le 90$, $-180 \le \text{lng} \le 180$) as fatal errors.
  - **Gujarat Regional Bounding Box**: Automatically flags coordinates falling outside the Gujarat bounding box ($20.0 \le \text{lat} \le 24.8$, $68.0 \le \text{lng} \le 74.5$) as non-blocking operator warnings.
- **Two-Tier Duplicate Collision Prevention**:
  - **In-File Deduplication**: Flags duplicate camera IDs within the same uploaded spreadsheet.
  - **Database Registry Collision**: Cross-references candidate camera IDs against active registered cameras in MongoDB, excluding existing nodes to protect current operational configurations.
- **State Isolation & Pre-Save Analysis Session**:
  - Ingestion occurs in a sandboxed, temporary `ImportSession` with a 2-hour TTL. **Zero cameras are written to the database during the upload/validation phase.**
- **Interactive Leaflet Pre-Save Map Preview**:
  - Allows operators to preview candidate camera coordinates as temporary pins on a Leaflet map before persistence, verifying spatial distribution before committing to the state GIS registry.
- **Atomic Two-Phase Commit & Audit Trail**:
  - Mandatory administrator confirmation dialog. Valid records are committed atomically via MongoDB `bulkWrite`.
  - Automatically logs an immutable `SystemAuditLog` entry documenting user ID, imported count, session ID, and timestamp.
  - Dispatches a real-time `camera:bulk_imported` event over Socket.IO to instantly synchronize all connected GIS and monitoring consoles.
- **Downloadable Excel Audit Report (`GET /api/cameras/bulk/import/:importId/report`)**:
  - Generates an exportable diagnostic workbook with row-by-row status badges, problems detected, and suggested corrections.
- **Automated Verification**:
  - 34-test automated test suite (`npm run test:bulk-import`) ensuring 100% verification coverage across aliases, boundary rules, database duplicates, state isolation, atomic commits, and audit logging.

### 12. 🏢 Department Escalation & Offline Camera Ticketing
- **Netram ICCC Camera Fault Escalation**:
  - Formal dispatch modal (`ReportToDeptModal`) for offline, malfunctioning, or vandalized cameras.
  - Automatically routes tickets to designated departments (Gujarat Police, Traffic Command, Municipal Corporation, Roads & Buildings Department).
  - Real-time notification broadcast via Socket.IO with priority levels (`Low`, `Medium`, `High`, `Critical`).
- **Full Light & Dark Mode Accessibility**:
  - High-contrast government light mode (`theme-light`) and tactical dark mode (`theme-dark`) with first-class color contrast across all dialogs, tables, and buttons.

---

## 📂 Project Directory Structure

```
DrishtiGrid/
├── ai-service/                       # Python FastAPI AI Microservice (:8000)
│   ├── app/
│   │   ├── api/routes.py             # /health, /process, /ocr, /crowd, /crowd/reset endpoints
│   │   ├── config/settings.py        # Model thresholds, GPU flags
│   │   ├── detection/
│   │   │   ├── yolo_detector.py      # 6-pass industry-grade LP detector (Soft-NMS, multi-scale, tiles)
│   │   │   ├── crowd_detector.py     # High-accuracy crowd + object inventory engine
│   │   │   ├── CROWD_DETECTION_IMPL.md # Crowd detection implementation reference
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
│   │   ├── api/index.js              # Centralized API client (auth, cameras, anpr, alerts, crowd, gis)
│   │   ├── components/
│   │   │   ├── anpr/
│   │   │   │   ├── MatchAlertModal.jsx      # Gujarat Police ICCC tactical intercept modal
│   │   │   │   ├── WatchlistModal.jsx       # Add/Edit hotlist records
│   │   │   │   ├── VideoUploadZone.jsx      # Video drag-and-drop & progress HUD
│   │   │   │   ├── VideoAnalysisResults.jsx # Scrubber player & vehicle timeline cards
│   │   │   ├── cameras/              # CameraPlayer.jsx, CameraStreamModal.jsx, BulkImportModal.jsx, ReportToDeptModal.jsx
│   │   │   ├── gis/                  # Gujarat GIS Command & Control Components
│   │   │   │   ├── UnifiedSearchBar.jsx     # Omnibar autocomplete search (districts, cams, zones, infra)
│   │   │   │   ├── AdminHierarchyFilter.jsx # 4-tier cascading administrative jurisdiction filter
│   │   │   │   ├── ZoneManagerModal.jsx     # Full C&C operational geofence zone hub (create, edit, fly, delete)
│   │   │   │   ├── ZoneModal.jsx            # Geofence creation & rule definition modal
│   │   │   │   ├── RouteCameraFinderModal.jsx # Corridor-based sequential camera discovery
│   │   │   │   ├── CoverageGapModal.jsx     # Spatial coverage gap & blind spot analysis
│   │   │   │   ├── AreaIntelligenceDrawer.jsx # District-level telemetry & incident breakdown
│   │   │   │   ├── NearbyIntelligencePanel.jsx # Radial spatial proximity analytics (500m-2km)
│   │   │   │   ├── InfrastructureLayer.jsx  # Real OpenStreetMap critical infrastructure visualization
│   │   │   │   ├── OperationalZonesLayer.jsx# Geofence polygon/circle interactive layer
│   │   │   │   ├── IncidentRadiusLayer.jsx  # Dynamic incident impact radius visualization
│   │   │   │   └── GISLayerControl.jsx      # Grouped multi-layer visibility toggle hub
│   │   │   ├── layout/               # DashboardLayout.jsx (Bilingual Gov Navigation)
│   │   │   └── notifications/        # NotificationCenter.jsx (High z-index stack)
│   │   ├── pages/
│   │   │   ├── ANPRPage.jsx          # ANPR 5-Tab Command Center
│   │   │   ├── AlertsPage.jsx        # Security alert dispatch & triage
│   │   │   ├── CameraMonitoringPage.jsx # Multi-layout live CCTV feeds
│   │   │   ├── CameraManagementPage.jsx # Camera registry & Bulk Import launcher
│   │   │   ├── CrowdDetectionPage.jsx   # YOLOv8 Crowd & People Density analyzer
│   │   │   ├── GISMapPage.jsx        # Full-screen Gujarat Leaflet GIS Command & Control
│   │   │   ├── FootageRequestsPage.jsx # Chain-of-custody ticketing
│   │   │   └── DashboardPage.jsx     # Executive telemetry
│   │   ├── store/
│   │   │   ├── authStore.js          # Authentication & token store
│   │   │   ├── anprStore.js          # Persistent batch cache & active tab state
│   │   │   └── themeStore.js         # Gujarat Gov light/dark themes
│   │   └── index.css                 # Gujarat Government theme tokens, plate pills & Leaflet popup styles
│   └── vite.config.js
│
├── server/                           # Node.js Express 5 Backend (:5001)
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── bulkCameraController.js# Excel spreadsheet validation & atomic 2-phase commit
│   │   │   ├── deptReportController.js# Offline camera escalation ticketing
│   │   │   ├── gisController.js      # GIS search, real OSM infra, zones, coverage, corridors
│   │   │   ├── anprController.js     # Image batch, video pipeline, watchlist, stats, clear
│   │   │   ├── alertController.js    # Alert dispatch & triage
│   │   │   ├── cameraController.js   # Camera catalog & heartbeat
│   │   │   └── crowdController.js    # Crowd analysis, alerts, stats, baseline reset
│   │   ├── middleware/               # auth.js (JWT & RBAC), errorHandler.js
│   │   ├── models/
│   │   │   ├── ImportSession.js      # Temporary 2-hour TTL bulk validation sessions
│   │   │   ├── OperationalZone.js    # Radial & polygon geofences with rule definitions
│   │   │   ├── CriticalInfrastructure.js # Real Gujarat hospitals, police, fire, rail (OSM 2dsphere)
│   │   │   ├── Incident.js           # Spatial incident logging & impact radii
│   │   │   ├── PlateRecord.js        # Monitored watchlist definitions
│   │   │   ├── PlateDetection.js     # Timestamped sightings with frame seconds
│   │   │   ├── StoredPlate.js        # Unique vehicle registry
│   │   │   ├── Alert.js              # Native incident alerts (ANPR + crowd_surge + geofence)
│   │   │   ├── Camera.js             # Camera metadata & coordinates
│   │   │   └── User.js               # Police/Admin user accounts
│   │   ├── routes/                   # cameras.js, gis.js, anpr.js, alerts.js, stream.js, crowd.js, deptReports.js
│   │   ├── services/
│   │   │   ├── bulkCameraService.js  # Excel generation, header aliasing, coordinate bounds & duplicate checking
│   │   │   ├── videoService.js       # 1-FPS video pipeline & temporal deduplication
│   │   │   ├── crowdDetectionService.js # Crowd AI bridge, alert creation, Socket.IO events
│   │   │   ├── plateStorageService.js# Local JSON/TXT + MongoDB sync
│   │   │   ├── cloudinaryService.js  # Evidence snapshot hosting (with local fallback)
│   │   │   └── cryptoService.js      # AES-256 & SHA-256 evidence sealing
│   │   ├── socket/socketHandler.js   # Real-time WebSocket broadcasting
│   │   └── utils/plateUtils.js       # Positional repair & Levenshtein matching
│   └── scripts/
│       ├── seed.js                   # Gujarat cameras & users seeder
│       ├── testBulkCameraImport.js   # 34-test automated verification suite for bulk onboarding
│       └── fetchGujaratOsmData.js    # Live Overpass API pipeline ingesting 6,200+ real Gujarat facilities
│
├── storage_data/                     # Local file-based plate registry backup
│   ├── stored_number_plates.json     # JSON plate export
│   └── stored_number_plates.txt      # Formatted text registry
│
├── setup-anpr.bat / setup-anpr.ps1   # Automated installer for AI venv & dependencies
├── start-all.bat / start-all.ps1     # Master 1-click launcher for all 3 services
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

Ingest **6,200+ authentic OpenStreetMap facilities** across Gujarat (Hospitals, Police, Fire, Rail):
```bash
cd server
npm run fetch:osm
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

### 📤 Bulk Camera Onboarding & Department Escalation Endpoints
| Method | Route | Access | Description |
|---|---|---|---|
| `GET`  | `/api/cameras/bulk/template` | Admin | Download official multi-sheet Excel onboarding template |
| `POST` | `/api/cameras/bulk/validate` | Admin | Upload and validate spreadsheet (returns row diagnostics & summary) |
| `POST` | `/api/cameras/bulk/import` | Admin | Explicit commit of validated cameras into MongoDB |
| `GET`  | `/api/cameras/bulk/import/:importId` | Admin | Retrieve status and row diagnostics of an import session |
| `GET`  | `/api/cameras/bulk/import/:importId/report` | Admin | Download detailed `.xlsx` post-validation / audit report |
| `POST` | `/api/cameras/bulk/import/:importId/cancel` | Admin | Discard an uncommitted import session |
| `POST` | `/api/dept-reports` | Police, Traffic, Admin | Dispatch formal offline camera escalation ticket to department |
| `GET`  | `/api/dept-reports` | Authenticated | List all active camera escalation reports |
| `GET`  | `/api/dept-reports/:id` | Authenticated | Fetch thread details for a specific report |
| `PATCH`| `/api/dept-reports/:id/status` | Admin, Police | Update ticket status (open, in_progress, resolved) |

### 🗺️ Geospatial & GIS Command Endpoints
| Method | Route | Access | Description |
|---|---|---|---|
| `GET` | `/api/gis/search?q={query}` | Authenticated | Omnibar search across districts, cams, zones, infrastructure |
| `GET` | `/api/gis/nearby?lat={lat}&lng={lng}&radius={m}` | Authenticated | Radial spatial proximity intelligence (cameras, incidents, infra) |
| `GET` | `/api/gis/area-intelligence?district={d}` | Authenticated | District-level operational telemetry & incident analytics |
| `POST`| `/api/gis/route-cameras` | Authenticated | Corridor camera discovery along polyline trajectory |
| `GET` | `/api/gis/coverage?district={d}` | Authenticated | Spatial visual coverage buffers, blind spots & placement suggestions |
| `GET` | `/api/gis/infrastructure?district={d}` | Authenticated | Query 6,200+ OpenStreetMap hospitals, police, fire & rail stations |
| `POST`| `/api/gis/infrastructure` | Admin | Register new critical infrastructure asset |
| `GET` | `/api/gis/zones?district={d}` | Authenticated | Query active radial & polygon geofence zones |
| `POST`| `/api/gis/zones` | Admin, Police | Create new geofence zone with intrusion/curfew rules |
| `PATCH`| `/api/gis/zones/:id` | Admin, Police | Update geofence zone properties, active status & rules |
| `DELETE`| `/api/gis/zones/:id` | Admin | Remove operational geofence zone |
| `GET` | `/api/gis/incidents?district={d}` | Authenticated | Query active geo-located security & traffic incidents |
| `GET` | `/api/gis/incident/:id/context` | Authenticated | Immediate incident impact radius & surrounding CCTV evidence |

### Crowd Detection Endpoints
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/api/crowd/analyze` | Authenticated | Upload frame for crowd + object inventory analysis |
| `GET` | `/api/crowd/alerts` | Authenticated | Fetch `crowd_surge` alerts (paginated, filterable) |
| `GET` | `/api/crowd/stats` | Authenticated | Aggregate crowd statistics by camera & severity |
| `POST` | `/api/crowd/reset/:camId` | Authenticated | Reset per-camera surge baseline & cooldown |

### AI Microservice Direct Endpoints (port 8000)
| Method | Route | Description |
|---|---|---|
| `POST` | `/process` | Full ANPR pipeline (LP detect → enhance → OCR → attributes) |
| `POST` | `/crowd` | Crowd detection + object inventory on a single frame |
| `POST` | `/crowd/reset/{camera_id}` | Reset in-memory surge baseline for a camera |
| `GET` | `/health` | AI service health & model status |

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
6. **Industry-Grade ANPR:** 6-pass multi-scale detection (direct + 1.25× + 1.75× + vehicle-cascade + 50%-overlap tiles + OCR-guided) with Soft-NMS and OCR confidence boosting — detects every visible plate in complex traffic junction scenes.
7. **High-Accuracy Crowd Intelligence:** Gaussian Soft-NMS + 4-pass tiled inference + occlusion correction estimator + KDE heatmap — counts people in densely packed crowds and additionally provides a full 80-class COCO scene object inventory (cars, trucks, buses, bicycles, etc.).

---

*Developed with pride for the Government of Gujarat Home Department Digital Surveillance Missions.*
