#!/usr/bin/env bash
#
# GrepThink 2.0 — VM-side (re)deploy. Idempotent: safe to run repeatedly.
# Run from the repo root ON VM2 (e.g. /home/pmundra/grepthink2.0).
#
#   ./deploy.sh                        # backend deps + restart + health check
#   ./deploy.sh --dist /tmp/dist.tgz   # ALSO publish a prebuilt frontend (tarball)
#   ./deploy.sh --dist frontend/dist   # ...or a dist directory
#
# Project specifics this honors:
#   * The frontend is built OFF the VM (VM2 has no Node) — this script never
#     builds; it only publishes an already-built dist you pass via --dist.
#   * backend/app/config.py loads .env from the REPO ROOT and hard-fails if
#     SUPABASE_URL/KEY are missing — so we require .env and never overwrite it.
#   * The backend runs as systemd `grepthink-api` (uvicorn, 127.0.0.1:5001).
#   * nginx is configured once (shared slug-mcp site); routine deploys do NOT
#     touch it — only the app + static files change.
#   * Works whether the repo was delivered via `git clone` or `rsync` (the VM
#     may have no GitHub creds): it pulls only if this is a git checkout.
#
# Requires: python3, rsync, curl, and passwordless sudo for `systemctl restart`.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/grepthink}"
SERVICE="${SERVICE:-grepthink-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5001/health}"
VENV="$REPO_DIR/backend/.venv"

DIST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dist) DIST="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# --- Preconditions -----------------------------------------------------------
[ -f "$REPO_DIR/.env" ] || die "$REPO_DIR/.env is missing (prod secrets). Create it first; this script never writes secrets."
command -v python3 >/dev/null || die "python3 not found"
command -v rsync   >/dev/null || die "rsync not found"

# --- 0. Update source if this is a git checkout (rsync deploys: skipped) -----
if [ -d "$REPO_DIR/.git" ]; then
  log "git pull --ff-only"
  git -C "$REPO_DIR" pull --ff-only || echo "WARN: git pull failed; continuing with on-disk source"
else
  echo "(no .git here — assuming source was synced via rsync/scp)"
fi

# --- 1. Backend: venv (create if missing) + deps (idempotent) ----------------
log "Backend deps"
[ -d "$VENV" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$REPO_DIR/backend/requirements.txt"

# --- 2. Validate import + config BEFORE bouncing the live service ------------
log "Validating app import + .env config"
( cd "$REPO_DIR/backend" && "$VENV/bin/python" -c "import app.main" ) \
  || die "app failed to import / config invalid — NOT restarting the live service"

# --- 3. Publish prebuilt frontend (optional; built off-VM) ------------------
if [ -n "$DIST" ]; then
  log "Publishing frontend -> $WEB_ROOT"
  mkdir -p "$WEB_ROOT"
  if [ -f "$DIST" ]; then
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    tar -xzf "$DIST" -C "$tmp"; src="$tmp"
  elif [ -d "$DIST" ]; then
    src="$DIST"
  else
    die "--dist '$DIST' is neither a tarball nor a directory"
  fi
  [ -f "$src/index.html" ] || die "no index.html found in dist ('$DIST')"
  # --delete clears stale content-hashed assets from the previous build.
  rsync -a --delete "$src"/ "$WEB_ROOT"/
  echo "published $(find "$WEB_ROOT" -type f | wc -l | tr -d ' ') files"
fi

# --- 4. Restart backend + health gate ---------------------------------------
log "Restarting $SERVICE"
sudo systemctl restart "$SERVICE"
ok=0
for _ in $(seq 1 15); do
  if curl -fsS -m 3 "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" = 1 ]; then
  log "DEPLOY OK — $(curl -fsS -m3 "$HEALTH_URL")"
else
  echo "ERROR: $SERVICE did not pass health check at $HEALTH_URL. Recent logs:" >&2
  sudo journalctl -u "$SERVICE" --no-pager -n 30 >&2 || true
  exit 1
fi
