# DrishtiGrid ANPR - PowerShell Setup Script
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  DrishtiGrid - Government CCTV Surveillance & ANPR Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$RootPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Server dependencies
Write-Host "[1/4] Checking Node.js server dependencies..." -ForegroundColor Yellow
Set-Location "$RootPath\server"
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing server packages..."
    npm install
} else {
    Write-Host "Server packages already installed." -ForegroundColor Green
}

# 2. Client dependencies
Write-Host "[2/4] Checking React client dependencies..." -ForegroundColor Yellow
Set-Location "$RootPath\client"
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing client packages..."
    npm install
} else {
    Write-Host "Client packages already installed." -ForegroundColor Green
}

# 3. Python AI Environment
Write-Host "[3/4] Setting up Python virtual environment for AI Microservice..." -ForegroundColor Yellow
Set-Location "$RootPath\ai-service"

$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    Write-Host "[WARNING] Python not found in system PATH. Install Python 3.10-3.12 for local AI execution." -ForegroundColor Red
    Write-Host "DrishtiGrid will run with intelligent fallback simulation until Python is installed." -ForegroundColor Magenta
} else {
    if (-not (Test-Path "venv")) {
        Write-Host "Creating virtual environment in ai-service/venv..."
        python -m venv venv
    }

    $VenvPython = "$RootPath\ai-service\venv\Scripts\python.exe"
    $VenvPip = "$RootPath\ai-service\venv\Scripts\pip.exe"

    if (Test-Path $VenvPip) {
        Write-Host "Installing Python dependencies (PyTorch, YOLOv8, PaddleOCR, Real-ESRGAN)..." -ForegroundColor Cyan
        & $VenvPip install -r requirements.txt

        Write-Host "[4/4] Downloading Pretrained AI Weights..." -ForegroundColor Yellow
        & $VenvPython download_models.py
    } else {
        Write-Host "Installing via system python pip..."
        pip install -r requirements.txt
        python download_models.py
    }
}

Set-Location $RootPath
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "  Run .\start-all.ps1 or start-all.bat to launch DrishtiGrid" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
