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

`NEXT_PUBLIC_API_URL` is fixed at frontend image build time. The image has no localhost default. `deploy/.env.example` shows `http://127.0.0.1:3000` only for a browser on the same host. A later reverse proxy must rebuild the frontend with the public API origin.

## Commands

From `deploy/` after `deploy/.env` and `deploy/staging.env` exist:

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

## Databases

Historical files under `APP/backend/prisma/migrations` stay unchanged. Their checksums stay valid for databases that already applied them, including the operational database.

`prisma migrate deploy` on an empty database still cannot replay that history. `20260910190000_gps_multi_provider_foundation` adds a foreign key to `operating_companies` before `20260920012059_multi_company_foundation` creates the table. Do not rewrite those files and do not point a repair at the operational database.

Fresh install, empty database named `diamond_staging` or `diamond_fresh_<suffix>`:

```bash
export DATABASE_URL=postgresql://diamond:secret@127.0.0.1:5432/diamond_fresh_example
export DIAMOND_FRESH_DATABASE_CONFIRM=diamond_fresh_example
node scripts/fresh-database-baseline.mjs
```

The script applies the current Prisma schema, then `prisma/baseline/supplemental.sql`, checks the partial indexes exist, and records every historical migration with Prisma's own checksum. It inserts the approved company legal names. It does not replay the old company insert, which used different English names. A second run does not rebuild the schema. `prisma migrate deploy` then applies only migrations added after this baseline.

Existing database upgrade:

```bash
npx prisma migrate deploy
```

Run that only against a database whose `_prisma_migrations` history is already complete. Do not run the fresh baseline script against it.

`NEXT_PUBLIC_API_URL` has no image default. `deploy/.env` must set the origin the browser will call. `http://127.0.0.1:3000` is only for a browser on the same host. A reverse proxy requires that public origin and a frontend rebuild.

The frontend image builds with `next build --turbopack` and `output: "standalone"`. Webpack cannot compile the existing CSS modules, and its standalone step renames `proxy.js.nft.json` to `middleware.js.nft.json` even when that trace file was not emitted. There is one edge file, `src/proxy.ts`. Do not add a root `middleware.ts` beside it.

Stop sends SIGTERM. The backend closes Fastify and exits, and forces exit after 12 seconds if close hangs. Compose `stop_grace_period` is 20 seconds.

Uploads live in the `uploads` volume at `/app/uploads`. Database files live in the `pgdata` volume. Recreating the containers does not delete those volumes.

## Memory budget on 8 GB

Compose limits: PostgreSQL 1.5 GB, backend 1.5 GB, frontend 1 GB. That leaves room for the OS and for a later OCR process. Do not run a frontend production build on the same host while OCR is loaded.

`COOKIE_SECURE=false` in the staging example is for private HTTP on loopback. A public site needs HTTPS and `COOKIE_SECURE=true`.

## OCR

Document Engine recognition is unchanged and is not started by Compose. Linux wheel availability is not the same as a successful OCR run. Phase 3 has to install the pinned stacks on Ubuntu 24.04 and run the existing verification scripts before anyone calls OCR Linux-ready.

## Data safety

Do not set `DATABASE_URL` to the operational `haidara` database. Do not run bootstrap, demo seed, or fleet rebuild from this stack.
