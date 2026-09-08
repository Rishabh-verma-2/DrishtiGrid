@echo off
title DrishtiGrid - Python AI Service (:8000)
echo ============================================================
echo   DrishtiGrid - Python FastAPI AI Microservice (:8000)
echo   YOLOv8 + Zero-DCE + Real-ESRGAN + PaddleOCR
echo ============================================================
echo.

cd /d "%~dp0ai-service"

if exist "venv\Scripts\python.exe" (
    echo [*] Starting Python AI Service using ai-service\venv...
    venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) else if exist ".venv\Scripts\python.exe" (
    echo [*] Starting Python AI Service using ai-service\.venv...
    .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) else (
    echo [ERROR] Virtual environment not found in ai-service\venv or ai-service\.venv
    pause
)
