#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 2 ]]; then echo "Usage: CONFIRM_RESTORE=yes bash scripts/restore.sh DB.dump FILES.tar.gz"; exit 1; fi
[[ "${CONFIRM_RESTORE:-}" == yes ]] || { echo 'Restore overwrites the database and file storage. Set CONFIRM_RESTORE=yes after verifying backups.'; exit 1; }
[[ -f "$1" && -f "$2" ]] || { echo 'Backup files missing'; exit 1; }
# Intentionally leave writers stopped after restore; an operator verifies before restart.
docker compose stop app
# Audit and immutable triggers are removed/recreated by the full pg_restore schema.
docker compose exec -T postgres pg_restore -U membership -d membership --clean --if-exists --exit-on-error < "$1"
docker compose run --rm --no-deps -T --entrypoint sh app -c 'find /app/storage -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
docker compose run --rm --no-deps -T --entrypoint tar app -xzf - -C /app/storage < "$2"
echo 'Restore completed. Verify DB/file pair, revoke sessions, then start app.'
