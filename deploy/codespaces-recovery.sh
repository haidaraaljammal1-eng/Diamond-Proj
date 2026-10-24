#!/usr/bin/env bash
# Codespaces one-shot: postgres + restore (empty DB only) + host-native Diamond + OCR sidecars.
set -euo pipefail
ROOT=/workspaces/Diamond-Proj
DEPLOY="$ROOT/deploy"
DUMP_CANDIDATES=(
  /tmp/diamond-haidara-codespaces.dump
  /tmp/diamond-haidara.dump
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

db_populated() {
  local has_users
  has_users=$($COMPOSE exec -T postgres psql -U diamond -d haidara -t -A -c \
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users');" \
    2>/dev/null | tr -d ' \n' || echo "f")
  if [[ "$has_users" != "t" ]]; then
    return 1
  fi
  local u c g
  u=$($COMPOSE exec -T postgres psql -U diamond -d haidara -t -A -c "SELECT count(*) FROM users;" | tr -d ' \n')
  c=$($COMPOSE exec -T postgres psql -U diamond -d haidara -t -A -c "SELECT count(*) FROM contracts;" 2>/dev/null | tr -d ' \n' || echo "0")
  g=$($COMPOSE exec -T postgres psql -U diamond -d haidara -t -A -c "SELECT count(*) FROM gps_provider_accounts;" 2>/dev/null | tr -d ' \n' || echo "0")
  [[ "${u:-0}" -gt 0 || "${c:-0}" -gt 0 || "${g:-0}" -gt 0 ]]
}

if db_populated; then
  echo "haidara already populated; skipping restore."
else
  RESTORE_FILE=""
  for f in "${DUMP_CANDIDATES[@]}"; do
    [[ -f "$f" ]] && RESTORE_FILE="$f" && break
  done
  if [[ -z "$RESTORE_FILE" ]]; then
    echo "Empty haidara and no dump found. Place dump at /tmp/diamond-haidara-codespaces.dump then re-run."
    exit 2
  fi
  echo "Restoring haidara from ${RESTORE_FILE}..."
  cat "$RESTORE_FILE" | $COMPOSE exec -T postgres pg_restore -U diamond -d haidara --no-owner --role=diamond
  if db_populated; then
    echo "Restore OK."
    $COMPOSE exec -T postgres psql -U diamond -d haidara -c \
      "SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'vehicle_gps_bindings', count(*) FROM vehicle_gps_bindings WHERE \"isActive\"=true;"
  else
    echo "Restore finished but database still appears empty."
    exit 3
  fi
fi

if ! grep -q CODESPACES_GPS_FLEET_PRESENTATION "$ROOT/APP/backend/dist/src/config/env.js" 2>/dev/null; then
  echo "Building backend (fleet presentation flag)..."
  (cd "$ROOT/APP/backend" && NODE_OPTIONS=--max-old-space-size=1536 npm run build)
fi
bash "$DEPLOY/codespaces-autostart.sh"
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
echo "Recovery complete."
