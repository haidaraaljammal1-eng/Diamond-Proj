# 10 — File impact map (future implementation)

**Audit only — no changes made.**

## CREATE (likely)

| Path | Purpose |
|------|---------|
| `DOCUMENT-ENGINE/LICENSE/` (copied/adapted from external releases) | Crop + OCR runtime tree |
| `DOCUMENT-ENGINE/LICENSE/services/uae_license_api/` | FastAPI: `POST /extract-driving-license`, `GET /health` |
| `APP/backend/src/modules/document-engine/uae-license-api.client.ts` | HTTP client + types |
| `APP/backend/src/modules/document-engine/uae-license-api.types.ts` | Strict TS contracts |
| `APP/backend/tests/helpers/fake-uae-license-api.ts` | Test double |
| `APP/backend/tests/unit/uae-license-engine-policy.test.ts` | Policy mapping tests |
| `DOCU/00-system-overview/document-engine.md` | Extend LICENSE section |
| `APP/backend/scripts/dev-with-passport-api.ts` or successor | Orchestrate licence API in dev |

## MODIFY (likely)

| Path | Change |
|------|--------|
| `APP/backend/src/modules/contracts/ocr/driving-license-ocr.adapter.ts` | Call HTTP client |
| `APP/backend/src/modules/contracts/ocr/driving-license-ocr.types.ts` | Extended fields / partial success |
| `APP/backend/src/modules/contracts/driving-license-policy.ts` | Optional field-level rules |
| `APP/backend/src/config/env.ts` + `.env.example` | API URL, timeout, orchestrate flags |
| `APP/backend/package.json` | Dev script only if needed |
| `APP/frontend/.../public-rental.store.ts` | Prefill form from context |
| `APP/frontend/.../contract-step.tsx` | Default values from OCR DTO |
| `APP/frontend/messages/en.json`, `ar.json` | New licence OCR copy |
| `APP/backend/src/modules/contracts/public-rental-context.ts` | Expose OCR fields if added to schema |
| `APP/backend/src/modules/contracts/contracts.schema.ts` | Public DTO extensions |
| Prisma `contracts.prisma` | **If** persisting extra fields (migration) |

## READ-ONLY (reference)

| Path |
|------|
| `contracts.service.ts` `uploadDrivingLicense` |
| `passport-number-api.client.ts` |
| `public-identity-flow.test.ts` |
| External `UAE_LICENSE_CROP_V2`, `UAE_LICENSE_OCR_V1` (source of truth until vendored) |

## DO NOT TOUCH (blast radius)

Per AGENTS.md — **no changes** unless proven dependency:

- Stripe / payments, Car-Out/Car-In, reconciliation, road liabilities, GPS, TARS, WhatsApp, maintenance, archive, fleet CRUD.

Licence OCR touches **only** public rental identity + customer form + verification rows.

## Tests likely affected

- `tests/integration/public-identity-flow.test.ts`
- `tests/unit/vision-ai-document.test.ts` (licence adapter tests)
- `tests/integration/public-rental-flow.test.ts`
- `tests/unit/public-rental-flow.test.ts`
- Frontend `license-view` / contract step tests if added
