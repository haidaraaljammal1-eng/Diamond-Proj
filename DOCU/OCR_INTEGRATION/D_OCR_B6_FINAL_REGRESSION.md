# D-OCR-B6 — Final integration regression & Playwright readiness

**Phase:** verification / stabilization only (no new product behavior).  
**Date:** 2026-10-05 (Asia/Dubai).  
**Branch:** `main` @ `96cbce6a9c2a8ae44044c5732304dc6e5497cf02` (ahead of `origin/main` by 1; large OCR WIP unstaged).

## Baseline

| Item | Result |
|------|--------|
| Prisma (`diamond`) | 44 migrations applied; schema up to date |
| OCR migration `20261004120000_driving_license_extraction` | Applied on `diamond` (untracked in git until WIP lands) |
| Licence engine | `http://127.0.0.1:8020/health` → **READY** (crop_v1, tesseract, rapidocr_v4, ppocrv5_worker pid **17312**, model_integrity ok) |
| Passport engine | `http://127.0.0.1:8010` — **not reachable** during B6 (not required for licence-only regression) |
| Diamond backend / frontend | **Not running** during gate (ports 8000 / 3100 closed) |
| Backend `.env` | **Missing** `UAE_DRIVING_LICENSE_API_URL` (present in `.env.example` only) |

## Full-stack runtime (expected dev)

| Service | URL |
|---------|-----|
| Frontend | `http://localhost:3100` (`FRONTEND_URL` in backend `.env`) |
| Backend | `http://localhost:8000` (`PORT` in backend `.env`) |
| Licence engine | `http://127.0.0.1:8020` |
| Passport engine | `http://127.0.0.1:8010` |

Start: `cd APP/backend && npm run dev` (`dev-with-document-engines.ts` orchestrates local engines when URLs point at localhost).

## Real backend OCR smoke (Diamond → :8020)

**Not re-executed in B6:** no committed UAE licence image in the repository (`DOCUMENT-ENGINE/LICENSE/input` absent; `real02.jpg` / `real3.jpg` not on disk under repo or `UAE_LICENSE_OCR_V1` search).

**Last documented real-engine values** (D-OCR-B2, `real02.jpg` via adapter → :8020):

| Field | Machine value |
|-------|----------------|
| licenseNumber | 90527 |
| expiryDate (ISO) | 2021-09-11 |
| holderName | RISHAD PADAIH BASHEEK PADAIO S |
| nationality | INDIA |
| dateOfBirth | 1990-05-03 |
| issueDate | 2019-09-12 |
| placeOfIssue | HAB |
| documentStatus | ACCEPT |

**Action for B7:** commit a redacted test licence under `APP/backend/tests/fixtures/` or `DOCUMENT-ENGINE/LICENSE/tests/fixtures/` and record expected values — until then: **`PLAYWRIGHT_FIXTURE_REQUIRED`**.

## Integration coverage (fake engine + real DB)

Automated suites exercise the full Diamond path (upload → persistence → `GET /contracts/rental/:token` → form policy) without calling :8020.

| Suite | Tests | Focus |
|-------|------:|-------|
| `driving-license-engine-bridge.test.ts` | 1 | Public upload + fake engine client |
| `driving-license-extraction-persistence.test.ts` | 7 | DB rows, EXPIRED, correction, reupload, reload |
| `driving-license-public-context.test.ts` | 6 | Context, no OCR on GET, legacy null, partial |
| `public-rental-form-ocr-b5.test.ts` | 1 | Customer vs extraction on submit |
| **Integration subtotal** | **15** | |
| `public-driving-license-extraction.mapper.test.ts` | 6 | Context mapper |
| `uae-driving-license-api.client.test.ts` + date + extraction mappers + passport policy | 13+ | Bridge units |
| **OCR gate total (15 + 6 mapper)** | **21** | Matches B2–B5 baseline |

### Scenario matrix (integration)

| Scenario | Covered by |
|----------|------------|
| DB: ContractDocument + Extraction + Verification + `extractionId` + `fieldsMeta` | persistence ACCEPT test |
| Customer not mutated on OCR upload | persistence ACCEPT |
| GET returns `drivingLicenseExtraction`; **no engine on reload** | public-context parity test (`getFakeUaeDrivingLicenseExtractCallCount`) |
| HAB → ABU DHABI: extraction stays HAB; customer place updated | persistence + public-context + B5 |
| Licence # / expiry from verification at submit | B5 + policy code |
| EXPIRED verification + engine ACCEPT on extraction | persistence + public-context |
| REVIEW_REQUIRED / partial fields | persistence + public-context |
| `drivingLicenseExtraction = null` legacy | public-context |
| Reupload A→B, context shows B | persistence + public-context |
| Persistence after adapter blocked (DB-only reload) | persistence “DB reload” |
| Provider failure → no extraction row | persistence |

## Licence engine-only checks (live :8020)

| Check | Result |
|-------|--------|
| Invalid / empty image `POST /extract-driving-license` | HTTP **400**; engine remains **READY** |
| Worker PID before/after invalid request | **17312** → **17312** |
| Parallel invalid requests | Both complete (no worker crash); engine **READY** after |

**Not verified live in B6:** multi **successful** real uploads (worker PID reuse under load) — requires licence fixture.

## Frontend prefill contract (non-browser)

Validated in `public-rental-form-prefill.test.ts` + B5 integration:

- Precedence: **Customer confirmed → OCR candidate → empty**
- Fields: name, nationality, licence #, DOB, issue, expiry, place of issue
- `publicRentalFormMountKey` prevents re-applying OCR after user edit

## Regression totals (this session)

| Suite | Result |
|-------|--------|
| Frontend `npm test` | **742 / 742** pass |
| Backend OCR integration (4 files) | **15 / 15** pass |
| Backend OCR-related unit (client, date, mappers, passport policy) | **19 / 19** pass |
| Frontend `npm run build` | **OK** |
| Backend `npm run build` | **Blocked** by pre-existing TS errors in unrelated integration/unit files (not OCR mapper/adapter sources) |

## Lint / typecheck

| Area | NEW_OCR_INTEGRATION_LINT_ERRORS | Notes |
|------|----------------------------------|-------|
| Backend lint | **0** new OCR-only | Repo-wide lint: 34 errors (mostly whatsapp / unrelated) |
| Frontend lint | **0** new OCR-only | Repo-wide: 11 errors (whatsapp hooks, etc.) |
| Backend typecheck | **0** after B6 test helper alignment (`ocr_eligible` on fake engine fields) | Unrelated repo errors remain (`customer-identity-resolution`, `vision-ai-document`, contract `durationValue`, etc.) |
| Frontend typecheck | **0** | Clean |

## Immutability (B6 session)

| Check | Result |
|-------|--------|
| `PRISMA_SCHEMA_CHANGED_IN_B6` | **0** (no schema edits during B6) |
| `NEW_MIGRATIONS_IN_B6` | **0** |
| `LICENSE_FROZEN_OCR_FILES_CHANGED` | **0** (`git diff` clean under `DOCUMENT-ENGINE/LICENSE/frozen`) |
| `LICENSE_FROZEN_CROP_FILES_CHANGED` | **0** |
| `PASSPORT_FILES_CHANGED` | **0** |

## Privacy / logs

Integration run logs include **fake** test values (`TEST DRIVER`, `90527`) from the test double — expected. No raw image bytes or Python tracebacks observed in backend test output. Production logging policy: job/status codes only (unchanged in B6).

## Playwright readiness (B7 — do not implement in B6)

### Route

`/{locale}/rental/{token}` — e.g. `http://localhost:3100/en/rental/<token>`  
(`APP/frontend/src/app/[locale]/rental/[token]/page.tsx`)

### Recommended selectors

| UI | Selector strategy |
|----|-------------------|
| Rental page shell | `getByTestId('rental-summary')` or progress `getByText(/Document Verification/i)` |
| Licence step | `getByTestId('license-step')` |
| OCR loading | `getByTestId('license-verifying')` |
| Licence upload | **Gap:** `LicenseUpload` supports `testId` but `license-step` does not pass it — use `getByRole('button', { name: /Upload Driving License/i })` + `locator('input[type=file]')` or add `testId="license-capture"` in B7 |
| Valid / expired / review | `license-valid`, `license-expired`, `license-review`, `license-unreadable` |
| Contract form | `getByTestId('contract-step')` |
| OCR banner | `getByTestId('ocr-review-notice')` |
| Form fields | `getByPlaceholder` with English labels from `PublicRental.contract.fields.*` (e.g. `Full name`, `Driving licence number`, `Date of birth (YYYY-MM-DD)`) |
| Save | `getByRole('button', { name: /Save details/i })` |
| Dev simulation (until real OCR E2E) | `getByTestId('simulate-license-valid')` |

Passport step (identity gate): `passport-capture`, `identity-continue`.

### Fixture plan

| Item | Value |
|------|--------|
| Path | **`PLAYWRIGHT_FIXTURE_REQUIRED`** — no safe committed licence image in repo |
| Expected OCR (when `real02` available) | See B2 table above |
| Policy | Engine `ACCEPT` may map to `EXPIRED` verification if expiry in past |

### B7 test data setup

Reuse `APP/frontend/e2e/helpers/e2e-api.ts`:

1. `staffToken()` → login staff API  
2. `seedAvailableVehicle(token, { label })` → unique plate vehicle  
3. Staff UI or API: create offer + `POST /contracts/:id/rental-link` (see `electronic-rental.flow.spec.ts` / `generateElectronicLink`)  
4. `extractRentalToken(href)` → open public page  
5. For OCR E2E: **replace** `completeIdentitySimulation()` with real file upload once fixture exists  
6. Teardown: `deactivateVehicle` (existing E2E pattern)

Avoid relying on mutable manual `diamond` rows; use per-run vehicle label + integration DB reset is **not** required for Playwright against dev `diamond` if helpers create isolated vehicles.

### B7 assertion checklist (future)

1. Page loads  
2. Licence upload visible  
3. File upload  
4. `license-verifying` visible  
5. OCR completes (`license-valid` or `license-expired` / `license-review`)  
6. Contract step shows expected prefilled values  
7. All OCR-backed fields visible  
8. Edit field → value retained  
9. Submit → customer confirmed values persisted  
10. Refresh → confirmed values; extraction unchanged in API  
11. No unexpected console errors / failed network  
12. Screenshots + trace on failure  

## Remaining blockers

1. **No committed licence test image** → B7 real-OCR E2E blocked (`PLAYWRIGHT_FIXTURE_REQUIRED`).  
2. **Live Diamond → :8020 smoke not re-run in B6** (no local fixture; backend not started with `UAE_DRIVING_LICENSE_API_URL`).  
3. **Passport engine** not verified running (identity E2E still uses simulation).  
4. **Licence upload `data-testid`** not wired on license step (minor B7 ergonomics).  
5. Add `UAE_DRIVING_LICENSE_API_URL=http://127.0.0.1:8020` to developer `.env` for real dev uploads.

## Verdict

**`D_OCR_B6_PLAYWRIGHT_FIXTURE_BLOCKED`**

Integration regression and frontend baseline pass; licence engine healthy; Playwright planning complete. Unblock B7 by committing a redacted licence fixture and re-running one live `POST /contracts/rental/:token/driving-license` smoke through :8020 to refresh machine values.
