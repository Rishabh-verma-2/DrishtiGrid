#!/usr/bin/env bash
# DrishtiGrid - Dedicated AI Microservice Launch Script for macOS / Linux
echo "============================================================"
echo "  DrishtiGrid - Python FastAPI AI Microservice (:8000)"
echo "  YOLOv8 + Zero-DCE + Real-ESRGAN + PaddleOCR"
echo "============================================================"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$ROOT_DIR/ai-service"

if [ -f "$AI_DIR/.venv/bin/uvicorn" ]; then
    echo "[*] Starting Python AI Service using ai-service/.venv on port 8000..."
    cd "$AI_DIR" && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
elif [ -f "$AI_DIR/venv/bin/uvicorn" ]; then
    echo "[*] Starting Python AI Service using ai-service/venv on port 8000..."
    cd "$AI_DIR" && venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "[ERROR] Python virtual environment not found in ai-service/.venv or ai-service/venv."
    exit 1
fi
