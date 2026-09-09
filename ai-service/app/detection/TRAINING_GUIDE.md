# DrishtiGrid Custom Crowd Model Training & Domain Adaptation Guide

This guide provides the complete engineering specifications, dataset curation guidelines, augmentation recipes, and training hyperparameters for training custom YOLOv8 / YOLO11 and Crowd Density estimation models tailored for **Indian public gatherings and government surveillance environments**.

---

## 1. Target Operational Domains

DrishtiGrid models operate under distinct visual conditions compared to Western benchmarks (e.g. MOT / COCO):
1. **High-Density Religious & Festival Gatherings:** Kumbh Mela, Durga Puja, Eid processions, Rath Yatra — severe mutual occlusion, colorful traditional attire, heads visible without lower bodies.
2. **Transit Hubs:** Railway station concourses, suburban railway platforms (e.g. Mumbai local, Howrah), inter-state bus terminals — high-angle perspective, dynamic motion blur, luggage/overhead obstacles.
3. **Marketplaces & Bazaars:** Chandni Chowk, Crawford Market — tight street geometry, mixed pedestrian and two-wheeler traffic, sun shades and awnings.
4. **Traffic Intersections:** Pedestrian zebra crossing surges, mixed vehicular and pedestrian streams.
5. **CCTV Perspective Views:** Pole-mounted cameras at 4m–12m elevation with steep downward tilt angles (25°–60°), producing trapezoidal perspective compression where distant people appear as small as 6x14 pixels.

---

## 2. Dataset Formats & Annotation Taxonomy

### Annotation Standards
We support two concurrent annotation modalities:
1. **Full Body Bounding Box (`person`):**
   * Format: YOLO normalized `[0, x_center, y_center, width, height]`
   * Visible human boundary from head apex to ground contact plane (feet/base).
2. **Head Bounding Box (`head`):**
   * Format: YOLO normalized `[1, x_center, y_center, width, height]`
   * Cranium boundary from chin/jawline to crown, including hair/turbans/headscarves.

### Recommended Source Datasets for Pretraining
- **CrowdHuman:** 15,000 images with 470,000 person instances (average 23 persons per image) with full body and head annotations.
- **WIDER Face / Head:** For resolving low-resolution and heavily occluded heads.
- **ShanghaiTech (Part A & B) & UCF-QNRF:** Density map regression benchmarks for extreme crowds (500–4000 people per scene).
- **DrishtiGrid CCTV Custom Dataset:** 5,000 domain-specific frames captured from Indian municipal and highway surveillance cameras.

---

## 3. YOLO Training Configuration (`data.yaml`)

```yaml
path: /path/to/drishtigrid_crowd_data
train: images/train
val: images/val
test: images/test

names:
  0: person
  1: head
```

### Hyperparameters (`hyp_crowd.yaml`)
Tuned specifically for dense gatherings and small distant individuals:

```yaml
lr0: 0.01                 # Initial learning rate (SGD)
lrf: 0.01                 # Final learning rate fraction
momentum: 0.937           # SGD momentum
weight_decay: 0.0005      # Optimizer weight decay
warmup_epochs: 3.0        # Warmup epochs
warmup_momentum: 0.8      # Warmup initial momentum
box: 7.5                  # Box loss gain (higher to enforce precise boundaries)
cls: 0.5                  # Class loss gain
dfl: 1.5                  # Distribution focal loss gain
hsv_h: 0.015              # HSV-Hue augmentation
hsv_s: 0.7                # HSV-Saturation augmentation (handles colorful clothing)
hsv_v: 0.4                # HSV-Value augmentation (handles daylight to twilight transition)
degrees: 0.0              # Minimal rotation for upright CCTV pedestrians
translate: 0.1            # Translation augmentation
scale: 0.6                # Multi-scale augmentation (0.4 to 1.6 scale range)
shear: 0.0                # Minimal shear
perspective: 0.0005       # Perspective transformation matching angled CCTV
flipud: 0.0               # No upside-down people
fliplr: 0.5               # Left-right flip
mosaic: 1.0               # Mosaic augmentation (combines 4 images to simulate higher density)
mixup: 0.15               # Mixup augmentation to simulate transparent/overlapping occlusions
copy_paste: 0.20          # Copy-paste pedestrians into dense backgrounds
```

---

## 4. Execution Commands

### Training YOLOv8x / YOLO11x Person & Head Detector
```bash
# Using Ultralytics CLI
yolo detect train \
  data=data.yaml \
  model=yolov8n.pt \
  epochs=150 \
  batch=16 \
  imgsz=1280 \
  device=0 \
  optimizer=SGD \
  cos_lr=True \
  save=True \
  project=drishtigrid_crowd \
  name=crowd_yolov8n_v1
```

### Export to Optimized ONNX / TensorRT
For low-latency CCTV edge deployment:
```bash
yolo export \
  model=drishtigrid_crowd/crowd_yolov8n_v1/weights/best.pt \
  format=onnx \
  dynamic=False \
  imgsz=1280 \
  simplify=True
```

---

## 5. Model Integration into DrishtiGrid

Place the trained model weights into:
- `ai-service/model_weights/crowdhuman_yolov8n.pt` (Person Model)
- `ai-service/model_weights/crowd_head_yolov8n.pt` (Head Model)
- `ai-service/model_weights/crowd_density.pt` (Density Model, TorchScript format)

The service automatically detects and loads these models at startup via singleton cached loaders, while falling back gracefully to base models if custom weights are not present.
