# Official Contract — Phase 1: Document Capture + Provider-Agnostic OCR

> **No OCR vendor is selected yet.** Runtime is `DOCUMENT_OCR_PROVIDER=UNCONFIGURED`. Real passport/license OCR returns "unavailable" until a provider adapter is added. This is intentional.

## Customer flow

```
Secure rental link
 → Step 1: Driver License   (capture → OCR → expiry check)   ── hard gate
 → Step 2: Passport         (unlocked only when license VALID)
 → identityReady = license VALID AND passport READY
 → Continue → Official Contract Review (future phase)
```

The backend is authoritative for every gate. The browser never sends validity, contract/vehicle/customer ids, rates or dates. Everything resolves from the rental token.

## Architecture

```
public route ─► contracts.service ─► document-ocr.service.analyzeDocument(type, file)
                                         │  capability check, error sanitizing,
                                         │  key whitelist + normalization
                                         ▼
                              DocumentOcrProvider (factory-selected)
                                 ├─ UnconfiguredDocumentOcrProvider  (runtime default, fails closed)
                                 └─ <future vendor adapter>
```

| Piece | File |
| ----- | ---- |
| Document types, provider ids, failure reasons | `src/modules/document-ocr/document-ocr.constants.ts` |
| `DocumentOcrProvider`, `NormalizedIdentityDocumentResult` | `src/modules/document-ocr/document-ocr.types.ts` |
| Provider selection (the only place) | `src/modules/document-ocr/document-ocr-provider.factory.ts` |
| Normalization / sanitizing | `src/modules/document-ocr/document-ocr.service.ts` |
| License adapter → existing license policy | `src/modules/contracts/ocr/driving-license-ocr.adapter.ts` |
| Passport success rule | `src/modules/contracts/passport-extraction-policy.ts` |
| `ContractIdentityDraft` (derived, with provenance) | `src/modules/contracts/contract-identity-draft.ts` |
| Test-only fake provider | `tests/helpers/fake-document-ocr-provider.ts` |

- **Driver License:** the existing `evaluateDrivingLicenseOcr` rules are unchanged: expiry by business-timezone calendar date, then confidence. Only VALID unlocks the passport.
- **Passport:** READY needs `documentRecognized` plus `fullName` or `passportNumber`. Otherwise the result is `NOT_RECOGNIZED`, `FAILED` (unreadable) or `PROVIDER_UNAVAILABLE`. There is no passport-expiry gate.
- **Storage:** `PassportExtraction` holds normalized columns only, one row per `ContractDocument(PASSPORT)` attempt. There are no raw vendor payloads and no image bytes. Images stay in the Attachment store.
- **Stale results:** a retake supersedes the previous document. OCR runs outside the transaction, and its result is written only if its document is still active, so a slow earlier attempt can never overwrite a newer one. An interrupted PROCESSING attempt older than 2 minutes reads as FAILED.
- **ContractIdentityDraft** is computed from the latest license and the active passport, never stored. Retaking a license with an invalid result immediately revokes `identityReady`.
- **Not done by this flow:** no Customer create/update, no legal snapshot, no PII in audit/outbox/logs.

## Public API

| Method | Path | Returns |
| ------ | ---- | ------- |
| GET | `/contracts/rental/:token` | context incl. `identity` status |
| POST | `/contracts/rental/:token/driving-license` | context |
| POST | `/contracts/rental/:token/passport` | context (normalized fields only) |
| GET | `/contracts/rental/:token/identity` | public `ContractIdentityDraft` |

The customer UI maps statuses to safe copy. It never shows reason codes or provider names.

## Adding an OCR provider later (adapter only)

1. Create `src/modules/document-ocr/providers/<vendor>-document-ocr.provider.ts` implementing `DocumentOcrProvider`, with `capabilities`.
2. Map the vendor response → `fields` (normalized keys), `documentRecognized`, `confidence`, `fieldConfidence`. Map vendor errors → `DOCUMENT_OCR_*` reasons.
3. Add the vendor id to `DOCUMENT_OCR_PROVIDER_IDS` and its credentials to `src/config/env.ts` / `.env.example`.
4. Register it in `createDocumentOcrProvider()`.

Nothing else changes: not the frontend, the public API, `PassportExtraction`, `ContractIdentityDraft`, Contract Review, or vehicle/rental code.
