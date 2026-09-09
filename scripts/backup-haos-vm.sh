#!/bin/bash
# backup-haos-vm.sh — Copy the HAOS VM disk image to RVAULT20 and log to Supabase.
#
# Copies haos_generic-aarch64-17.1.img (or unversioned fallback) to
# /Volumes/rvault20/BackupsRS/haos-vm/haos-YYYY-MM-DD.img
# Keeps 7-day rolling retention. Logs each backup to backup_files.
#
# Cron on Alpuca (3:17 AM CT):
#   17 3 * * * PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin \
#     /Users/alpuca/scripts/backup-haos-vm.sh >> /Users/alpuca/logs/haos-vm-backup.log 2>&1
#
# Live image is haos_generic-aarch64-17.1.img — do not hardcode the unversioned name.

set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

DATE=$(date +"%Y-%m-%d")
BACKUP_DIR="/Volumes/rvault20/BackupsRS/haos-vm"
DEST="$BACKUP_DIR/haos-${DATE}.img"
RETENTION_DAYS=7
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
SERVICE="haos-vm-image"

SOURCE=""
for candidate in \
  "$HOME/homeassistant-vm/haos_generic-aarch64-17.1.img" \
  "$HOME/homeassistant-vm/haos_generic-aarch64.img" \
  "$HOME/haos/haos_generic-aarch64.img"; do
  if [ -f "$candidate" ]; then
    SOURCE="$candidate"
    break
  fi
done

ENVFILE="$HOME/.env-alpacapps"
if [ -f "$ENVFILE" ]; then
  export $(grep -v '^#' "$ENVFILE" | grep '=' | xargs) 2>/dev/null || true
fi
SUPABASE_URL="${SUPABASE_URL:-https://aphrrfprbixmhissnjfn.supabase.co}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$SOURCE" ]; then
  echo "$LOG_PREFIX ERROR: HAOS image not found in homeassistant-vm/" >&2
  exit 1
fi

if [ ! -d "/Volumes/rvault20" ] && [ ! -d "/Volumes/RVAULT20" ]; then
  echo "$LOG_PREFIX ERROR: RVAULT20 not mounted" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR" || { echo "$LOG_PREFIX ERROR: cannot create $BACKUP_DIR" >&2; exit 1; }

echo "$LOG_PREFIX Starting HAOS VM backup: $SOURCE → $DEST"
START_TIME=$(date +%s)

if cp "$SOURCE" "$DEST"; then
  cp "$(dirname "$SOURCE")/efi_vars.fd" "$BACKUP_DIR/efi_vars-${DATE}.fd" 2>/dev/null || true
  cp "$(dirname "$SOURCE")/efi_code.fd" "$BACKUP_DIR/efi_code.fd" 2>/dev/null || true
  END_TIME=$(date +%s)
  DURATION=$(( END_TIME - START_TIME ))
  SIZE_BYTES=$(stat -f%z "$DEST" 2>/dev/null || echo 0)
  FILENAME="haos-${DATE}.img"
  echo "$LOG_PREFIX Backup complete: $FILENAME ($(( SIZE_BYTES / 1073741824 )) GB) in ${DURATION}s"
else
  echo "$LOG_PREFIX ERROR: cp failed" >&2
  exit 1
fi

echo "$LOG_PREFIX Enforcing ${RETENTION_DAYS}-day retention..."
ls -1t "$BACKUP_DIR"/haos-*.img 2>/dev/null | tail -n +"$((RETENTION_DAYS + 1))" | while read -r old; do
  DATE_PART="${old##*haos-}"
  DATE_PART="${DATE_PART%.img}"
  echo "$LOG_PREFIX   Pruning $(basename "$old")"
  rm -f "$old" "$BACKUP_DIR/efi_vars-$DATE_PART.fd"
done

if [ -n "$SUPABASE_KEY" ]; then
  curl -sf "$SUPABASE_URL/rest/v1/backup_files" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d "{\"service\":\"${SERVICE}\",\"backup_date\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"filename\":\"${FILENAME}\",\"filepath\":\"${DEST}\",\"size_bytes\":${SIZE_BYTES}}" \
    >/dev/null 2>&1 \
    && echo "$LOG_PREFIX Logged to backup_files" \
    || echo "$LOG_PREFIX Warning: failed to log to Supabase"
fi

echo "$LOG_PREFIX Done."
