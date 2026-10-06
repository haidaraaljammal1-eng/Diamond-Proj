# D-OCR-B4 — Persisted extraction in public rental context

## Summary

`DrivingLicenseExtraction` rows for the **active** (`supersededAt` null) driving-licence `ContractDocument` are mapped into `PublicRentalContext.drivingLicenseExtraction`.

Policy remains on `licenseVerification`. Confirmed person/licence metadata remains on `customer` (including nullable `dateOfBirth`, `drivingLicenseIssueDate`, `drivingLicensePlaceOfIssue`).

## DB → context

```
Contract
  └─ drivingLicenseExtractions (where document.supersededAt IS NULL, latest)
        └─ mapDrivingLicenseExtractionForPublicContext()
              └─ drivingLicenseExtraction DTO
```

`GET /contracts/rental/:token` uses `loadPublicRental` → **no OCR engine calls**.

Upload `POST …/driving-license` returns the same mapper output after persistence (no in-memory overlay).

## DTO

- **Path:** `PublicDrivingLicenseExtractionSchema` in `contracts.schema.ts`
- **Mapper:** `public-driving-license-extraction.mapper.ts` → `mapDrivingLicenseExtractionForPublicContext`
- **Fields:** `licenseNumber`, `holderNameEn`, `nationality`, `dateOfBirth`, `issueDate`, `expiryDate`, `placeOfIssue`
- Each field: `value` + optional `ocrStatus`, `confidence`, `cropStatus`, `ocrEligible`, `engine` from validated `fieldsMeta`
- Dates: `YYYY-MM-DD` (UTC noon storage, `formatStoredExpiry`)
- `jobId` and raw provider payloads are **not** exposed

## B5 prefill precedence (documented only)

1. If `customer` has a confirmed value for a field → show customer value in form.
2. Else if `drivingLicenseExtraction.fields.*.value` is usable → OCR candidate.
3. Else empty.

Backend does not merge OCR into `customer` in B4.

## Tests

```bash
cd APP/backend
node --import tsx --test tests/unit/public-driving-license-extraction.mapper.test.ts

RUN_INTEGRATION=true TEST_DATABASE_URL=postgresql://...@localhost:5432/haidara_test?schema=public \
  node --import tsx --test tests/integration/driving-license-public-context.test.ts
```

## Verdict

`D_OCR_B4_PUBLIC_CONTEXT_READY_FOR_FRONTEND` when unit + integration suites pass.
