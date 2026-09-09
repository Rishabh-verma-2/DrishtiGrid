"""
Crowd Detection Failure Analysis & Diagnostics Tool
===================================================

Generates comprehensive diagnostic reports and visual multi-panel breakdown
for any crowd image to explain:
- Raw detections vs validated vs rejected candidates
- Head detections and head-to-body association matches
- Density heatmap and spatial energy distribution
- Suspicious dense regions triggered for high-resolution refinement
- Duplicate merges and rejected candidate breakdown
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Union

import cv2
import numpy as np

# Ensure app is on sys.path
current_dir = Path(__file__).resolve().parent
ai_service_dir = current_dir.parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from app.detection.crowd_detector import detect_crowd
from app.detection.crowd_density import get_density_estimator

logger = logging.getLogger(__name__)


def _decode_b64(b64_str: str) -> Optional[np.ndarray]:
    """Decode base64 URI or string to BGR numpy array."""
    try:
        import base64
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        raw = base64.b64decode(b64_str)
        arr = np.frombuffer(raw, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def run_failure_analysis(
    image_path: Union[str, Path],
    output_dir: Optional[Union[str, Path]] = None,
    conf_threshold: float = 0.15,
) -> Dict[str, Any]:
    """
    Perform deep failure analysis on a single image.
    Generates a 2x2 diagnostic visual composite and detailed JSON report.
    """
    img_path = Path(image_path)
    if not img_path.exists():
        raise FileNotFoundError(f"Image not found: {img_path}")

    image = cv2.imread(str(img_path))
    if image is None:
        raise ValueError(f"Could not read image from {img_path}")

    img_h, img_w = image.shape[:2]

    # Run detection with full diagnostics enabled
    result = detect_crowd(
        image=image,
        camera_id="diagnostic_run",
        conf_threshold=conf_threshold,
        is_video=False,
        enable_tiles=True,
        use_density=True,
        debug=True,
    )

    # 1. Density Map visualization
    density_estimator = get_density_estimator()
    density_map, density_count, density_conf = density_estimator.estimate(image)
    map_resized = cv2.resize(density_map, (img_w, img_h), interpolation=cv2.INTER_CUBIC)
    map_uint8 = np.clip(map_resized * 255.0, 0, 255).astype(np.uint8)
    heatmap_colored = cv2.applyColorMap(map_uint8, cv2.COLORMAP_JET)
    heatmap_overlay = cv2.addWeighted(image, 0.60, heatmap_colored, 0.40, 0)

    # 2. Raw Detections Panel
    raw_panel = image.copy()
    cv2.putText(
        raw_panel, "1. ORIGINAL / RAW SCENE", (15, 30),
        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA
    )

    # 3. Head vs Body Associations Panel
    assoc_panel = image.copy()
    for det in result.get("person_detections", []):
        b = det["bbox"]
        x, y, w, h = b["x"], b["y"], b["w"], b["h"]
        is_head = det.get("type") == "head_visible"
        color = (0, 195, 255) if is_head else (0, 230, 115)
        cv2.rectangle(assoc_panel, (x, y), (x + w, y + h), color, 2)

    cv2.putText(
        assoc_panel, f"2. BODIES ({result['detected_count']}) & HEADS ({result['occluded_est']})",
        (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA
    )

    # 4. Density Map Panel
    cv2.putText(
        heatmap_overlay, f"3. SPATIAL DENSITY MAP (Est: {density_count:.1f})", (15, 30),
        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA
    )

    # 5. Final Annotated Frame Panel
    decoded = _decode_b64(result.get("annotated_image_b64", ""))
    final_panel = decoded if decoded is not None else image.copy()

    # Create 2x2 Composite Diagnostic Canvas
    canvas_w = min(1920, img_w * 2)
    canvas_h = min(1080, img_h * 2)
    sub_w = canvas_w // 2
    sub_h = canvas_h // 2

    p1 = cv2.resize(raw_panel, (sub_w, sub_h))
    p2 = cv2.resize(assoc_panel, (sub_w, sub_h))
    p3 = cv2.resize(heatmap_overlay, (sub_w, sub_h))
    p4 = cv2.resize(final_panel, (sub_w, sub_h))

    composite = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
    composite[0:sub_h, 0:sub_w] = p1
    composite[0:sub_h, sub_w:canvas_w] = p2
    composite[sub_h:canvas_h, 0:sub_w] = p3
    composite[sub_h:canvas_h, sub_w:canvas_w] = p4

    # Save outputs if directory provided
    out_dir = Path(output_dir) if output_dir else ai_service_dir / "temp"
    out_dir.mkdir(parents=True, exist_ok=True)

    composite_path = out_dir / f"diagnostic_{img_path.stem}.jpg"
    cv2.imwrite(str(composite_path), composite)

    report = {
        "image_name": img_path.name,
        "composite_image_path": str(composite_path),
        "final_count": result["total_count"],
        "detector_count": result["detected_count"],
        "head_count": result["occluded_est"],
        "density_count": density_count,
        "crowd_level": result["crowd_level"],
        "quality": result.get("quality", {}),
        "timing": result.get("timing", {}),
        "dense_regions_detected": len(result.get("dense_regions", [])),
        "debug_info": result.get("debug_info", {}),
    }

    return report


if __name__ == "__main__":
    sample_img = ai_service_dir / "test_crowd_frame.jpg"
    if sample_img.exists():
        print(f"Running diagnostic analysis on {sample_img}...")
        res = run_failure_analysis(sample_img)
        print(json.dumps(res, indent=2))
    else:
        print("Usage: python -m app.detection.crowd_diagnostics <image_path>")
