# API Contract Standard

## Contract-first

Every route defines a zod `schema` with at least: `summary`, `operationId`, `tags`, `response`, and `body`/`querystring`/`params` as applicable. Protected routes add `permissions`. The schema drives typed request/reply, OpenAPI, and the generated client. OpenAPI is the **source of truth**; never hand-write wire types outside the contract, and never ship mock contracts.

## Response envelope

```jsonc
// success
{ "data": <payload>, "meta": <optional> }
// paginated
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }
// error
{ "error": { "code": "…", "message": "…", "details"?, "context"?, "conflicts"?, "suggestedActions"?, "requestId": "…" } }
```

Build success bodies with `data(...)` / `message(...)` and response schemas with `dataResponse` / `listResponse` / `MessageResponseSchema` from `src/lib/http/response.ts`. Attach `commonErrorResponses` to protected routes.

## Pagination, filtering, sorting

- Use `PaginationQuerySchema` (`page`, `pageSize`, bounded by `MAX_PAGE_SIZE`). No unbounded list endpoints.
- Sorting goes through `parseSort(input, allowedFields, fallback)` — an **allow-list**. Never pass raw client sort to Prisma.
- Filters are explicit and whitelisted per endpoint. Search uses normalized values where relevant.

## Versioning

The starter uses unversioned generic routes. If you need versioning, introduce a stable prefix (e.g. `/api/v1`) consistently rather than ad hoc.
