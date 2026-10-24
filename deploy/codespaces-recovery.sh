#!/usr/bin/env bash
# Codespaces one-shot: postgres + optional restore + host-native Diamond + OCR sidecars.
# Safe: never runs migrate seed on populated DB; restore only when haidara is empty and dump present.
set -euo pipefail
ROOT=/workspaces/Diamond-Proj
DEPLOY="$ROOT/deploy"
DUMP_CANDIDATES=(
  /tmp/diamond-haidara.dump
  /tmp/diamond-haidara-codespaces.dump
  "$DEPLOY/backups/diamond-haidara-codespaces.dump"
)
[[ -f "$DEPLOY/.env" && -f "$DEPLOY/staging.env" ]] || {
  echo "Missing deploy/.env or deploy/staging.env — cannot start."
  exit 1
}
set -a
# shellcheck disable=SC1091
source "$DEPLOY/.env"
# shellcheck disable=SC1091
source "$DEPLOY/staging.env"
set +a
export DATABASE_URL="postgresql://diamond:${POSTGRES_PASSWORD}@127.0.0.1:5432/haidara"
COMPOSE="docker compose -f docker-compose.staging.yml -f docker-compose.codespaces.yml -f docker-compose.codespaces-full.yml"
cd "$DEPLOY"
$COMPOSE up -d postgres
for _ in $(seq 1 45); do
  $COMPOSE exec -T postgres pg_isready -U diamond -d haidara >/dev/null 2>&1 && break
  sleep 2
done
USER_COUNT=$($COMPOSE exec -T postgres psql -U diamond -d haidara -t -c "SELECT count(*) FROM users;" 2>/dev/null | tr -d ' \n' || echo "0")
if [[ "${USER_COUNT:-0}" == "0" || "${USER_COUNT:-0}" -lt 2 ]]; then
  RESTORE_FILE=""
  for f in "${DUMP_CANDIDATES[@]}"; do
    [[ -f "$f" ]] && RESTORE_FILE="$f" && break
  done
  if [[ -n "$RESTORE_FILE" ]]; then
    echo "Restoring haidara from ${RESTORE_FILE}..."
    cat "$RESTORE_FILE" | $COMPOSE exec -T postgres pg_restore -U diamond -d haidara --clean --if-exists --no-owner --role=diamond || true
    $COMPOSE exec -T postgres psql -U diamond -d haidara -c "SELECT count(*) AS users FROM users;"
  else
    echo "haidara appears empty and no dump found. Place dump at /tmp/diamond-haidara.dump then re-run."
    exit 2
  fi
else
  echo "haidara already has data (users=${USER_COUNT}); skipping restore."
fi
if ! grep -q CODESPACES_GPS_FLEET_PRESENTATION "$ROOT/APP/backend/dist/src/config/env.js" 2>/dev/null; then
  echo "Building backend (fleet presentation flag)..."
  (cd "$ROOT/APP/backend" && NODE_OPTIONS=--max-old-space-size=1536 npm run build)
fi
bash "$DEPLOY/codespaces-autostart.sh"
# OCR (optional; skip if venvs missing)
if [[ -x "$ROOT/DOCUMENT-ENGINE/PASSPORT/.venv/bin/python" ]]; then
  pkill -f 'uvicorn.*8010' 2>/dev/null || true
  cd "$ROOT/DOCUMENT-ENGINE/PASSPORT"
  nohup .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 >>/tmp/passport-ocr.log 2>&1 &
fi
if [[ -x "$ROOT/DOCUMENT-ENGINE/LICENSE/.venv/bin/python" ]]; then
  pkill -f 'uvicorn.*8020' 2>/dev/null || true
  cd "$ROOT/DOCUMENT-ENGINE/LICENSE"
  nohup .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8020 >>/tmp/license-ocr.log 2>&1 &
fi
echo "Recovery pass complete. Check: ss -tlnp | grep -E ':3000|:3100|:5432|:8010|:8020'"
