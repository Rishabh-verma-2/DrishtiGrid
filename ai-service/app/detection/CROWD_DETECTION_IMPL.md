# Crowd Detection — Production-Grade Ensemble Reference
> **File location:** `ai-service/app/detection/CROWD_DETECTION_IMPL.md`
> **Core modules:**
> - [crowd_detector.py](./crowd_detector.py) (Orchestration & Ensemble API)
> - [crowd_postprocess.py](./crowd_postprocess.py) (Profiles, Hungarian Association, Fusion)
> - [crowd_tiling.py](./crowd_tiling.py) (Sliding-Window Multi-Scale & Dense Regions)
> - [crowd_density.py](./crowd_density.py) (Pluggable Density Estimation Layer)
> - [crowd_eval.py](./crowd_eval.py) (Quantitative Metrics & Benchmark Harness)
> - [crowd_diagnostics.py](./crowd_diagnostics.py) (Developer Failure Analysis Tool)
> - [TRAINING_GUIDE.md](./TRAINING_GUIDE.md) (Indian CCTV & Crowd Domain Adaptation)

---

## Architecture Overview

```
CCTV Frame (JPEG/PNG)
        │
        ▼
  [Server — Node.js]
  POST /api/crowd/analyze
        │ multipart/form-data
        ▼
  [AI Service — FastAPI / Python :8000]
  POST /crowd
        │
        ▼
  crowd_detector.py: detect_crowd()
        │
        ├─► Pass A: Full-Frame YOLO Inference (imgsz 640–1280 dynamic)
        │     └─ Person detection (class 0)
        │
        ├─► Pass B: Sliced Multi-Scale Sliding-Window Tiling (crowd_tiling.py)
        │     └─ Complete spatial coverage (20–35% overlap, batch inference)
        │
        ├─► Pass C: Dedicated Head Detection Pass
        │     └─ Resolves occluded individuals with heads visible
        │
        ├─► Pass D: Adaptive Dense-Region Refinement
        │     ├─ High head count + low body count
        │     ├─ High pixel occupancy + low person count
        │     └─ High overlap + dense gathering
        │
        ├─► Pass E: Crowd Density Estimation Fallback (crowd_density.py)
        │     ├─ Deep density model (CSRNet / DM-Count / TorchScript) if weights exist
        │     └─ Statistical texture-gradient & spatial frequency fallback
        │
        ├─► Pass F: Post-Processing & Filtering (crowd_postprocess.py)
        │     ├─ Defensive class filtering
        │     ├─ Contextual profiles: NORMAL, SMALL, OCCLUDED, HEAD_ONLY, EDGE_TRUNCATED
        │     ├─ Source-aware cross-tile deduplication (preserves adjacent dense people)
        │     ├─ Bipartite Hungarian Head-to-Body association (scipy linear_sum_assignment)
        │     └─ Ground-plane camera ROI spatial filtering
        │
        ├─► Pass G: Hybrid Count Fusion & Quality Assessment
        │     ├─ Inputs: detector_count, head_count, density_count, overlap_ratio
        │     ├─ Computes: final_count, uncertainty (±U), fused_confidence, estimation_method
        │     └─ Quality levels: VERY_HIGH, HIGH, MEDIUM, LOW, UNRELIABLE
        │
        ├─► Pass H: Spatial Zone Grid (sum(zones) == final_count) & Surge Baseline
        │
        ├─► Pass I: Video Tracking vs Still Image Decoupling
        │     ├─ Still image (is_video=False): strictly deterministic, no history bleed
        │     └─ Video (is_video=True): trajectory tracking & surge alert hysteresis
        │
        └─► Pass J: Government-Dashboard Visualization Frame (annotated_image_b64)
              └─ Tactical top banner with count, uncertainty, density level, and method
```

---

## Key Modules & Roles

| Module | Role |
|---|---|
| `crowd_detector.py` | Central ensemble pipeline orchestrator with per-stage latency tracking (`timing`) |
| `crowd_postprocess.py` | Contextual profiles, Hungarian association, source-aware dedup, hybrid fusion |
| `crowd_tiling.py` | 100% spatial coverage sliding-window tiles + adaptive dense region reasoning |
| `crowd_density.py` | Pluggable `CrowdDensityEstimator` interface + calibrated texture-head fallback |
| `crowd_eval.py` | Automated MAE, RMSE, MAPE, precision, recall, F1, and tier evaluation |
| `crowd_diagnostics.py` | 4-panel visual failure analysis script for troubleshooting undercounts |
| `TRAINING_GUIDE.md` | Domain adaptation guide for Indian public gatherings, CCTV views, and festivals |

---

## Contextual Validation Profiles

Rather than rejecting detections with rigid global aspect-ratio rules:
- **`NORMAL_PERSON`:** Typical upright pedestrian (aspect ratio 0.70 to 5.50).
- **`SMALL_PERSON`:** Distant tiny pedestrian in high-res CCTV (height $\le 45$px, width $\le 20$px, area $\ge 32\text{px}^2$).
- **`OCCLUDED_PERSON`:** Torso or seated individual (aspect ratio 0.35 to 3.80).
- **`HEAD_ONLY_PERSON`:** Unmatched high-confidence head promoted to occluded individual (aspect ratio 0.45 to 2.00, area $\ge 16\text{px}^2$).
- **`EDGE_TRUNCATED_PERSON`:** Person cutting through image boundary (aspect ratio 0.35 to 6.00).

All rejections are logged with explicit tags in `debug_info["rejected"]` (e.g. `too_small`, `too_large`, `bad_aspect_ratio`, `low_confidence_invalid`, `outside_roi`, `perspective_mismatch`).

---

## Bipartite Hungarian Head-to-Body Association

Each detected head and body computes a multi-feature affinity score:
$$S_{\text{assoc}} = 0.35 S_{\text{horiz}} + 0.35 S_{\text{vert}} + 0.15 S_{\text{size}} + 0.15 S_{\text{overlap}}$$

- Solved globally via `scipy.optimize.linear_sum_assignment(1.0 - S)`
- Associated heads are suppressed to avoid double counting.
- Unassociated heads with confidence $\ge 0.20$ are promoted to `HEAD_ONLY_PERSON` occluded count.

---

## Hybrid Count Fusion & Quality Assessment

Scene regime decides count computation:
1. **Sparse Scene ($< 10$ people):** $final = detector$, uncertainty $\pm 1$, confidence $0.94+$.
2. **Moderate Crowd ($10$–$35$ people):** $final = body + unmatched\_heads$, uncertainty $\approx 8\%$.
3. **Dense / Severely Occluded Crowd ($> 35$ or high overlap):**
   $$final = \text{round}(w_{\text{det}} \cdot (body + head) + w_{\text{dens}} \cdot density\_count)$$
   Where $w_{\text{dens}} \in [0.20, 0.45]$ depending on dense region severity.

### Uncertainty & Quality Exposing
- Never claims "100% accurate".
- Returns:
  ```json
  "quality": {
    "quality": "VERY_HIGH",
    "confidence": 0.92,
    "uncertainty": 5,
    "uncertainty_range": [72, 82],
    "estimation_method": "hybrid_dense_crowd",
    "detector_recall_warning": false
  }
  ```

---

## API Compatibility Guarantee

All existing `POST /crowd` fields are strictly preserved:
- `success`, `detected_count`, `occluded_est`, `total_count`, `crowd_level`, `density_score`, `zones`, `person_detections`, `object_inventory`, `surge`, `annotated_image_b64`, `processing_time_ms`, `error`.

New additive fields:
- `quality`: `{ quality, confidence, uncertainty, uncertainty_range, estimation_method, detector_recall_warning, dense_region_count }`
- `timing`: `{ full_frame_ms, tile_inference_ms, head_inference_ms, dense_region_ms, density_inference_ms, fusion_ms, total_ms }`
- `count_breakdown`: `{ bodies, heads_occluded, density_estimate }`
- `dense_regions`: list of suspicious dense clusters

---

## Running Verification

```bash
# Run 18 core regression tests
python ai-service/tests/test_crowd_detector.py

# Run 20 extended scenario tests
python ai-service/tests/test_crowd_engine_extended.py

# Run quantitative evaluation metrics
python ai-service/app/detection/crowd_eval.py

# Run failure analysis on test image
python ai-service/app/detection/crowd_diagnostics.py
```
