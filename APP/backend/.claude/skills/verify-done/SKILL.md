---
name: verify-done
description: Use before claiming any backend change is complete, fixed, or ready to commit. Runs the repo's Definition of Done gate — typecheck, lint, build, tests, OpenAPI — and requires the actual command output before any success claim.
---

# Definition of Done

Evidence before assertions. Run the commands, read the output, then report. A change
is not done because it "should work".

## The gate

```bash
npm run typecheck    # tsc --noEmit — must be zero errors
npm run lint         # eslint — zero errors (warnings are pre-existing, do not add more)
npm run build        # tsc + tsc-alias + asset copy
npm test             # unit + integration
```

Integration tests need a real database and are skipped unless
`RUN_INTEGRATION=true` is set with a test `DATABASE_URL`. If they skipped, say so —
"tests pass" while every integration test skipped is a false claim.

After a schema change, also:

```bash
npm run db:generate      # client + src/schemas/zod stay in sync with the schema
npx prisma migrate status
```

After a route/contract change, also:

```bash
npm run openapi:export   # OpenAPI is the source of truth for the client
```

## Contract checklist

Automated checks do not cover these. Confirm them by reading the diff:

- [ ] Every new route declares `summary`, `operationId`, `tags`, `response`, and
      `permissions` — or lives under `routes/public/` deliberately.
- [ ] No new permission key is missing from `PERMISSION_CATALOG`.
- [ ] `passwordHash`, tokens and secrets appear in no response, log, or audit payload.
- [ ] Multi-step writes are inside `withTransaction`.
- [ ] Every thrown error is an `AppError` with a stable `code` + `context.reason`;
      nothing branches on a localized message.
- [ ] New user-facing text has keys in BOTH `src/locales/en.ts` and `ar.ts`.
- [ ] Sensitive state changes call `request.setAudit(...)`.

## Reporting

State what ran and what it said. If a step failed or was skipped, say which and why —
never round a partial run up to "all green". Quote failing output rather than
summarizing it.
