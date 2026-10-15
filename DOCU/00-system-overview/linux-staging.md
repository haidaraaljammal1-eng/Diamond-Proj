# Linux staging foundation

Phase 1 prepares a Linux production shape. It is not launch approval and it does not deploy to Contabo.

Target host: 4 shared vCPU, 8 GB RAM, 100 GB SSD, Ubuntu Server 24.04 LTS x86-64.

The application containers are Debian bookworm (glibc). Alpine is not used. OCR engines are not in this stack.

## Layout

- Backend image: `APP/backend/Dockerfile`. Process: `node dist/src/server.js`.
- Frontend image: `APP/frontend/Dockerfile`. Process: `node server.js` from the Next.js standalone output.
- Compose: `deploy/docker-compose.staging.yml`.
- Secrets: `deploy/.env` and `deploy/staging.env`, copied from the example files. Neither file is committed.

PostgreSQL is only on the compose network. Published ports are `127.0.0.1:3000` and `127.0.0.1:3100`.

One backend container runs the scheduler (`SCHEDULER_ENABLED=true`). Do not add a second backend replica without turning the scheduler off on the extra copy.

`NEXT_PUBLIC_API_URL` is fixed at frontend image build time. The staging default is `http://127.0.0.1:3000`, which the browser on that host can reach. A later reverse proxy must rebuild the frontend with the public API origin.

## Commands

From `deploy/` after the two env files exist:

```bash
docker compose -f docker-compose.staging.yml build
docker compose -f docker-compose.staging.yml up -d postgres
docker compose -f docker-compose.staging.yml --profile migrate run --rm migrate
docker compose -f docker-compose.staging.yml up -d backend frontend
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.staging.yml logs -f backend
curl -fsS http://127.0.0.1:3000/health/ready
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/ar
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/en
docker compose -f docker-compose.staging.yml stop
```

`/health/ready` checks PostgreSQL. `GET /` is liveness and does not check the database.

`prisma migrate deploy` on an empty database currently stops at `20260910190000_gps_multi_provider_foundation`: that file adds a foreign key to `operating_companies`, and the table is created later in `20260920012059_multi_company_foundation`. The operational database already has both migrations recorded, and the GPS file checksum matches, so the SQL files must not be rewritten. A new empty server cannot be built with `migrate deploy` until that history is reconciled. Do not point a repair at the operational database.

Stop sends SIGTERM. The backend closes Fastify and exits, and forces exit after 12 seconds if close hangs. Compose `stop_grace_period` is 20 seconds.

Uploads live in the `uploads` volume at `/app/uploads`. Database files live in the `pgdata` volume. Recreating the containers does not delete those volumes.

## Memory budget on 8 GB

Compose limits: PostgreSQL 1.5 GB, backend 1.5 GB, frontend 1 GB. That leaves room for the OS and for a later OCR process. Do not run a frontend production build on the same host while OCR is loaded.

`COOKIE_SECURE=false` in the staging example is for private HTTP on loopback. A public site needs HTTPS and `COOKIE_SECURE=true`.

## OCR

Document Engine recognition is unchanged and is not started by Compose. Linux wheel availability is not the same as a successful OCR run. Phase 3 has to install the pinned stacks on Ubuntu 24.04 and run the existing verification scripts before anyone calls OCR Linux-ready.

## Data safety

Do not set `DATABASE_URL` to the operational `haidara` database. Do not run bootstrap, demo seed, or fleet rebuild from this stack.
