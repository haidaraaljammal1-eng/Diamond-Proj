# Definition of Done

A change is done only when all of the following hold.

## Correctness & contract
- [ ] Every new/changed route has a complete zod schema (`summary`, `operationId`, `tags`, `response`, inputs).
- [ ] Protected routes declare `permissions`; public routes set `public: true` under `routes/public/`.
- [ ] Responses use the standard envelope (`{ data, meta? }` / structured error).
- [ ] OpenAPI still builds (`npm run openapi:export`).

## Security
- [ ] No plaintext passwords; no secret ever logged or returned.
- [ ] Authorization is enforced automatically via metadata (no manual guard, no accidental public route).
- [ ] Inputs are validated and whitelisted before hitting Prisma (no blind body spread).
- [ ] Uniqueness backed by a DB constraint on the normalized value.

## Data integrity
- [ ] Multi-step writes are transactional; concurrency-sensitive sections take advisory locks.
- [ ] External/at-most-once side effects use idempotency.
- [ ] Sensitive changes call `request.setAudit(...)`.

## Quality gates (must pass)
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test` (and `RUN_INTEGRATION=true npm run test:integration` when DB-affecting)

## Hygiene
- [ ] No business-domain leakage into the generic foundation.
- [ ] No mock data/endpoints; no dead code; no committed secrets.
- [ ] Success/error messages localized via `t()`; clients branch on codes, not messages.

State results honestly: if a gate was skipped or failed, say so with the output.
