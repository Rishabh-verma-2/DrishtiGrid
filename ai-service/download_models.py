"""
Model weight downloader for ANPR AI Service.

Usage:
  python download_models.py                    # Download all models
  python download_models.py --model yolo       # Download only YOLO LP weights
  python download_models.py --model zero_dce   # Download only Zero-DCE weights
  python download_models.py --model realesrgan # Download only Real-ESRGAN weights
"""

import argparse
import hashlib
import os
import sys
from pathlib import Path
from urllib.request import urlretrieve

WEIGHTS_DIR = Path(__file__).parent / "model_weights"
WEIGHTS_DIR.mkdir(exist_ok=True)

MODELS = {
    "yolo": {
        "description": "YOLOv8n COCO (generic vehicle detector, fallback)",
        "url": "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt",
        "dest": WEIGHTS_DIR / "yolov8n.pt",
        "note": (
            "For best results, also download a dedicated license plate detector.\n"
            "  Recommended: https://github.com/Muhammad-Zafar-Khan/License-Plate-Detector\n"
            "  Save as: model_weights/license_plate_detector.pt\n"
            "  Then set YOLO_MODEL_PREFERENCE=lp in your environment."
        ),
    },
    "zero_dce": {
        "description": "Zero-DCE pretrained weights (low-light enhancement)",
        "url": (
            "https://github.com/Li-Chongyi/Zero-DCE/raw/master/Zero-DCE_code/snapshots/Epoch99.pth"
        ),
        "dest": WEIGHTS_DIR / "zero_dce.pth",
        "note": (
            "If this URL is unavailable, visit:\n"
            "  https://github.com/Li-Chongyi/Zero-DCE\n"
            "and download the pretrained model manually."
        ),
    },
    "realesrgan": {
        "description": "Real-ESRGAN x4plus pretrained weights (super-resolution)",
        "url": (
            "https://github.com/xinntao/Real-ESRGAN/releases/download/"
            "v0.1.0/RealESRGAN_x4plus.pth"
        ),
        "dest": WEIGHTS_DIR / "RealESRGAN_x4plus.pth",
        "note": "Official Real-ESRGAN x4 upscaling model.",
    },
}


def _progress_hook(block_num, block_size, total_size):
    downloaded = block_num * block_size
    if total_size > 0:
        pct = min(100, downloaded * 100 // total_size)
        bar = "#" * (pct // 2) + "-" * (50 - pct // 2)
        print(f"\r  [{bar}] {pct:3d}%  ({downloaded/1e6:.1f}/{total_size/1e6:.1f} MB)",
              end="", flush=True)
    else:
        print(f"\r  Downloaded {downloaded/1e6:.1f} MB", end="", flush=True)


def download_model(key: str):
    if key not in MODELS:
        print(f"Unknown model key: {key}. Available: {list(MODELS.keys())}")
        return

    info = MODELS[key]
    dest: Path = Path(info["dest"])
    url: str = str(info["url"])

    print(f"\n{'='*60}")
    print(f"Model: {key}")
    print(f"Description: {info['description']}")
    print(f"URL: {url}")
    print(f"Destination: {dest}")

    if dest.exists():
        print(f"  [OK] Already exists ({dest.stat().st_size / 1e6:.1f} MB) - skipping.")
        if info.get("note"):
            print(f"  Note: {info['note']}")
        return

    try:
        print(f"  Downloading...")
        from urllib.request import Request, urlopen
        req = Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        with urlopen(req) as response, open(dest, "wb") as out_file:
            total_size = int(response.headers.get("content-length", 0))
            downloaded = 0
            block_size = 65536
            while True:
                buffer = response.read(block_size)
                if not buffer:
                    break
                downloaded += len(buffer)
                out_file.write(buffer)
                if total_size > 0:
                    pct = min(100, downloaded * 100 // total_size)
                    bar = "#" * (pct // 2) + "-" * (50 - pct // 2)
                    print(f"\r  [{bar}] {pct:3d}%  ({downloaded/1e6:.1f}/{total_size/1e6:.1f} MB)", end="", flush=True)
                else:
                    print(f"\r  Downloaded {downloaded/1e6:.1f} MB", end="", flush=True)

        print(f"\n  [OK] Saved to {dest} ({dest.stat().st_size / 1e6:.1f} MB)")
    except Exception as e:
        print(f"\n  [FAILED] Download failed: {e}")
        if info.get("note"):
            print(f"  Note: {info['note']}")

    if info.get("note"):
        print(f"  Note: {info['note']}")


def main():
    parser = argparse.ArgumentParser(description="Download ANPR model weights")
    parser.add_argument(
        "--model",
        choices=list(MODELS.keys()) + ["all"],
        default="all",
        help="Which model to download (default: all)",
    )
    args = parser.parse_args()

    keys = list(MODELS.keys()) if args.model == "all" else [args.model]
    for key in keys:
        download_model(key)

    print("\n" + "="*60)
    print("Done. Start the AI service with:")
    print("  uvicorn app.main:app --host 0.0.0.0 --port 8000")


if __name__ == "__main__":
    main()
