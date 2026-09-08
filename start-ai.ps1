# DrishtiGrid - Dedicated AI Microservice Launch Script
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  DrishtiGrid - Python FastAPI AI Microservice (:8000)" -ForegroundColor Cyan
Write-Host "  YOLOv8 + Zero-DCE + Real-ESRGAN + PaddleOCR" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$RootPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$AiPath = "$RootPath\ai-service"

$PythonVenv = "$AiPath\venv\Scripts\python.exe"
$PythonDotVenv = "$AiPath\.venv\Scripts\python.exe"

if (Test-Path $PythonVenv) {
    Write-Host "[*] Starting Python AI Service using ai-service\venv on port 8000..." -ForegroundColor Yellow
    Set-Location $AiPath
    & $PythonVenv -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
} elseif (Test-Path $PythonDotVenv) {
    Write-Host "[*] Starting Python AI Service using ai-service\.venv on port 8000..." -ForegroundColor Yellow
    Set-Location $AiPath
    & $PythonDotVenv -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
} else {
    Write-Host "[ERROR] Python virtual environment not found in ai-service/venv or ai-service/.venv" -ForegroundColor Red
}
