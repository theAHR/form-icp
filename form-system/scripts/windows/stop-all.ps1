$ErrorActionPreference = "SilentlyContinue"
$patterns = @(
  "scripts\\start.mjs",
  "scripts/start.mjs",
  "npm.cmd start",
  "npm start",
  "backup-members.mjs",
  "cd /d c:\ICP\form-system && npm",
  "cd /d c:\\ICP\\form-system && npm"
)

Get-CimInstance Win32_Process | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  $hit = $false
  foreach ($p in $patterns) {
    if ($cmd -like ("*" + $p + "*")) { $hit = $true; break }
  }
  if ($hit) {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

foreach ($port in 3000) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

# Catch leftover empty titled ICP shells that still hold npm children
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if ($cmd -and ($cmd -match 'npm(\.cmd)? start|form-system')) {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Seconds 1
Write-Host "ICP processes stopped."
