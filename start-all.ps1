# Garud - Master Launch Script for PowerShell
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Garud - Gujarat Government CCTV Surveillance & ANPR" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$RootPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. AI Service
$UvicornDotVenv = "$RootPath\ai-service\.venv\Scripts\uvicorn.exe"
$UvicornVenv = "$RootPath\ai-service\venv\Scripts\uvicorn.exe"
if (Test-Path $UvicornDotVenv) {
    Write-Host "[1/3] Starting Python FastAPI AI Service on port 8000..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootPath\ai-service'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --host 0.0.0.0 --port 8000"
} elseif (Test-Path $UvicornVenv) {
    Write-Host "[1/3] Starting Python FastAPI AI Service on port 8000..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootPath\ai-service'; .\venv\Scripts\activate.ps1; uvicorn app.main:app --host 0.0.0.0 --port 8000"
} else {
    Write-Host "[INFO] Python virtual environment not found in ai-service/.venv or ai-service/venv." -ForegroundColor Yellow
    Write-Host "The server will operate in intelligent fallback simulation mode until AI dependencies are installed (see RUN_AND_INSTALL_COMMANDS.txt)." -ForegroundColor DarkGray
}

# 2. Server
Write-Host "[2/3] Starting Node.js Backend Server on port 5001..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootPath\server'; npm run dev"

# 3. Client
Write-Host "[3/3] Starting React Vite Client on port 5173..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootPath\client'; npm run dev"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  All services initialized!" -ForegroundColor Green
Write-Host "  - Client Web Console: http://localhost:5173" -ForegroundColor Green
Write-Host "  - Backend API:        http://localhost:5001/api" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"
