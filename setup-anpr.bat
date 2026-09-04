@echo off
title DrishtiGrid ANPR - Environment Setup
echo ============================================================
echo   DrishtiGrid - Government CCTV Surveillance ^& ANPR Setup
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/4] Checking Node.js dependencies...
cd server
if not exist "node_modules" (
    echo Installing server dependencies...
    call npm install
) else (
    echo Server dependencies are installed.
)
cd ..

cd client
if not exist "node_modules" (
    echo Installing client dependencies...
    call npm install
) else (
    echo Client dependencies are installed.
)
cd ..

echo.
echo [2/4] Setting up Python Virtual Environment for AI Service...
cd ai-service

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Python was not found in PATH.
    echo Please install Python 3.10-3.12 from python.org to run the local AI pipeline.
    echo The application will continue in fallback simulation mode until Python is installed.
    goto FINISH
)

if not exist "venv" (
    echo Creating virtual environment in ai-service/venv...
    python -m venv venv
)

if exist "venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
)

echo [3/4] Installing Python AI dependencies (PyTorch, YOLOv8, PaddleOCR, Real-ESRGAN)...
echo This may take a few minutes on first run...
pip install -r requirements.txt

echo.
echo [4/4] Downloading Pretrained AI Models...
python download_models.py

:FINISH
cd ..
echo.
echo ============================================================
echo   Setup Complete!
echo   To launch all services, run: start-all.bat
echo ============================================================
pause
