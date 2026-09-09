# Development Database Bootstrap

Git synchronizes code, Prisma schemas, migrations, and seed **scripts**.  
Git does **not** synchronize local PostgreSQL data.

Every developer laptop has its own development database. After clone or after a pull that changes the schema/permissions/seed, run one command from `APP/backend`:

```bash
npm run dev:bootstrap
```

## New laptop

1. `git pull` / clone
2. Copy `APP/backend/.env.example` → `.env` and fill secrets
3. `npm install` (in `APP/backend`)
4. `npm run dev:bootstrap`
5. `npm run dev`

## Existing laptop (after a DB-related pull)

```bash
npm run dev:bootstrap
```

You do not need to remember migrate vs generate vs seed order.

## What bootstrap does

1. Validates `NODE_ENV !== production` and that `DATABASE_URL` is a **local** development database (prints `host:port / database` — never the password)
2. `prisma migrate deploy` — applies **existing** migrations only
3. `npm run db:generate` — current Prisma Client
4. `npm run db:seed` — idempotent permissions catalog + `system_admin` grants
5. `npm run db:seed:demo` — create-missing `DEMO-FLEET-01` … `DEMO-FLEET-20`
6. Verifies the minimum development state

It never runs:

- `prisma migrate reset`
- `db push --force-reset`
- `DROP` / `TRUNCATE`
- `npm run db:cleanup:dev-fleet`

## Demo Fleet is initial data, not a limit

- 20 Demo Vehicles = the **minimum** development seed
- They are **not** a fleet maximum
- `GET /vehicles` reads the real database
- Frontend must not add mock cars when the DB is empty

## User-created vehicles are preserved

If the database has 20 demo rows + 5 vehicles created from the Frontend, a second bootstrap still leaves **25**.

`db:cleanup:dev-fleet` is a separate, explicit destructive command. Do not use it as part of normal bootstrap.

## Health check (read-only)

```bash
npm run dev:check
```

Prints connection, migration status, Prisma Client, permission catalog counts, Demo Fleet `found/expected`, total/active vehicles, and whether the Contracts table exists. It does not write.

## Future DB change checklist

New Prisma model:

- Migration
- `db:generate`
- Bootstrap verification (`dev:check` / `dev:bootstrap`)

New permission:

- `PERMISSION_CATALOG`
- Seed (included in bootstrap)
- `system_admin` assignment
- `GET /auth/me` (frontend session revalidation mirrors this; login-only is not required)

New required development data:

- Idempotent seed (stable unique id)
- Included in `dev:bootstrap`
- Verification in `dev:check`

A feature that needs new models, permissions, or seed data is not environment-ready until a clean local database can reproduce that state via `npm run dev:bootstrap`.
