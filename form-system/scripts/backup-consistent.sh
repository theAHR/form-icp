#!/usr/bin/env bash
set -euo pipefail
# Record running services, stop writers, restore only the services that were running.
mapfile -t running < <(docker compose ps --status running --services | grep -E '^app$' || true)
restart() { if ((${#running[@]})); then docker compose start "${running[@]}"; fi; }
trap restart EXIT
if ((${#running[@]})); then docker compose stop "${running[@]}"; fi
out="${1:-backups}/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$out"
bash scripts/backup-db.sh "$out"
bash scripts/backup-files.sh "$out"
(cd "$out" && sha256sum *.dump *.tar.gz > SHA256SUMS)
echo "Consistent backup pair: $out"
