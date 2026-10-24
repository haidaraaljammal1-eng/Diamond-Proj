#!/usr/bin/env bash
# Codespaces-only: patch compiled Vehicles list filter (no tsc build, no DB/GPS mutations).
set -euo pipefail
ROOT=/workspaces/Diamond-Proj
VEH="$ROOT/APP/backend/dist/src/modules/vehicles/vehicles.service.js"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$ROOT/deploy/backups/dist-hotfix-$STAMP"
COMPOSE="docker compose -f $ROOT/deploy/docker-compose.staging.yml -f $ROOT/deploy/docker-compose.codespaces.yml -f $ROOT/deploy/docker-compose.codespaces-full.yml"
EXPECTED_GPS_FLEET=27

gps_bound_active_count() {
  $COMPOSE exec -T postgres psql -U diamond -d haidara -t -A -c \
    'SELECT count(*) FROM vehicles v INNER JOIN vehicle_gps_bindings b ON b."vehicleId" = v.id WHERE v."isActive" = true AND b."isActive" = true;' \
    2>/dev/null | tr -d ' \n'
}

rollback_dist_and_restart_backend() {
  echo "Rolling back vehicles.service.js and restarting backend."
  cp -a "$BACKUP_DIR/vehicles.service.js" "$VEH"
  node --check "$VEH"
  if pgrep -f 'dist/src/server.js' >/dev/null; then
    pkill -f 'dist/src/server.js' || true
    sleep 2
  fi
  cd "$ROOT/APP/backend"
  nohup node dist/src/server.js >>/tmp/diamond-backend.log 2>&1 &
}

[[ -f "$VEH" ]] || {
  echo "Missing compiled vehicles.service.js at $VEH"
  exit 1
}

mkdir -p "$BACKUP_DIR"
cp -a "$VEH" "$BACKUP_DIR/vehicles.service.js"

PRE_COUNT=$(gps_bound_active_count || true)
if [[ "$PRE_COUNT" != "$EXPECTED_GPS_FLEET" ]]; then
  echo "Pre-check failed: expected $EXPECTED_GPS_FLEET active GPS-bound vehicles, got '${PRE_COUNT:-unknown}'."
  echo "No dist changes applied. Backup at $BACKUP_DIR"
  exit 1
fi

if grep -q 'CODESPACES_GPS_FLEET_PRESENTATION' "$VEH"; then
  echo "vehicles.service.js already patched."
else
  node <<'NODE'
const fs = require("fs");
const path = "/workspaces/Diamond-Proj/APP/backend/dist/src/modules/vehicles/vehicles.service.js";
const needle = `        const where = {
            ...(query.active !== undefined ? { isActive: query.active } : {}),`;
const replacement = `        const where = {
            ...(process.env.CODESPACES_GPS_FLEET_PRESENTATION === "true" ||
            process.env.CODESPACES_GPS_FLEET_PRESENTATION === "1"
                ? { gpsBinding: { isActive: true } }
                : {}),
            ...(query.active !== undefined ? { isActive: query.active } : {}),`;
const s = fs.readFileSync(path, "utf8");
if (!s.includes(needle)) {
  console.error("Patch anchor not found in vehicles.service.js");
  process.exit(1);
}
fs.writeFileSync(path, s.replace(needle, replacement));
NODE
fi

node --check "$VEH"

# Preserve existing runtime env (secrets, GPS, encryption keys).
if [[ -f "$ROOT/deploy/.env" && -f "$ROOT/deploy/staging.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/deploy/.env"
  # shellcheck disable=SC1091
  source "$ROOT/deploy/staging.env"
  set +a
  export DATABASE_URL="postgresql://diamond:${POSTGRES_PASSWORD}@127.0.0.1:5432/haidara"
  export PORT=3000
  export NODE_ENV=production
  export FILE_STORAGE_DIR="$ROOT/data/uploads"
fi
export CODESPACES_GPS_FLEET_PRESENTATION="${CODESPACES_GPS_FLEET_PRESENTATION:-true}"

if pgrep -f 'dist/src/server.js' >/dev/null; then
  pkill -f 'dist/src/server.js' || true
  sleep 2
fi
cd "$ROOT/APP/backend"
nohup node dist/src/server.js >>/tmp/diamond-backend.log 2>&1 &
sleep 5

READY=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health/ready || echo "000")
echo "health/ready HTTP $READY"
if [[ "$READY" != "200" ]]; then
  echo "Backend health check failed."
  rollback_dist_and_restart_backend
  exit 1
fi

POST_COUNT=$(gps_bound_active_count || true)
if [[ "$POST_COUNT" != "$EXPECTED_GPS_FLEET" ]]; then
  echo "Fleet verification failed: expected $EXPECTED_GPS_FLEET active GPS-bound vehicles, got '${POST_COUNT:-unknown}'."
  rollback_dist_and_restart_backend
  exit 1
fi

# Optional: verify Vehicles list total via staff JWT (set in shell only; never commit).
if [[ -n "${DIAMOND_HOTFIX_BEARER_TOKEN:-}" ]]; then
  API_TOTAL=$(curl -sS -H "Authorization: Bearer ${DIAMOND_HOTFIX_BEARER_TOKEN}" \
    "http://127.0.0.1:3000/vehicles?page=1&pageSize=1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).meta.total)}catch{console.log('')}})" )
  if [[ "$API_TOTAL" != "$EXPECTED_GPS_FLEET" ]]; then
    echo "Vehicles API meta.total=$API_TOTAL (expected $EXPECTED_GPS_FLEET)."
    rollback_dist_and_restart_backend
    exit 1
  fi
  echo "Vehicles API meta.total=$API_TOTAL"
fi

echo "Hotfix OK. Active GPS-bound fleet: $POST_COUNT. Backup: $BACKUP_DIR"
