@echo off
rem Backs up the database and uploaded files into %BACKUP_DIR%\<date>, keeping 30 days.
chcp 65001 >nul
cd /d "%~dp0..\.."
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"
if not defined BACKUP_DIR set "BACKUP_DIR=C:\ICP\backups"
if not defined PG_BIN set "PG_BIN=C:\Program Files\PostgreSQL\17\bin"

for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "STAMP=%%T"
set "DEST=%BACKUP_DIR%\%STAMP%"
mkdir "%DEST%" 2>nul

rem libpq does not understand Prisma's ?schema= parameter.
for /f "delims=?" %%U in ("%DATABASE_URL%") do set "PGURL=%%U"
"%PG_BIN%\pg_dump.exe" --format=custom --file="%DEST%\database.dump" --dbname="%PGURL%"
if errorlevel 1 (
  echo [ERROR] Database backup failed.
  exit /b 1
)
if defined STORAGE_PATH robocopy "%STORAGE_PATH:/=\%" "%DEST%\storage" /E /NFL /NDL /NJH /NJS >nul

forfiles /p "%BACKUP_DIR%" /d -30 /c "cmd /c if @isdir==TRUE rmdir /s /q @path" 2>nul
echo Backup saved to %DEST%
exit /b 0
