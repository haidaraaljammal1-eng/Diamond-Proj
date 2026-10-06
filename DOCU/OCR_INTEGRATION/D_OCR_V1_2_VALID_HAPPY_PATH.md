# D-OCR V1.2H — Two-field real fixture validation and policy clock

## Fixture (local diagnostic)

| Item | Value |
|------|--------|
| Source | User-attached UAE licence (Marlon reference); copied locally only |
| Local path | `DOCUMENT-ENGINE/LICENSE/output/v1_2h_local_fixture/marlon_reference.png` |
| Dimensions | 701×438 px |
| Git | **Not committed** — treat as local diagnostic until explicit privacy approval |
| Playwright override | `PLAYWRIGHT_V12H_LICENSE_FIXTURE` (absolute path) |

Expected values (scoring only — not hardcoded in OCR):

- License number: `1893918`
- Expiry (visible): `13/04/2023` → Diamond ISO `2023-04-13`

## Stage A — Engine read (unchanged V1.2)

Run: `DOCUMENT-ENGINE/LICENSE/scripts/stage_a_v12h_diagnostic.py`

| Check | Result |
|-------|--------|
| Geometry | `GEOMETRY_OK` |
| Table bbox | `[154, 149, 699, 412]` |
| Width / height ratio | ~0.78 / ~0.60 |
| Row 1 / 7 | `license_number`, `expiry_date` |
| License OCR | `1893918` (`P7_OTSU_UP2_PAD`, conf ~0.96) |
| Expiry OCR | `13/04/2023` (`P0_RAW`, conf ~0.98) |
| Document | `ACCEPT` |

Artifacts: `DOCUMENT-ENGINE/LICENSE/output/v1_2h_stage_a/` (`stage_a_diagnostic.json`, crops).

**OCR code changes for Stage A:** NO (`CURRENT_V1_2_TWO_FIELD_READ = PASS`).

## Diamond policy (separate from OCR)

Rule (calendar date in business timezone):

- Complete licence number + complete expiry + **expiry > policy today** → `VALID`
- Same reads + **expiry ≤ policy today** → `EXPIRED`
- Either field unreadable → `UNREADABLE` / re-upload

Expiry on the last valid calendar day is **EXPIRED** (inclusive end date).

## Stage B — Real clock

With OCR result `1893918` / `2023-04-13` and real current date:

- `DrivingLicenseVerification.status` = **EXPIRED**
- OCR success is not a failure; only policy marks expired.

## Stage C — Test-only policy clock

| Layer | Behaviour |
|-------|-----------|
| `:8020` / Crop / Python | Unaffected — no test clock |
| Diamond upload route | `resolveLicensePolicyNow(request)` before `evaluateDrivingLicenseOcr` |

**Guards:**

- `NODE_ENV === "production"` → header ignored; startup rejects `E2E_ALLOW_LICENSE_POLICY_CLOCK=true`
- Non-production: `E2E_ALLOW_LICENSE_POLICY_CLOCK=true` required
- Header: `X-E2E-License-Policy-Date: YYYY-MM-DD` (date-only)

**Fixed test date:** `2023-01-01` → Marlon expiry `2023-04-13` → **VALID**

Implementation: `APP/backend/src/modules/contracts/license-policy-clock.ts`

Playwright injects the header via `page.route` on `POST …/driving-license` only (`installLicensePolicyDateRoute`).

## Playwright

File: `APP/frontend/e2e/driving-license-ocr.spec.ts`

| Scenario | Clock | Expected |
|----------|-------|----------|
| Marlon local fixture | Real | `EXPIRED`, extraction `1893918` |
| Marlon local fixture | `2023-01-01` (header) | `VALID`, read-only number/expiry in UI, manual customer fields, submit + reload |

Requires: licence engine `:8020`, backend with `E2E_ALLOW_LICENSE_POLICY_CLOCK=true`, `UAE_DRIVING_LICENSE_API_URL` set.

## OCR output identity

Same image and engine output in both policy runs; only `resolveLicensePolicyNow` differs.

`OCR_OUTPUT_IDENTICAL_BETWEEN_CLOCK_TESTS = true` (same `licenseNumber` / expiry in extraction rows).

## Production safety

No production env knob for shifting legal expiry evaluation. Policy clock is header + env gate, both disabled in production.

`PRODUCTION_CLOCK_OVERRIDE_POSSIBLE = false` (`env.ts` refine + `resolveLicensePolicyNow` production guard; `license-policy-clock.test.ts`).

---

## FINAL LIVE VERIFICATION (D-OCR-V1.2V — 2026-10-05)

Environment: local Windows stack; Marlon fixture **gitignored** (not staged).

| Step | Result |
|------|--------|
| Postgres `diamond` @ localhost:5432 | Ready; **44 migrations**, schema up to date |
| `:8020` `GET /health` | **READY**, `engine`: `OCR_ENGLISH_V1_2_TWO_FIELD` |
| Python `tests/test_two_field_v1_2.py` | **3 passed**, 0 failed, 0 skipped (`.venv` interpreter; `pytest` installed in venv for this run) |
| Engine probe `POST /extract-driving-license` (Marlon) | `license_number` **1893918**, `expiry_date` **13/04/2023**, document **ACCEPT** |
| Backend `:8000` | Started with `UAE_DRIVING_LICENSE_API_URL` + `E2E_ALLOW_LICENSE_POLICY_CLOCK=true` |
| Frontend `:3100` | Started (Next dev) |
| Playwright `driving-license-ocr.spec.ts` | **4/4 PASS** (Mohammad unreadable, corpus expired, Marlon EXPIRED real clock, Marlon VALID `2023-01-01`) |
| OCR identity EXPIRED vs VALID runs | Same extraction values; only `DrivingLicenseVerification.status` differs |
| VALID UI | Read-only licence **1893918** / display **13/04/2023** (`formatLicenseExpiry`); manual fields empty then fictional E2E data |
| DB after VALID path | Verification **VALID**; extraction **1893918**; Customer manual fields persisted; reload keeps same extraction id (no re-OCR) |
| Frontend unit suite | **741** tests, **0** failed, **0** skipped |
| Backend targeted licence/passport units | **28** passed (listed suites in V1.2V report) |

**Frontend test count vs historical 742:** `public-rental-form-prefill.test.ts` adds **+2** `it` blocks vs `main` (source grep 766→768). Node runner total **741** is the current aggregate; the one-test gap vs an older **742** figure is **reporting/counting** (runner suites vs manual expectation), not a missing licence test file.

**Verification-only E2E fixes (not OCR):** Playwright assertions use UI expiry **DD/MM/YYYY**; passport simulation + form POST wait for Customer persistence; reload navigates to Document Verification step.

**Immutability this gate:** no OCR V1.1/V1.2 algorithm, Crop V1, Passport, or Prisma schema changes during V1.2V.
