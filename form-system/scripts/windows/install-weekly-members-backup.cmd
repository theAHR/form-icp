@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
set "TR=%NODE% --env-file-if-exists=.env scripts\backup-members.mjs check"
schtasks /Create /TN "ICP-MembersWeeklyBackup" /SC WEEKLY /D SUN /ST 02:15 /RL LIMITED /F /TR "cmd /c cd /d \"%~dp0..\..\" && %TR%"
if errorlevel 1 (
  echo [ERROR] Could not create scheduled task. Run as Administrator if needed.
  exit /b 1
)
echo Weekly members backup task installed: ICP-MembersWeeklyBackup
echo Runs every Sunday at 02:15 and skips if a backup already exists within 7 days.
exit /b 0
