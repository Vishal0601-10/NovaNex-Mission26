@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  echo Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
echo Starting NovaNex MSME Working-Capital Engine...
echo Open http://127.0.0.1:8080 in your browser.
node server\productionServer.js
pause
