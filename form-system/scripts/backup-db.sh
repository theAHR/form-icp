#!/usr/bin/env bash
set -euo pipefail
umask 077
out="${1:-backups}"
mkdir -p "$out"
file="$out/database-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T postgres pg_dump -U membership -d membership -Fc > "$file.tmp"
mv "$file.tmp" "$file"
echo "Database backup: $file"
