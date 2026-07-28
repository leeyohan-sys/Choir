@echo off
setlocal

cd /d "%~dp0"

echo [Choir] Starting local run...
set "PORT=3000"

netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
  set "PORT=3021"
  echo [Choir] Port 3000 is busy, using 3021
)

if not exist "node_modules" (
  echo [Choir] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [Choir] npm install failed
    pause
    exit /b 1
  )
)

echo [Choir] Starting server at http://localhost:%PORT%
echo [Choir] A new terminal window will open.
start "Choir Server" cmd /k "cd /d %~dp0 && set PORT=%PORT% && npm start"

endlocal
