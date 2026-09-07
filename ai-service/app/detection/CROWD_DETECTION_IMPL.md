# Crowd Detection — Implementation Reference
> **File location:** `e:\DrishtiGrid\ai-service\app\detection\CROWD_DETECTION_IMPL.md`
> **Companion source:** [crowd_detector.py](./crowd_detector.py)

---

## Overview

DrishtiGrid's Crowd Detection pipeline analyses CCTV frames in real time to:
- Count persons in frame
- Classify crowd density (LOW → MEDIUM → HIGH → CRITICAL)
- Map density spatially using a configurable grid
- Detect sudden crowd surges vs. a per-camera rolling baseline
- Produce a richly annotated frame with heatmap overlay and stats panel
- Trigger `crowd_surge` alerts and real-time Socket.IO events when thresholds are breached

---

## Architecture

`
CCTV Frame (JPEG/PNG)
        │
        ▼
  [Server — Node.js]
  POST /api/crowd/analyze         ← client upload
        │
        ▼
  crowdDetectionService.js
  callCrowdAIService()
        │ multipart/form-data
        ▼
  [AI Service — FastAPI / Python]
  POST /crowd                     ← routes.py
        │
        ▼
  crowd_detector.py
  detect_crowd()
        │
        ├─ YOLO inference (persons only, class_id=0)
        ├─ _build_density_grid()      → zone heatmap
        ├─ _get_crowd_level()         → LOW/MEDIUM/HIGH/CRITICAL
        ├─ _compute_density_score()   → 0-1 float
        ├─ _check_surge()             → rolling baseline comparison
        └─ _draw_crowd_annotations()  → annotated frame (base64)
        │
        ▼
  JSON Response
        │
        ▼
  [Server — back in crowdDetectionService.js]
        ├─ io.emit('crowd:analysis', metrics)   ← all dashboard clients
        ├─ Alert.create(crowd_surge)             ← MongoDB (if HIGH/CRITICAL)
        ├─ io.emit('alert:new', alert)           ← dashboard alert panel
        └─ io.emit('crowd:alert', summary)       ← dedicated crowd listeners
        │
        ▼
  [Client — React]
  crowdAPI.analyzeFrame()  →  result displayed on CameraMonitoringPage
  Socket.IO listeners:
    'crowd:analysis'  — live density metrics
    'crowd:alert'     — crowd surge alert banner
    'alert:new'       — unified alerts panel
`

---

## Files Changed / Created

| File | Action | Purpose |
|------|--------|---------|
| `ai-service/app/detection/crowd_detector.py` | NEW | Core detection logic |
| `ai-service/app/api/routes.py` | MODIFIED | POST /crowd + POST /crowd/reset/{id} endpoints |
| `ai-service/app/main.py` | MODIFIED | Warm-up crowd detector at startup |
| `server/src/services/crowdDetectionService.js` | NEW | Bridge service + alert creation |
| `server/src/controllers/crowdController.js` | NEW | REST controller (4 endpoints) |
| `server/src/routes/crowd.js` | NEW | Express router at /api/crowd |
| `server/src/app.js` | MODIFIED | Mount crowd routes |
| `client/src/api/index.js` | MODIFIED | crowdAPI client methods |

---

## AI Detection Algorithm (Python)

### 1. YOLO Person Detection

Uses the already-loaded YOLOv8 model (get_yolo_model()) — no additional model download required.
Person class is filtered via classes=[0] (COCO class 0 = person).

Key params:
  conf_threshold: 0.30 (default)
  iou: 0.45
  classes: [0]  -- persons only
  agnostic_nms: True

Sanity filter: boxes narrower than 8px or shorter than 15px are discarded (noise/artefacts).

### 2. Density Grid

The frame is divided into an R x C grid (default 3 x 4 = 12 zones).
Each person's centroid is assigned to one cell.

Zone density levels:
  clear    : 0-1 persons per cell
  moderate : 2-4 persons per cell
  dense    : 5-9 persons per cell
  critical : 10+ persons per cell

### 3. Crowd Level Classification

  LOW      : 0-4  total persons
  MEDIUM   : 5-14 total persons
  HIGH     : 15-29 total persons
  CRITICAL : 30+ total persons

### 4. Density Score

Normalised float [0,1] based on person count vs. theoretical maximum:
  avg_person_px = max(1800, img_area * 0.002)
  theoretical_max = img_area / avg_person_px
  score = min(1.0, count / theoretical_max)

### 5. Surge Detection

Per-camera sliding window of the last 30 frame counts (in-memory deque).
A surge is flagged when the current count exceeds the rolling mean by >= 50%:
  surge_percent = ((current - baseline_avg) / baseline_avg) * 100
  surge_detected = surge_percent >= 50.0

Minimum 5 samples in the window before surge detection activates.

### 6. Visual Annotation

The annotated frame includes:
  - Per-person bounding boxes coloured by zone density level
  - Semi-transparent zone heatmap overlay (teal -> orange -> red)
  - Subtle grid lines separating density zones
  - Top-left summary panel (count, density %, level badge, timestamp)
  - Surge warning label (red) when a surge is detected

---

## API Reference

### AI Service (FastAPI)

POST /crowd
  Form fields:
    image         : File   (JPEG/PNG, required)
    camera_id     : string (default "default")
    conf_threshold: float  (default 0.30, range 0.15-0.95)
    grid_rows     : int    (default 3, range 1-8)
    grid_cols     : int    (default 4, range 1-8)

  Response shape:
  {
    "success": true,
    "person_count": 23,
    "crowd_level": "HIGH",
    "density_score": 0.42,
    "zones": [{ "row":0, "col":1, "count":8, "level":"dense",
                 "bbox":{"x":320,"y":0,"w":320,"h":240} }],
    "detections": [{ "person_id":1, "bbox":{"x":100,"y":200,"w":60,"h":140},
                     "confidence":0.87 }],
    "surge": { "surge_detected":false, "baseline_avg":18.3, "surge_percent":25.7 },
    "annotated_image_b64": "data:image/jpeg;base64,...",
    "processing_time_ms": 312.4,
    "error": null
  }

POST /crowd/reset/{camera_id}
  Response: { "success": true, "message": "Baseline reset for camera 'cam01'." }

### Server (Node.js REST)

  POST   /api/crowd/analyze       — Upload frame for analysis
  GET    /api/crowd/alerts        — Fetch crowd_surge alerts (paginated)
  GET    /api/crowd/stats         — Aggregated crowd statistics
  POST   /api/crowd/reset/:camId  — Reset camera baseline + cooldown

### Client (React)

  import { crowdAPI } from '../api';

  // On-demand frame analysis
  const result = await crowdAPI.analyzeFrame(imageFile, 'cam01', { confThreshold: 0.30 });

  // Crowd alerts
  const alerts = await crowdAPI.getAlerts({ status: 'active', limit: 20 });

  // Stats
  const stats = await crowdAPI.getStats();

  // Reset baseline
  await crowdAPI.resetBaseline('cam01');

Socket.IO Events:
  socket.on('crowd:analysis', (data) => { ... });  // live density metrics
  socket.on('crowd:alert', (data) => { ... });      // surge alert summary
  socket.on('alert:new', (alert) => { ... });       // unified alerts (type=crowd_surge)

---

## Alert Logic

Alerts are created in MongoDB (Alert collection) when:
  - crowd_level is HIGH or CRITICAL, OR
  - surge.surge_detected === true

Cooldown: One alert per camera per 60 seconds (ALERT_COOLDOWN_MS in crowdDetectionService.js).

Severity mapping:
  LOW      -> info
  MEDIUM   -> low
  HIGH     -> medium
  CRITICAL -> critical

---

## Configuration Constants

In crowd_detector.py:
  CROWD_THRESHOLDS = { LOW:0, MEDIUM:5, HIGH:15, CRITICAL:30 }
  ZONE_THRESHOLDS  = { clear:0, moderate:2, dense:5, critical:10 }
  SURGE_THRESHOLD_PERCENT = 50.0
  BASELINE_WINDOW_SIZE    = 30
  DEFAULT_GRID_ROWS       = 3
  DEFAULT_GRID_COLS       = 4

In crowdDetectionService.js:
  ALERT_COOLDOWN_MS = 60 * 1000   // 60 seconds

---

## Dependencies (no new installs needed)

  ultralytics    — YOLOv8 inference (person detection, class 0)
  opencv-python  — Frame decoding, annotation drawing
  numpy          — Array operations, density scoring
  torch          — GPU acceleration (optional)

The crowd detector REUSES the already-loaded YOLO model from yolo_detector.py
via get_yolo_model(), so startup time is unaffected.

---

## Extending the Module

Add new crowd level:
  Edit CROWD_THRESHOLDS in crowd_detector.py and
  CROWD_SEVERITY_MAP in crowdDetectionService.js.

Integrate with video pipeline (optional):
  In videoService.js, after each frame is processed by ANPR:
    const { analyzeCrowdFrame } = require('./crowdDetectionService');
    await analyzeCrowdFrame({ imageBuffer: frameBuffer, cameraId, io });

Persist historical density data:
  Add CrowdDensityLog Mongoose model with fields:
    cameraId, timestamp, person_count, crowd_level, density_score, zones
  Create entries in crowdDetectionService.js after each successful analysis.

---
Generated: 2026-09-07 | DrishtiGrid AI Service v1.0.0
