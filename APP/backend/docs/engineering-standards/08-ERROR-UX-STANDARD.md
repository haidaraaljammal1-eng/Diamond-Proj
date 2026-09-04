# Error UX Standard

## Throw, don't catch-to-respond

In handlers and services, `throw new AppError({ code, message, ... })`. The global handler (`src/lib/errors/error-handler.ts`) formats it. Do **not** `try/catch` to assemble an error response. (Catching a low-level error in a service to re-throw a *domain* `AppError` — e.g. mapping a unique violation to `CONFLICT` — is fine.)

## Stable codes

`ErrorCode` (`src/constants/error-codes.ts`) values are the contract. The frontend branches on `code`; it must never parse `message`. Add generic codes here; do not add domain codes to the starter.

Each code has a default HTTP status (overridable per throw). Examples: `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RESOURCE_MODIFIED` (409), `RATE_LIMITED` (429).

## Guided conflicts

For conflicts the UI must resolve, attach structured data instead of prose:

```ts
throw new AppError({
  code: ErrorCode.CONFLICT,
  message: "A conflicting resource already exists",
  conflicts: [{ resource: "…", field: "…", message: "…" }],
  suggestedActions: [{ action: "reassign", label: "…" }],
});
```

The backend returns data; it never returns HTML or UI logic.

## Optimistic concurrency

For lost-update-sensitive updates, compare a `version`/`updatedAt` and throw `RESOURCE_MODIFIED` with `context: { currentVersion, requestedVersion }` (`AppError.modified(...)`). Do not impose this on every table.

## Logging

Expected business errors log at `warn`; unexpected server errors at `error` with the stack. Stack traces are never sent to clients — the `requestId` is, to aid support.
