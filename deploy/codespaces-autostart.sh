#!/usr/bin/env bash
# Codespaces only: resume postgres + host-native API/frontend when deploy secrets exist (no DB import).
set -euo pipefail
ROOT=/workspaces/Diamond-Proj
DEPLOY="$ROOT/deploy"
[[ -f "$DEPLOY/.env" && -f "$DEPLOY/staging.env" ]] || exit 0
set -a
# shellcheck disable=SC1091
source "$DEPLOY/.env"
# shellcheck disable=SC1091
source "$DEPLOY/staging.env"
set +a
export DATABASE_URL="postgresql://diamond:${POSTGRES_PASSWORD}@127.0.0.1:5432/haidara"
export PORT=3000
export NODE_ENV=production
export FILE_STORAGE_DIR="$ROOT/data/uploads"
export WHATSAPP_MEDIA_ROOT="$ROOT/data/uploads/whatsapp-media"
export CONTRACT_PDF_FRONTEND_BASE_URL="http://127.0.0.1:3100"
export CONTRACT_PDF_BACKEND_URL="http://127.0.0.1:3000"
export CODESPACES_GPS_FLEET_PRESENTATION="${CODESPACES_GPS_FLEET_PRESENTATION:-true}"
COMPOSE="docker compose -f docker-compose.staging.yml -f docker-compose.codespaces.yml -f docker-compose.codespaces-full.yml"
cd "$DEPLOY"
$COMPOSE up -d postgres
for _ in $(seq 1 30); do
  $COMPOSE exec -T postgres pg_isready -U diamond -d haidara >/dev/null 2>&1 && break
  sleep 2
done
if [[ -f "$ROOT/APP/backend/dist/src/server.js" ]]; then
  pkill -f 'dist/src/server.js' 2>/dev/null || true
  cd "$ROOT/APP/backend"
  nohup node dist/src/server.js >>/tmp/diamond-backend.log 2>&1 &
fi
if [[ -d "$ROOT/APP/frontend/.next" ]]; then
  export AUTH_URL="${STAGING_PUBLIC_ORIGIN}"
  export AUTH_SECRET="${AUTH_SECRET}"
  export NEXT_PUBLIC_API_PROXY=true
  export NEXT_PUBLIC_API_URL=http://127.0.0.1:3000
  pkill -f 'next-server' 2>/dev/null || true
  cd "$ROOT/APP/frontend"
  nohup npm run start -- -p 3100 >>/tmp/diamond-frontend.log 2>&1 &
fi
