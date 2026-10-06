# D-OCR-A3 — Database / persistence / form source-of-truth audit

**Date:** 2026-10-04 · **Read-only** (no schema, backend, or frontend changes).

## Executive summary

Diamond already separates **passport OCR payload** (`PassportExtraction`) from **verification/gating**. **Driving licence** still stores only policy output on `DrivingLicenseVerification` (number, expiry, status, aggregate confidence). B2 rich extraction is **transient** (`engineExtraction` only on the upload HTTP response).

**Recommendation:** **OPTION C** — add `DrivingLicenseExtraction` (1:1 active `ContractDocument`), keep `DrivingLicenseVerification` as **policy/gate**, extend `Customer` only for **human-confirmed** person/licence metadata after form submit.

**Verdict:** `D_OCR_A3_DATABASE_DESIGN_READY`

---

## Audit 1 — Relevant Prisma models (evidence)

### `DrivingLicenseVerification` (`contracts.prisma`)

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| id | String @id uuid | no | uuid | PK |
| contractId | String | no | — | → Contract, onDelete Cascade |
| documentId | String | no | — | → ContractDocument, onDelete Cascade |
| attachmentId | String | no | — | no FK to Attachment in schema |
| status | DrivingLicenseVerificationStatus | no | PENDING | policy outcome |
| licenseNumber | String? | yes | — | from OCR today |
| expiryDate | DateTime? | yes | — | UTC noon calendar convention |
| confidence | Float? | yes | — | aggregate |
| provider | String? | yes | — | |
| providerVersion | String? | yes | — | |
| verifiedAt | DateTime? | yes | — | set on create in upload flow |
| createdAt / updatedAt | DateTime | no | now | |

**Indexes:** `@@index([contractId, createdAt])` · **No unique** on documentId (history via multiple rows).

**Enum `DrivingLicenseVerificationStatus`:** PENDING, VALID, EXPIRED, UNREADABLE, REVIEW_REQUIRED, PROVIDER_UNAVAILABLE

### `PassportExtraction` (parallel pattern)

1:1 `documentId` @unique; normalized OCR columns; `status` PassportExtractionStatus; no raw JSON.

### `ContractDocument`

| Field | Type | Notes |
|-------|------|-------|
| id | String uuid | PK |
| contractId | String | → Contract |
| type | ContractDocumentType | DRIVING_LICENSE, PASSPORT, … |
| attachmentId | String | → Attachment |
| supersededAt | DateTime? | null = active |
| createdAt | DateTime | |

**Relations:** `verifications[]`, `passportExtractions[]` · **Index:** `[contractId, type, supersededAt]`

### `Attachment` (`files.prisma`)

id, originalName, storageKey @unique, mimeType, size, checksum?, uploadedById?, createdAt

### `Customer` (`operational.prisma`)

| Field | Type | Nullable |
|-------|------|----------|
| id | Int autoincrement | no |
| name | String | no |
| mobile, email | String? | yes |
| type | CustomerType | INDIVIDUAL default |
| nationality | String? | yes (free text) |
| identityNumber, passportNumber | String? | yes |
| drivingLicenseNumber | String? | yes |
| drivingLicenseExpiry | DateTime? | yes |
| address | String? | yes |
| **No** dateOfBirth, issueDate, placeOfIssue on licence | | |

### `Contract` (subset)

customerId?, snapshot Json?, status, relations: documents, licenseVerifications[], passportExtractions[]

### `ContractLink`

token hash, type RENTAL, contractId, expiry — public rental entry (not duplicated here).

---

## Audit 2 — `DrivingLicenseVerification` semantics today

**Mixture of B + partial A:** stores **OCR-derived** `licenseNumber` / `expiryDate` and **policy** `status` in one row.

| Action | Location |
|--------|----------|
| Created | `uploadDrivingLicense` after OCR + `evaluateDrivingLicenseOcr` |
| Read | `latestLicense` (newest by createdAt), `public-rental-context`, TARS mapper, official contract |
| Updated | Not updated in place; **new row** on re-upload |
| Frontend | `licenseVerification` on `PublicRentalContext` |

Adding name, nationality, DOB, issue, place **directly** on this model would **mix machine extraction with policy** and diverge from the passport split.

---

## Audit 3 — Customer source of truth

- **Customer created/linked** on `POST /rental/:token/form` (`submitPublicForm`), not on licence upload.
- **Form fields:** name, mobile, email, nationality, identityNumber?, passportNumber?, address? (`PublicFormSchema`).
- **Licence number/expiry on Customer** come from **`DrivingLicenseVerification`** at submit time, not from form body:

```1138:1147:APP/backend/src/modules/contracts/contracts.service.ts
      const materialized = {
        ...
        drivingLicenseNumber: verification.licenseNumber,
        drivingLicenseExpiry: verification.expiryDate,
```

- **OCR does not prefill** the form today; `contract-step` defaults from `context.customer` only (empty until after first form submit).
- After materialization, **GET context** prefers VALID verification for displayed licence on customer projection.

---

## Audit 4 — Contract / official document source

- **`Contract.snapshot`:** frozen at signing; not populated from licence OCR in upload path.
- **Official contract build** (`official-contract.ts`): hirer name/nationality from **review draft → passport OCR → Customer**; licence number/expiry from **identity draft (verification OCR) → Customer fallback**. Comment: licence fields **OCR-derived only** for official doc (no customer free-text override for licence number/expiry without business decision).
- **DOB on official contract** today comes from **passport** identity draft, not licence.

---

## Audit 5 — Public rental DTO / `engineExtraction`

**Path:** LICENSE HTTP → adapter `extraction` → `uploadDrivingLicense` → `loadPublicRental(..., { licenseEngineExtraction })` → `toPublicRentalContext` → `licenseVerification.engineExtraction` (optional).

**Zod:** `PublicLicenseEngineExtractionSchema` on `PublicLicenseVerificationSchema`.

**Frontend:** `engineExtraction` **not** in `public-rental.types.ts`; **no** frontend references (grep empty). Consumption is **future B5**.

**Reload:** `GET /contracts/rental/:token` uses `loadPublicRental` **without** overlay → **`engineExtraction` absent** after refresh.

---

## Audit 6 — B2 rich extraction vs engine

**Adapter success (`DrivingLicenseOcrSuccess`):** licenseNumber, expiryDate (ISO), holderName, confidence (min of licence+expiry field confidences), fieldConfidences {licenseNumber, expiryDate}, extraction { documentStatus, jobId, nameEn, nationality, dateOfBirth, issueDate, placeOfIssue }.

**Lost vs LICENSE HTTP:** per-field `status`, `crop_status`, `ocr_eligible`, per-field confidence (except indirectly for licence/expiry), `name_ar`, engines, runtime_ms. Document-level `REVIEW_REQUIRED` preserved in `extraction.documentStatus` but **does not** map 1:1 to `DrivingLicenseVerification.status` (policy uses number+expiry+confidence+expiry calendar only).

---

## Audit 7 — Options

| Option | Verdict |
|--------|---------|
| A — transient only | **Fails reload/resume** (proven today) |
| B — extend Verification with all fields | **Semantically muddy** (policy + full OCR) |
| **C — separate extraction model** | **Matches PassportExtraction**; clean audit trail |

---

## Audit 16–18 — Expired licence & status mapping

**Policy** (`evaluateDrivingLicenseOcr`): requires licence number + parseable expiry; confidence threshold on licence/expiry; then **EXPIRED** if expiry &lt; business today (Asia/Dubai offset). Engine **ACCEPT** with expiry `2021-09-11` → Diamond **EXPIRED**, not VALID (B2 smoke).

| LICENSE `document_status` | Diamond `DrivingLicenseVerification.status` |
|---------------------------|---------------------------------------------|
| ACCEPT (fields ok, conf ok, not expired) | VALID |
| ACCEPT (fields ok, conf low) | REVIEW_REQUIRED |
| ACCEPT (expired date) | EXPIRED |
| REVIEW_REQUIRED (partial OCR) | Often UNREADABLE or REVIEW_REQUIRED depending on number/expiry presence |
| REJECT / adapter failure | UNREADABLE or PROVIDER_UNAVAILABLE |

Engine ACCEPT ≠ human/legal VALID.

---

## Audit 20–21 — Re-upload lifecycle

Upload supersedes prior `ContractDocument` (`supersededAt`); creates **new** document + **new** `DrivingLicenseVerification` row. Old verification rows **remain** (audit history). Recommend **new extraction row per document attempt**, 1:1 `documentId` @unique (mirror passport).

---

## Audit 24–25 — PII & future prefill

Licence **image** already stored (`Attachment`). Persisting normalized extraction duplicates some PII but supports **reload, audit, and diff vs user edits** — proportional if columns are normalized (no image bytes). Future prefill needs **values + per-field review hints + editable flags** (see `D_OCR_A3_DATA_FLOW.md`).

---

## Audit 26–27 — Frontend form (read-only)

**Editable today:** name, mobile, email, nationality, identityNumber, passportNumber, address (`contract-step` + FormBuilder).

**Not on form:** licence number, expiry (shown read-only in contract sheet from verification/customer), DOB, issue date, place of issue.

**Files for future B5:** `contract-step.tsx`, `public-rental-form.fields.ts`, `public-rental-form.schema.ts`, `public-rental.types.ts`, hooks/store calling `POST .../form`.

---

## Audit 29 — Playwright (future)

| Layer | Use |
|-------|-----|
| Unit/backend integration | `fake-uae-driving-license-api` |
| Integration DB | gated route tests |
| Playwright | real UI + optional real engine on fixture licence; assert prefill → edit → submit → reload |

---

## Audit 30 — Migration risk

Additive nullable columns + new table + FKs; **no backfill required** for historical contracts; existing verification rows remain valid.

See also: `D_OCR_A3_SCHEMA_PROPOSAL.md`, `D_OCR_A3_DATA_FLOW.md`, `D_OCR_A3_FIELD_OWNERSHIP.json`.
