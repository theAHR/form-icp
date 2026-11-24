@echo off
rem Starts the web app (manual: visible window; same wait-for-DB logic as autostart).
setlocal
chcp 65001 >nul
cd /d "%~dp0..\.."
if not exist ".env" (
  echo [ERROR] .env not found in %CD%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-icp.ps1" -ShowWindow
if errorlevel 1 (
  echo [ERROR] Startup failed. See C:\ICP\logs\icp-startup.log and icp-app.log
  pause
  exit /b 1
)

echo ICP is running on port 3000.
exit /b 0
