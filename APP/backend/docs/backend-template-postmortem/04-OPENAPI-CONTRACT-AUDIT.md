# 04 — OpenAPI & API Contract Audit

Reviewed: `src/plugins/dev/swagger.ts`, `scripts/export-openapi.ts`, `src/lib/http/response.ts`,
`src/lib/http/common-schemas.ts`, all 33 `*.schema.ts` files, all 56 route files, and the exported
`openapi.json` (6.0 MB, 273 paths, 323 operations).

**Overall: `PARTIAL_STRUCTURED` → strong per-route discipline, weak document-level architecture.**

---

## 1. Coverage — what is genuinely complete

| Check | Result |
| --- | --- |
| Routes with a `schema` object | **307 / 307** |
| Routes with `operationId` | **307 / 307** — zero duplicates in the exported document |
| Routes with `summary` + `tags` | 307 / 307 (spot-checked; every route builder includes them) |
| Operations with at least one 2xx response in `openapi.json` | **323 / 323** |
| Routes with a typed 2xx **response schema in source** | 298 / 307 |
| `securitySchemes` | `bearerAuth` declared, applied globally |
| OpenAPI export reproducible offline | ✅ `OPENAPI_EXPORT=true` boots the app headless (`scripts/export-openapi.ts`) |
| Spec ↔ code drift | **none** — the 20 ids present only in the spec are the loop-expanded template-literal ids (below) |

Every request input is a zod schema; the type provider derives both runtime validation and the
OpenAPI JSON from the same object. That is a genuine contract-first implementation and it held across
52 modules.

## 2. The 9 routes with no response schema — all binary streams

| Route | File:line |
| --- | --- |
| `GET /audit-log/export` | `audit-log/routes/admin/route.ts:25` |
| `GET /call-center/queue/export` | `call-center/routes/admin/route.ts:31` |
| `GET /complaints/export` | `complaints/routes/admin/route.ts:35` |
| `GET /complaints/attachments/stream` | `complaints/routes/admin/route.ts:60` |
| `POST /complaints/:id/attachments` | `complaints/routes/admin/route.ts:100` |
| `GET /files/:id` | `files/routes/user/route.ts:51` |
| `GET /reports/:code/export` | `reports/routes/admin/route.ts:96` |
| `GET /reports/artifacts/stream` | `reports/routes/admin/route.ts:113` |
| `GET /survey-responses/export` | `survey-responses/routes/admin/route.ts:69` |

All nine return `application/octet-stream`-class payloads (XLSX/CSV/PDF/file streams) or consume
`multipart/form-data`. Omitting a zod response schema is *technically* correct — you cannot serialize
a stream through a zod serializer. But the consequence is real:

- The generated client types these operations as `unknown`/`void`.
- Their **error** responses are also undocumented — a 403 from `/reports/:code/export` has no schema
  in the contract even though the runtime returns the standard error envelope.
- `24-DEFINITION-OF-DONE.md:6` requires "a complete zod schema (… `response` …)" with no exception
  clause, so nine routes silently violate a written rule that has no escape hatch and no check.

*Classification:* `PARTIAL_STRUCTURED`.
*V2:* a `binaryResponse({ contentTypes, errors })` helper that emits
`{ 200: { content: { "application/octet-stream": {} } }, ...commonErrorResponses }` — documented
binary, not absent schema — and make `check:openapi` require *either* a zod response *or* an explicit
`binaryResponse` marker.

## 3. `components.schemas` is empty — the biggest contract finding

```
$ node -e "…" openapi.json
paths: 273   operations: 323
components.schemas: 0
file size: 6.0 MB
```

`src/plugins/dev/swagger.ts:29` uses `transform: jsonSchemaTransform`, which inlines every zod schema
at every use site. Nothing is ever registered as a named component, so:

1. **The document is 6 MB** for a 323-operation API. Swagger UI is slow; the file is committed to git
   and re-diffs almost entirely on any schema change.
2. **The generated frontend client has no shared model types.** `ComplaintDetailSchema` appears in
   `getComplaint`, `createComplaint`, `transitionComplaint`, `assignComplaint`, … as N structurally
   identical anonymous inline objects. A generator emits `GetComplaintResponse`,
   `CreateComplaintResponse`, … instead of one `Complaint`. That is precisely the "duplicate wire
   types" outcome `07-API-CONTRACT-STANDARD.md` exists to prevent — produced not by a developer
   copy-pasting a DTO, but by the *export configuration*.
3. **Schema identity is invisible.** No name collisions are possible, but neither is any reuse
   analysis, breaking-change detection, or `$ref`-based diffing.

`fastify-type-provider-zod` v6 supports `createJsonSchemaTransformObject` / registry-based naming
(`.register()` / `zod-openapi` metadata) to emit `$ref`s. It was never wired up.

*Root cause:* `E. AUTOMATION_GAP` + `C. STARTER_CAPABILITY_GAP` — the starter shipped the simplest
transform and no one ever measured the output.
*V2:* named-schema registry + `check:openapi` asserting `components.schemas` is non-empty and the
document is under a size budget.

## 4. Duplicate DTO / wire-type audit

Searched for the classic smells:

| Smell | Hits |
| --- | --- |
| `Raw*` types | **0** |
| `*RequestDto` / `*ResponseDto` | **0** |
| `data: request.body` / `...request.body` | **0** |
| Hand-written parallel wire interfaces | **0** found |

**Source-level DTO discipline is excellent.** Response types are inferred from zod
(`z.infer<typeof …>`), so there is no hand-maintained mirror of the wire shape anywhere.

Two real duplications remain:

1. **`PageMeta` re-declared inline.** `src/lib/http/response.ts:11-16` defines `PageMetaSchema`, and
   `listResponse()` wraps it. But `survey-campaigns/campaigns.schema.ts:244` and `:280` hand-write
   `meta: z.object({ page…, pageSize…, total…, totalPages… })` instead of using `listResponse`. Two
   endpoints therefore have a `meta` that is structurally identical but contractually independent —
   change `PageMetaSchema` and these two silently drift.
   *Classification:* `DUPLICATED_LOCAL_IMPLEMENTATION`, low impact, high signal.

2. **33 inline `z.object(...)` definitions inside route files** (not in `*.schema.ts`), concentrated
   in `complaints` (6), `public-surveys` (5), `call-center` (5). Example:
   `complaints/routes/admin/route.ts:18-20` defines `AttachmentPublicSchema`, `AttachmentAccessSchema`
   and `AttParam` in the route file. These are single-use and readable, but they break the
   `<feature>.schema.ts` convention stated in `README.md:87` and mean the contract for those payloads
   is not discoverable from the schema file.

## 5. Dynamically generated `operationId`s

Three route builders construct ids from template literals inside a loop:

```
src/modules/survey-campaigns/routes/admin/route.ts   → `${suffix…}SurveyCampaign`
src/modules/survey-qr/routes/admin/route.ts          → `${suffix}SurveyQr`
src/modules/surveys/routes/admin/route.ts            → `${suffix}Survey`
```

They expand at runtime into 20 concrete ids (`activateSurveyCampaign`, `pauseSurveyCampaign`,
`deactivateSurveyQr`, …) which **are** correct and unique in the exported document. This is not a
defect — it is DRY route generation.

But it has a real cost for governance: **no static tool can enumerate this API's operations from
source.** Any `check:routes` / `check:openapi` script must therefore work against the *exported*
document rather than the AST, which in turn means the export must be part of CI. That constraint
should be a deliberate V2 decision, not a discovery made later.

## 6. Response envelope conformance

Declared standard (`src/lib/http/response.ts:3-9`, `07-API-CONTRACT-STANDARD.md`):

```
success: { data, meta? }
error:   { error: { code, message, details?, context?, conflicts?, suggestedActions?, requestId } }
```

| Check | Result |
| --- | --- |
| `dataResponse()` / `listResponse()` / `MessageResponseSchema` used repo-wide | ✅ 27 modules use `listResponse`, all list endpoints return `{ data, meta }` |
| Routes returning bare `{ message }` without a `data` wrapper | **0** — `MessageResponseSchema` wraps it as `{ data: { message } }` |
| Routes returning a raw Prisma object | **0** — every handler maps through a service + zod response schema |
| Envelope differing between modules | **0** |
| Errors without a stable code | **0** — every path in `error-handler.ts` sets an `ErrorCode` |
| Branching on `message` | **0** |
| `requestId` present on every error | ✅ `error-handler.ts` sets it in all 6 branches |
| Stack traces to clients | **0** — `err` goes to `request.log`, never to `send()` |

**Envelope compliance: `STRUCTURED_COMPLIANT`.** This is the second-strongest area after permission
enforcement.

One asymmetry worth noting: `ErrorResponseSchema` (`response.ts:33-43`) declares `requestId`, but the
*error* envelope object built in `error-handler.ts` also uses `requestId` — consistent. However
`commonErrorResponses` is attached per-route by hand (`...commonErrorResponses`), so a route that
forgets it documents no error shape at all. Nine routes (§2) do exactly that. A route-level default
would remove the possibility.

## 7. `any` / unknown shapes in the contract

| Location | Shape | Verdict |
| --- | --- | --- |
| `response.ts:37` `details: z.any().optional()` | error details | acceptable — heterogeneous validation payloads |
| `response.ts:38-40` `context: z.record(z.string(), z.any())`, `conflicts: z.array(z.any())`, `suggestedActions: z.array(z.any())` | guided-error fields | ⚠ the "guided conflicts / suggested actions" contract from `08-ERROR-UX-STANDARD.md` is typed as `any[]`, so the frontend gets **no** generated type for the very fields designed to drive UI. |
| `as any` in `src/` | **1 hit, inside a comment** (`surveys.service.ts:583`) | ✅ effectively zero |

*V2:* type `conflicts` and `suggestedActions` as discriminated unions so guided errors are a real
contract rather than an untyped bag.

## 8. Generated-client readiness

Can a frontend client be generated with **no manual patching**?

| Blocker | Severity |
| --- | --- |
| Zero `components.schemas` → no shared models, N duplicate anonymous types | **high** |
| 9 operations with no documented success/error shape | medium |
| `context`/`conflicts`/`suggestedActions` typed `any` | medium |
| Everything else | clean |

Verdict: **generation succeeds, quality is poor.** The frontend will end up hand-writing or
re-declaring model types — which is exactly how "duplicate wire types" enter a codebase from the
*other* side of the contract.

## 9. Summary verdicts

| Dimension | Verdict |
| --- | --- |
| Every route has a request schema | ✅ 307/307 |
| Every route has a response schema | ⚠ 298/307 (`PARTIAL_STRUCTURED`) |
| Error schemas documented | ⚠ per-route opt-in; missing on the same 9 |
| Status codes correct | ✅ no `WRONG_STATUS_CODE` found; 429/409/422 all mapped |
| OpenAPI is source of truth | ✅ in principle, ⚠ unusable as a model source (no components) |
| Duplicate hand-written wire types | ✅ none in source; ⚠ N duplicates *generated* by the inline transform |
| Undocumented response shapes | 9 |
| Unregistered schemas | **all of them** (`components.schemas: 0`) |
| Schema-name collisions | none possible (no names) |
| Multiple/contradictory OpenAPI URLs | none — one `/docs`, one `openapi.json` |
