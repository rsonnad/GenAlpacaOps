#!/bin/bash
# backup-watchdog.sh — Self-healing backup monitor.
#
# Detects stale/failed AlpacApps backups on Alpuca, applies deterministic
# repairs, re-queues the poller, and (last resort) asks Claude CLI to fix.
# Emails rahulioson@gmail.com via Resend only after 2 days of still being
# unable to get backups working. Repeats at most once per 24h after that.
#
# Runs hourly via cron on Alpuca:
#   30 * * * * PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin /Users/alpuca/scripts/backup-watchdog.sh >> /Users/alpuca/logs/backup-watchdog.log 2>&1
#
# Requires: ~/.env-alpacapps, curl, python3. Optional: claude CLI, Resend key.

set -uo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')] [backup-watchdog]"
LOCK_FILE="/tmp/backup-watchdog.lock"
STATE_FILE="$HOME/logs/backup-watchdog-state.json"
HEARTBEAT_FILE="$HOME/logs/backup-trigger-poller.heartbeat"
ALERT_EMAIL="rahulioson@gmail.com"
ALERT_FROM="notifications@alpacaplayhouse.com"
UNHEALTHY_SECS=$((2 * 24 * 3600))   # email only after 2 days of failed repair
EMAIL_COOLDOWN_SECS=$((24 * 3600))  # at most one email per day after that
POLLER_STALE_SECS=900               # 15 min — cron is */5
WEEKLY_STALE_DAYS=9                 # weekly job; warn if last success >9 days
DAILY_STALE_DAYS=2
SB_URL="${SUPABASE_URL:-https://aphrrfprbixmhissnjfn.supabase.co}"

mkdir -p "$HOME/logs"

# Load env
ENVFILE="$HOME/.env-alpacapps"
if [ -f "$ENVFILE" ]; then
  export $(grep -v '^#' "$ENVFILE" | grep '=' | xargs) 2>/dev/null || true
fi

SB_URL="${SUPABASE_URL:-$SB_URL}"
SB_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$SB_KEY" ]; then
  echo "$LOG_PREFIX ERROR: SUPABASE_SERVICE_ROLE_KEY not set" >&2
  exit 1
fi

# ── Lock file (prevent concurrent runs) ──────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -f%m "$LOCK_FILE") ))
  if [ "$LOCK_AGE" -gt 3600 ]; then
    echo "$LOG_PREFIX Stale lock (${LOCK_AGE}s) — removing"
    rm -f "$LOCK_FILE"
  else
    echo "$LOG_PREFIX Already running (lock age: ${LOCK_AGE}s) — skipping"
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

sb_get() {
  curl -sf "$SB_URL/rest/v1/$1" \
    -H "apikey: $SB_KEY" \
    -H "Authorization: Bearer $SB_KEY"
}

iso_now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

now_epoch=$(date +%s)

# ── Collect last successful backup per service ───────────────────────
echo "$LOG_PREFIX Checking backup freshness (not just 24h trigger failures)..."

FILES_JSON=$(sb_get "backup_files?select=service,backup_date,filename,size_bytes&order=backup_date.desc&limit=200" 2>/dev/null || echo "[]")
TRIGGERS_JSON=$(sb_get "backup_triggers?select=id,service,status,requested_at,completed_at,result,notes&order=requested_at.desc&limit=50" 2>/dev/null || echo "[]")

DIAG_FILE="/tmp/backup-watchdog-diag.txt"
NEEDS_FIX=$(FILES_JSON="$FILES_JSON" TRIGGERS_JSON="$TRIGGERS_JSON" \
  WEEKLY_STALE_DAYS="$WEEKLY_STALE_DAYS" DAILY_STALE_DAYS="$DAILY_STALE_DAYS" \
  HEARTBEAT_FILE="$HEARTBEAT_FILE" POLLER_STALE_SECS="$POLLER_STALE_SECS" \
  WEEKLY_LOG="$HOME/logs/alpacapps-backup.log" NOW="$now_epoch" python3 - << 'PY'
import json, os, sys, time
from datetime import datetime, timezone

now = int(os.environ["NOW"])
weekly_days = int(os.environ["WEEKLY_STALE_DAYS"])
daily_days = int(os.environ["DAILY_STALE_DAYS"])

services = {
    "supabase-db": weekly_days,
    "cloudflare-r2": weekly_days,
    "cloudflare-d1": weekly_days,
    "github-repo": weekly_days,
    "haos-vm-image": daily_days,
}

try:
    files = json.loads(os.environ.get("FILES_JSON") or "[]")
except Exception:
    files = []
try:
    triggers = json.loads(os.environ.get("TRIGGERS_JSON") or "[]")
except Exception:
    triggers = []

latest = {}
for row in files:
    svc = row.get("service")
    if svc in services and svc not in latest:
        latest[svc] = row

problems = []

def age_days(iso):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0
    except Exception:
        return None

for svc, max_days in services.items():
    row = latest.get(svc)
    if not row:
        problems.append(f"{svc}: no successful backup_files row on record")
        continue
    days = age_days(row.get("backup_date"))
    if days is None:
        problems.append(f"{svc}: unreadable backup_date {row.get('backup_date')}")
    elif days > max_days:
        problems.append(f"{svc}: last success {row.get('backup_date')} ({days:.1f}d ago, limit {max_days}d) file={row.get('filename')}")

# Stuck pending/running triggers (>30 min)
stuck_cut = 30 * 60
for t in triggers:
    st = t.get("status")
    if st not in ("pending", "running"):
        continue
    ts = t.get("requested_at") or t.get("started_at")
    days = age_days(ts)
    if days is not None and days * 86400 > stuck_cut:
        problems.append(f"trigger {t.get('id')} {t.get('service')} stuck {st} since {ts}")

# Poller heartbeat
hb = os.environ.get("HEARTBEAT_FILE")
stale_secs = int(os.environ.get("POLLER_STALE_SECS") or "900")
if hb and os.path.exists(hb):
    age = now - int(os.path.getmtime(hb))
    if age > stale_secs:
        problems.append(f"poller heartbeat stale ({age}s old, limit {stale_secs}s)")
elif hb:
    problems.append("poller heartbeat file missing — cron may not be firing")

# Weekly log last line
wlog = os.environ.get("WEEKLY_LOG")
if wlog and os.path.exists(wlog):
    try:
        with open(wlog, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 4000))
            tail = f.read().decode("utf-8", "replace").strip().splitlines()
        last = tail[-1] if tail else ""
        if "ERROR:" in last:
            problems.append(f"weekly backup last log line is an error: {last[-240:]}")
    except Exception as e:
        problems.append(f"could not read weekly log: {e}")

for p in problems:
    print(p)
PY
)

if [ -z "$NEEDS_FIX" ]; then
  echo "$LOG_PREFIX All watched backups are fresh — healthy"
  rm -f "$STATE_FILE"
  exit 0
fi

echo "$LOG_PREFIX Unhealthy:"
echo "$NEEDS_FIX" | sed "s/^/$LOG_PREFIX   /"

# Persist first-unhealthy timestamp (2-day email clock starts here, not 147 days ago)
python3 - "$STATE_FILE" << 'PY'
import json, os, sys, datetime
path = sys.argv[1]
now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
state = {}
if os.path.exists(path):
    try:
        state = json.load(open(path))
    except Exception:
        state = {}
if not state.get("unhealthy_since"):
    state["unhealthy_since"] = now
state["last_seen_at"] = now
json.dump(state, open(path, "w"), indent=2)
print(state["unhealthy_since"])
PY
UNHEALTHY_SINCE=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('unhealthy_since',''))" 2>/dev/null || true)

# ── Deterministic repairs ────────────────────────────────────────────
echo "$LOG_PREFIX Applying deterministic repairs..."

mkdir -p /Volumes/RVAULT20/backups/alpacapps/supabase \
         /Volumes/RVAULT20/backups/alpacapps/r2 \
         /Volumes/RVAULT20/backups/alpacapps/d1 \
         /Volumes/RVAULT20/backups/alpacapps/github \
         /Volumes/RVAULT20/backups/haos 2>/dev/null || true

# Fail triggers stuck running >30 min so the poller can retry
STALE_CUTOFF=$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
STALE=$(sb_get "backup_triggers?status=eq.running&requested_at=lt.$STALE_CUTOFF&select=id" 2>/dev/null || echo "[]")
if [ -n "$STALE" ] && [ "$STALE" != "[]" ]; then
  echo "$STALE" | python3 -c "import sys,json
for t in json.load(sys.stdin):
    print(t['id'])" | while read -r stale_id; do
    curl -sf "$SB_URL/rest/v1/backup_triggers?id=eq.$stale_id" \
      -X PATCH \
      -H "apikey: $SB_KEY" \
      -H "Authorization: Bearer $SB_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"status\":\"failed\",\"completed_at\":\"$(iso_now)\",\"notes\":\"Auto-failed by watchdog: stuck running >30min\"}" \
      >/dev/null 2>&1
    echo "$LOG_PREFIX   Auto-failed stuck trigger $stale_id"
  done
fi

# Re-queue stale services that don't already have a pending/running trigger
NEEDS_FIX="$NEEDS_FIX" TRIGGERS_JSON="$TRIGGERS_JSON" python3 - << 'PY' > /tmp/backup-watchdog-requeue.txt
import json, os, re
problems = (os.environ.get("NEEDS_FIX") or "").splitlines()
try:
    triggers = json.loads(os.environ.get("TRIGGERS_JSON") or "[]")
except Exception:
    triggers = []
active = {t.get("service") for t in triggers if t.get("status") in ("pending", "running")}
wanted = []
for p in problems:
    m = re.match(r"^(supabase-db|cloudflare-r2|cloudflare-d1|github-repo|haos-vm-image|home-assistant)\b", p)
    if m and m.group(1) not in active and m.group(1) not in wanted:
        wanted.append(m.group(1))
for s in wanted:
    print(s)
PY

while read -r SVC; do
  [ -z "$SVC" ] && continue
  curl -sf "$SB_URL/rest/v1/backup_triggers" \
    -H "apikey: $SB_KEY" \
    -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"service\":\"$SVC\",\"requested_at\":\"$(iso_now)\",\"status\":\"pending\",\"notes\":\"watchdog re-queue\"}" \
    >/dev/null 2>&1 && echo "$LOG_PREFIX   Re-queued $SVC" || echo "$LOG_PREFIX   WARN: failed to re-queue $SVC"
done < /tmp/backup-watchdog-requeue.txt

# Kick the poller unless it is already running (lock dir)
if [ ! -d /tmp/backup-trigger-poller.lock ]; then
  echo "$LOG_PREFIX Running backup-trigger-poller.sh"
  "$HOME/scripts/backup-trigger-poller.sh" >> "$HOME/logs/backup-trigger-poller.log" 2>&1 || true
else
  echo "$LOG_PREFIX Poller already running — not starting a second copy"
fi

# ── Recheck after repair ─────────────────────────────────────────────
sleep 5
FILES_JSON=$(sb_get "backup_files?select=service,backup_date,filename,size_bytes&order=backup_date.desc&limit=200" 2>/dev/null || echo "[]")
TRIGGERS_JSON=$(sb_get "backup_triggers?select=id,service,status,requested_at,completed_at,result,notes&order=requested_at.desc&limit=50" 2>/dev/null || echo "[]")
STILL_UNHEALTHY=$(FILES_JSON="$FILES_JSON" TRIGGERS_JSON="$TRIGGERS_JSON" \
  WEEKLY_STALE_DAYS="$WEEKLY_STALE_DAYS" DAILY_STALE_DAYS="$DAILY_STALE_DAYS" \
  HEARTBEAT_FILE="$HEARTBEAT_FILE" POLLER_STALE_SECS="$POLLER_STALE_SECS" \
  WEEKLY_LOG="$HOME/logs/alpacapps-backup.log" NOW="$(date +%s)" python3 - << 'PY'
import json, os, sys, time
from datetime import datetime, timezone
now = int(os.environ["NOW"])
weekly_days = int(os.environ["WEEKLY_STALE_DAYS"])
daily_days = int(os.environ["DAILY_STALE_DAYS"])
services = {"supabase-db": weekly_days, "cloudflare-r2": weekly_days, "cloudflare-d1": weekly_days, "github-repo": weekly_days, "haos-vm-image": daily_days}
try: files = json.loads(os.environ.get("FILES_JSON") or "[]")
except Exception: files = []
latest = {}
for row in files:
    svc = row.get("service")
    if svc in services and svc not in latest:
        latest[svc] = row
def age_days(iso):
    if not iso: return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0
    except Exception:
        return None
problems = []
for svc, max_days in services.items():
    row = latest.get(svc)
    if not row:
        problems.append(f"{svc}: still no backup_files row")
        continue
    days = age_days(row.get("backup_date"))
    if days is not None and days > max_days:
        problems.append(f"{svc}: still stale ({days:.1f}d)")
for p in problems:
    print(p)
PY
)

if [ -z "$STILL_UNHEALTHY" ]; then
  echo "$LOG_PREFIX Repairs succeeded — backups are fresh again"
  rm -f "$STATE_FILE"
  exit 0
fi

echo "$LOG_PREFIX Still unhealthy after deterministic repair:"
echo "$STILL_UNHEALTHY" | sed "s/^/$LOG_PREFIX   /"

# ── Optional Claude diagnosis (one attempt, 8 min cap) ───────────────
# Skip while the poller is mid-run — a live R2 sync looks like "still stale".
if [ -d /tmp/backup-trigger-poller.lock ]; then
  echo "$LOG_PREFIX Poller still running — skipping Claude this hour"
elif command -v claude >/dev/null 2>&1; then
  echo "$LOG_PREFIX Collecting diagnostics for Claude CLI..."
  cat > "$DIAG_FILE" << HEADER
# Backup Watchdog — Failure Diagnosis Request

You are on Alpuca. RVAULT20 is at /Volumes/RVAULT20 (also /Volumes/rvault20).
Backup scripts: ~/scripts/backup-alpacapps-to-rvault.sh, backup-trigger-poller.sh, backup-watchdog.sh.
Env: ~/.env-alpacapps (do NOT modify secrets). Do not change cron entries.

## Problems
$STILL_UNHEALTHY

## Earlier problems this run
$NEEDS_FIX

HEADER
  echo "## System state" >> "$DIAG_FILE"
  echo "aws: $(command -v aws 2>/dev/null || echo missing)" >> "$DIAG_FILE"
  echo "pg_dump: $(command -v pg_dump 2>/dev/null || echo missing)" >> "$DIAG_FILE"
  echo "RVAULT mounted: $( [ -d /Volumes/rvault20 ] || [ -d /Volumes/RVAULT20 ] && echo yes || echo no )" >> "$DIAG_FILE"
  echo "poller heartbeat: $(cat "$HEARTBEAT_FILE" 2>/dev/null || echo missing)" >> "$DIAG_FILE"
  echo "weekly log tail:" >> "$DIAG_FILE"
  tail -15 "$HOME/logs/alpacapps-backup.log" >> "$DIAG_FILE" 2>/dev/null
  echo "" >> "$DIAG_FILE"
  echo "poller log tail:" >> "$DIAG_FILE"
  tail -30 "$HOME/logs/backup-trigger-poller.log" >> "$DIAG_FILE" 2>/dev/null
  cat >> "$DIAG_FILE" << 'INSTRUCTIONS'

## Task
1. Identify the root cause for each stale service.
2. Fix scripts in ~/scripts/ if needed (aws path, missing backup_files logging, swallowed errors).
3. Re-queue pending backup_triggers and run ~/scripts/backup-trigger-poller.sh.
4. Do not email anyone. Do not change ~/.env-alpacapps secrets or crontab.
INSTRUCTIONS

  echo "$LOG_PREFIX Invoking Claude CLI (8 min cap)..."
  CLAUDE_OUTPUT=$(perl -e 'alarm shift; exec @ARGV' 480 claude --print --dangerously-skip-permissions "$(cat "$DIAG_FILE")" 2>&1) || true
  echo "$LOG_PREFIX Claude (truncated):"
  echo "$CLAUDE_OUTPUT" | tail -15
  rm -f "$DIAG_FILE"
fi

# ── Email only after 2 days of failed repair ─────────────────────────
python3 - "$STATE_FILE" "$UNHEALTHY_SECS" "$EMAIL_COOLDOWN_SECS" "$STILL_UNHEALTHY" << 'PY'
import json, os, sys, datetime
path, unhealthy_secs, cooldown, body = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
now = datetime.datetime.utcnow()
state = {}
if os.path.exists(path):
    try:
        state = json.load(open(path))
    except Exception:
        state = {}
since = state.get("unhealthy_since")
if not since:
    print("no-email: no unhealthy_since")
    sys.exit(0)
try:
    started = datetime.datetime.strptime(since.replace("Z",""), "%Y-%m-%dT%H:%M:%S")
except Exception:
    print("no-email: bad unhealthy_since")
    sys.exit(0)
age = (now - started).total_seconds()
if age < unhealthy_secs:
    print(f"no-email: only {int(age)}s unhealthy (need {unhealthy_secs}s)")
    sys.exit(0)
last = state.get("last_email_at")
if last:
    try:
        last_dt = datetime.datetime.strptime(last.replace("Z",""), "%Y-%m-%dT%H:%M:%S")
        if (now - last_dt).total_seconds() < cooldown:
            print("no-email: cooldown")
            sys.exit(0)
    except Exception:
        pass
print("SEND")
print(since)
print(int(age // 86400))
PY
> /tmp/backup-watchdog-email-decision.txt

DECISION=$(head -1 /tmp/backup-watchdog-email-decision.txt)
if [ "$DECISION" = "SEND" ]; then
  SINCE_STR=$(sed -n '2p' /tmp/backup-watchdog-email-decision.txt)
  DAYS_STR=$(sed -n '3p' /tmp/backup-watchdog-email-decision.txt)
  echo "$LOG_PREFIX Sending 2-day failure email to $ALERT_EMAIL"
  RESEND_KEY=$(tr -d '\n' < "$HOME/.config/resend/key" 2>/dev/null || true)
  if [ -z "$RESEND_KEY" ]; then
    echo "$LOG_PREFIX ERROR: Resend key missing at ~/.config/resend/key — cannot email"
  else
    BODY=$(printf '%s\n\nUnhealthy since: %s (%s days of failed auto-repair).\n\nCurrent problems:\n%s\n\nWatchdog will keep trying hourly. This email repeats at most once per day until backups succeed.\n\nHost: Alpuca. Logs: ~/logs/backup-watchdog.log ~/logs/alpacapps-backup.log ~/logs/backup-trigger-poller.log\n' \
      "AlpacApps backups are still failing after 2 days of automatic diagnosis and repair." \
      "$SINCE_STR" "$DAYS_STR" "$STILL_UNHEALTHY")
    RESP=$(jq -n \
      --arg from "$ALERT_FROM" \
      --arg to "$ALERT_EMAIL" \
      --arg subject "AlpacApps backups still failing after 2 days" \
      --arg text "$BODY" \
      '{from:$from, to:[$to], subject:$subject, text:$text}' | \
      curl -s -X POST 'https://api.resend.com/emails' \
        -H "Authorization: Bearer $RESEND_KEY" \
        -H 'Content-Type: application/json' \
        -d @-)
    echo "$LOG_PREFIX Resend response: $RESP"
    python3 - "$STATE_FILE" << 'PY'
import json, sys, datetime
path = sys.argv[1]
state = json.load(open(path))
state["last_email_at"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump(state, open(path, "w"), indent=2)
PY
  fi
else
  echo "$LOG_PREFIX Email deferred: $(tr '\n' ' ' < /tmp/backup-watchdog-email-decision.txt)"
fi

python3 - "$STATE_FILE" "$STILL_UNHEALTHY" << 'PY'
import json, sys, datetime
path, problems = sys.argv[1], sys.argv[2]
state = {}
if True:
    try:
        state = json.load(open(path))
    except Exception:
        state = {}
state["last_problems"] = problems.splitlines()
state["last_attempt_at"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump(state, open(path, "w"), indent=2)
PY

echo "$LOG_PREFIX Done (still unhealthy; 2-day email clock started $UNHEALTHY_SINCE)"
