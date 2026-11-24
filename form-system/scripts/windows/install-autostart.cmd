@echo off
rem Registers ICP to start automatically at Windows logon (Task Scheduler).
rem Also removes the old Startup-folder shortcut if present.
chcp 65001 >nul
cd /d "%~dp0"

set "PS1=%~dp0start-icp.ps1"
set "TASK=ICP-Membership-AutoStart"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$ps1 = '%PS1%';" ^
  "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $ps1 + '\"');" ^
  "$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME;" ^
  "$trigger.Delay = 'PT1M';" ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable;" ^
  "Register-ScheduledTask -TaskName '%TASK%' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null;" ^
  "$startup = [Environment]::GetFolderPath('Startup');" ^
  "$lnk = Join-Path $startup 'ICP Membership.lnk';" ^
  "if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host 'Removed old Startup shortcut.'; }" ^
  "Write-Host 'Autostart installed: %TASK%'"

if errorlevel 1 (
  echo [ERROR] Could not create scheduled task.
  exit /b 1
)
echo Runs 1 minute after Windows logon. Logs: C:\ICP\logs\
exit /b 0
