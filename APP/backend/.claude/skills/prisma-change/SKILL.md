---
name: prisma-change
description: Use when changing the Prisma schema — adding or altering a model, field, enum, index, or relation in prisma/schema/*.prisma. Covers the correct generate/migrate order, the zod regeneration step, and the uniqueness + transaction rules the repo enforces.
---

# Change the Prisma schema

The schema is **split by domain** across `prisma/schema/*.prisma` (one `datasource` +
generators in `schema.prisma`, models grouped by domain elsewhere). Put a model in the
file that owns its domain; do not create a new schema file for a single model.

## Order of operations

```bash
# 1. edit prisma/schema/<domain>.prisma
npx prisma format --schema prisma/schema   # 2. normalize + catch relation errors early
npm run db:generate                        # 3. Prisma Client AND src/schemas/zod/**
npm run db:migrate                         # 4. dev migration (prompts for a name)
npm run typecheck                          # 5. every consumer of the changed model
```

`db:generate` regenerates **two** things: the Prisma Client and the zod types under
`src/schemas/zod/`. Those zod files are generated output — never hand-edit them.

For production, `npm run db:deploy` (generate + `migrate deploy`). Never run
`migrate dev` against a production database.

## Rules this repo enforces

- **Uniqueness is enforced twice.** A DB `@unique` index *and* application validation,
  both on the normalized/canonical value (see the `normalizedName` extension pattern in
  `prisma/seed/index.ts`). One without the other is a race waiting to happen.
- **Every FK relation names its side.** Prisma requires the back-relation; add it in the
  same commit or `prisma format` will fail.
- **Explicit `onDelete`.** Decide `Cascade` vs `SetNull` vs restrict deliberately. A
  history/audit row is never cascaded away by a parent edit.
- **Snapshot what history depends on.** If a policy/config value is read at event time,
  store the resolved value on the event row (see `ComplaintSlaCycle`), so editing the
  policy later never rewrites history.
- **`@@map` to snake_case table names**, matching the existing tables.
- **Optimistic concurrency** on user-editable aggregates: a `revision Int @default(0)`
  column, bumped on write, compared on update.

## Writing data

Multi-step writes go through `withTransaction` (`src/lib/db/transaction.ts`).
Concurrency-sensitive sections take `acquireAdvisoryLock(tx, "<lock-name>", id)`.
Idempotent external entry points use `runIdempotent` (`src/lib/db/idempotency.ts`).

## Seeding

Permission keys and reference data (complaint categories, SLA policies, routing
templates, notification definitions, the integration catalog) are seeded by
`prisma/seed/index.ts` and are safe to re-run: they upsert by a stable business key
(`code`) and never overwrite a customised row. `npm run db:seed` runs the base seed
only — it carries no demo/business data, so it is safe in every environment.

## Verifying

`npx prisma migrate status` to confirm the migration applied.
Then `npm run typecheck && npm run build`.
