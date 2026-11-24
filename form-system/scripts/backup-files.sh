#!/usr/bin/env bash
set -euo pipefail
umask 077
out="${1:-backups}"
mkdir -p "$out"
file="$out/files-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
docker compose run --rm --no-deps -T --entrypoint tar app -czf - -C /app/storage . > "$file.tmp"
mv "$file.tmp" "$file"
echo "File backup: $file"
