#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/gapwalk_${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

cd "$ROOT_DIR"
docker compose exec -T postgres pg_dump -U gapwalk -d gapwalk | gzip > "$OUT_FILE"
gzip -t "$OUT_FILE"

find "$BACKUP_DIR" -type f -name 'gapwalk_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "Backup created: $OUT_FILE"
