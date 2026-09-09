#!/usr/bin/env bash
# DrishtiGrid - Launch all microservices for macOS / Linux
echo "============================================================"
echo "  Starting DrishtiGrid Full Intelligence Stack"
echo "============================================================"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Start AI Service
echo "[*] Launching AI Service (Port 8000)..."
(cd "$ROOT_DIR/ai-service" && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload) &

# Start Backend Server
echo "[*] Launching Node.js Backend Server (Port 5001)..."
(cd "$ROOT_DIR/server" && npm run dev) &

# Start Frontend Client
echo "[*] Launching React Client (Port 5173)..."
(cd "$ROOT_DIR/client" && npm run dev) &

wait
