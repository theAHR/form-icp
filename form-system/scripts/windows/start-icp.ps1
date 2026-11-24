# Starts ICP after PostgreSQL is ready. Used by login/startup and Task Scheduler.
param([switch]$ShowWindow)

$ErrorActionPreference = "Stop"

function Test-TcpPort([string]$HostName, [int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(500, $false)
    if (-not $ok) { return $false }
    $client.EndConnect($iar) | Out-Null
    return $true
  }
  catch {
    return $false
  }
  finally {
    $client.Close()
  }
}

$scriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptsDir "..\..")
$logDir = "C:\ICP\logs"
$startupLog = Join-Path $logDir "icp-startup.log"
$appLog = Join-Path $logDir "icp-app.log"

function Write-Log([string]$Message) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  Add-Content -Path $startupLog -Value $line -Encoding UTF8
}

try {
  Set-Location $root

  if (-not (Test-Path (Join-Path $root ".env"))) {
    Write-Log "ERROR: .env not found in $root"
    exit 1
  }

  $nodeDir = Join-Path ${env:ProgramFiles} "nodejs"
  $node = Join-Path $nodeDir "node.exe"
  $npm = Join-Path $nodeDir "npm.cmd"
  if (-not (Test-Path $node)) {
    $node = (Get-Command node -ErrorAction Stop).Source
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  }
  $env:Path = "$nodeDir;$env:Path"

  Write-Log "Waiting for PostgreSQL on port 5432..."
  $deadline = (Get-Date).AddMinutes(3)
  $pgReady = $false
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort "127.0.0.1" 5432) {
      $pgReady = $true
      break
    }
    Start-Sleep -Seconds 2
  }
  if (-not $pgReady) {
    Write-Log "ERROR: PostgreSQL did not become ready within 3 minutes."
    exit 1
  }
  Write-Log "PostgreSQL is ready."

  Write-Log "Stopping previous ICP processes..."
  & (Join-Path $scriptsDir "stop-all.ps1") | Out-Null
  Start-Sleep -Seconds 2

  $listen = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($listen) {
    Write-Log "Port 3000 already in use; assuming ICP is running."
    exit 0
  }

  Write-Log "Starting ICP app (npm start)..."
  if ($ShowWindow) {
    Start-Process -FilePath "cmd.exe" -ArgumentList '/k', "title ICP - App (do not close) && npm start" `
      -WorkingDirectory $root
  }
  else {
    Start-Process -FilePath "cmd.exe" `
      -ArgumentList '/c', "npm start >> `"$appLog`" 2>&1" `
      -WorkingDirectory $root `
      -WindowStyle Hidden | Out-Null
  }

  Start-Sleep -Seconds 8
  $listen = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($listen) {
    Write-Log "ICP started successfully on port 3000."
    exit 0
  }

  Write-Log "ERROR: ICP did not listen on port 3000. See $appLog"
  exit 1
}
catch {
  Write-Log ("ERROR: $($_.Exception.Message)")
  exit 1
}
