@echo off
title DrishtiGrid - Master Launch Controller
echo ============================================================
echo   DrishtiGrid - Gujarat Government CCTV Surveillance ^& ANPR
echo ============================================================
echo.

cd /d "%~dp0"

:: 1. Launch Python AI Service (if configured)
if exist "ai-service\.venv\Scripts\uvicorn.exe" (
    echo [1/3] Starting Python FastAPI AI Service on port 8000...
    start "DrishtiGrid - Python AI Service (:8000)" cmd /k "cd ai-service && call .venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000"
) else if exist "ai-service\venv\Scripts\uvicorn.exe" (
    echo [1/3] Starting Python FastAPI AI Service on port 8000...
    start "DrishtiGrid - Python AI Service (:8000)" cmd /k "cd ai-service && call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000"
) else (
    echo [INFO] Python venv not found. Node.js backend will run with intelligent ANPR simulation fallback.
    echo To enable the full local deep-learning AI pipeline, see RUN_AND_INSTALL_COMMANDS.txt
)

:: 2. Launch Node.js Backend Server
echo [2/3] Starting DrishtiGrid Node.js Express Backend on port 5001...
start "DrishtiGrid - Backend Server (:5001)" cmd /k "cd server && npm run dev"

:: 3. Launch React Vite Frontend Client
echo [3/3] Starting DrishtiGrid React Client on port 5173...
start "DrishtiGrid - Client Frontend (:5173)" cmd /k "cd client && npm run dev"

echo.
echo ============================================================
echo   All DrishtiGrid services launched!
echo   - Web Console:   http://localhost:5173
echo   - Backend API:   http://localhost:5001/api
echo   - AI Service:    http://localhost:8000/health
echo ============================================================
echo Opening browser in 4 seconds...
timeout /t 4 /nobreak >nul
start http://localhost:5173
