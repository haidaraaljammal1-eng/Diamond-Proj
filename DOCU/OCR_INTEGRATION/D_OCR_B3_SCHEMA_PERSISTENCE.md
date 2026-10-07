# D-OCR-B3 — Driving licence extraction schema & persistence

## Models

### `DrivingLicenseExtraction`

Machine OCR snapshot for one `DRIVING_LICENSE` `ContractDocument` (1:1 `documentId` unique). Immutable after insert.

| Field | Role |
|-------|------|
| `status` | `DrivingLicenseExtractionStatus` (READY / PARTIAL / FAILED / …) |
| `engineDocumentStatus` | Engine `document_status` (ACCEPT / REVIEW_REQUIRED / REJECT) |
| `licenseNumber` … `placeOfIssue` | Seven normalized English fields |
| `fieldsMeta` | Per-field engine metadata (status, confidence, crop, engine) |
| `jobId`, `provider`, `providerVersion` | Engine provenance |

### `DrivingLicenseVerification`

Unchanged policy gate. Optional `extractionId` links to the snapshot for the same upload.

### `Customer` (additive)

Nullable: `dateOfBirth`, `drivingLicenseIssueDate`, `drivingLicensePlaceOfIssue` — **form-confirmed only** (not populated from OCR in B3).

## Migration

- Path: `APP/backend/prisma/migrations/20261004120000_driving_license_extraction/migration.sql`
- Classification: **ADDITIVE_SAFE_MIGRATION** (new table, nullable columns, no drops)

Apply (development):

```bash
cd APP/backend
npm run db:generate
npx prisma migrate deploy   # or npm run db:migrate when Postgres is up
```

## Persistence lifecycle

1. Licence upload supersedes prior `ContractDocument` (unchanged).
2. OCR runs **outside** extended locks (same as before: OCR before/alongside tx — currently OCR runs before verification write inside one transaction after OCR returns).
3. On `ocr.ok === true` → `DrivingLicenseExtraction` insert + verification with `extractionId`.
4. On provider failure → verification only; **no** extraction row.
5. Re-upload → new document, new extraction, new verification; old rows retained.

## Machine vs confirmed

| Layer | Source |
|-------|--------|
| `DrivingLicenseExtraction` | OCR adapter (typed B2 result) |
| `DrivingLicenseVerification` | `evaluateDrivingLicenseOcr` policy |
| `Customer` | Public form submit (future B4/B5) |

## Code paths

- Mapper: `driving-license-extraction.mapper.ts`
- Repository: `driving-license-extraction.repository.ts`
- Upload: `contracts.service.ts` → `uploadDrivingLicense` / `simulateDrivingLicense`
- Adapter: `fieldsMeta` built in `driving-license-ocr.adapter.ts`

## Tests

```bash
cd APP/backend
node --import tsx --test tests/unit/driving-license-extraction.mapper.test.ts

# Integration (requires Postgres + TEST_DATABASE_URL + RUN_INTEGRATION=true)
npm run test:integration:prepare
RUN_INTEGRATION=true TEST_DATABASE_URL=... node --import tsx --test tests/integration/driving-license-extraction-persistence.test.ts
```

## Verdict

`D_OCR_B3_SCHEMA_PERSISTENCE_READY` once migration is applied in your environment and integration tests pass.

---

## B3V — Database verification (2026-10-04)

### Databases

| Database | Host | Purpose |
|----------|------|---------|
| `diamond` | `localhost:5432` | Development (`DATABASE_URL` from `.env`) |
| `haidara_test` | `localhost:5432` | Integration tests (`TEST_DATABASE_URL`) |

Postgres started via `npm run dev:postgres:start`; `haidara_test` created locally for disposable integration runs.

### Migration

- **Before:** `20261004120000_driving_license_extraction` pending on `diamond`; `haidara_test` did not exist initially.
- **Apply:** `npx prisma migrate deploy` on `diamond` and full chain on `haidara_test`.
- **After:** both databases **44/44 migrations**, schema up to date (`dev:check` CONNECTED, migrations UP TO DATE).
- **SQL review:** **ADDITIVE_SAFE_MIGRATION** (unchanged from B3).

### DB objects verified (psql on `diamond`)

- Table `driving_license_extractions` with seven value columns + `fieldsMeta` JSONB.
- Enum `DrivingLicenseExtractionStatus`: PROCESSING, READY, PARTIAL, FAILED, PROVIDER_UNAVAILABLE.
- `customers.dateOfBirth`, `drivingLicenseIssueDate`, `drivingLicensePlaceOfIssue` (nullable).
- `driving_license_verifications.extractionId` + FK to extractions; unique `documentId` on extractions.

### Integration results (`haidara_test`)

`tests/integration/driving-license-extraction-persistence.test.ts`: **7 passed / 0 failed / 0 skipped**

Covers: ACCEPT (7 fields + `fieldsMeta`), REVIEW_REQUIRED partial, EXPIRED vs engine ACCEPT, OCR vs Customer separation, reupload history, provider failure (no extraction row), DB reload without adapter.

`tests/integration/driving-license-engine-bridge.test.ts`: **1 passed** (B2 regression).

Unit: mapper + licence client + passport-number policy — **11 passed**.

### Date / fieldsMeta round-trip

Asserted in integration suite via `formatStoredExpiry` (e.g. DOB `1990-05-03`, expiry `2021-09-11`) and `fieldsMeta` JSON reload (e.g. `license_number.status`, `expiry_date.status` on REVIEW_REQUIRED).

### Legacy compatibility

Nullable customer columns; contracts without extraction rows still created and served in tests before first upload; `dev:check` reports contracts table AVAILABLE after migration.

### B3V verdict

**`D_OCR_B3_DATABASE_VERIFIED_READY_FOR_B4`**
