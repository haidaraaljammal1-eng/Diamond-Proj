# Transactions, Concurrency, Idempotency

## Transactions

Any operation that writes more than one row/table and must be all-or-nothing runs inside `withTransaction(prisma, async (tx) => { ... })` (`src/lib/db/transaction.ts`). The canonical shape:

```
validate → lock → re-read → update → related write → (audit) → commit
```

## Advisory locks (concurrency)

For concurrency-sensitive sections — capacity checks, unique allocation, reassignment, resource reservation, critical status transitions — take a PostgreSQL transaction-scoped advisory lock:

```ts
await withTransaction(prisma, async (tx) => {
  await acquireAdvisoryLock(tx, "capacity", resourceId); // inside the tx
  // re-read, decide, write
});
```

Rules: lock **inside** a transaction (auto-released at commit); use a stable namespace + stable entity id; when taking multiple locks use `acquireAdvisoryLocks` (sorts them to avoid deadlocks). Do not lock on every operation — only where correctness needs serialization.

## Optimistic concurrency

Where two clients may race a mutation, compare a `version`/`updatedAt` and throw `RESOURCE_MODIFIED` on mismatch (`AppError.modified`). Use it where lost updates matter, not everywhere.

## Idempotency

External side effects and at-most-once effects use **create-first** idempotency (`runIdempotent`): reserve a unique `(scope, key)` row **before** performing the effect. A unique-violation means the effect already happened → treat as a dedupe. Never "check then send" (that races). Used by the notification pipeline; apply it to emails, webhook processing, and other critical external effects.

## Rotation / reassignment pattern

Session refresh (`auth.service.ts`) shows the reassignment shape: read current → atomically claim (conditional `updateMany`) → create successor → on lost claim, revoke the family. Reuse this pattern for domain reassignments: lock/claim the current assignment, write the new relation, audit.
