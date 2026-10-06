# D-OCR-B7 — Playwright E2E acceptance

## Spec

| Item | Path |
|------|------|
| Playwright spec | `APP/frontend/e2e/driving-license-ocr.spec.ts` |
| Fixture image | `APP/frontend/e2e/fixtures/driving-license/uae-driving-license-ocr-test.png` |
| Expectations JSON | `APP/frontend/e2e/fixtures/driving-license/uae-driving-license-ocr-expectations.json` |
| Seed / audit helpers | `APP/frontend/e2e/helpers/driving-license-ocr.ts` |
| DB audit script | `APP/backend/scripts/e2e-audit-driving-license-ocr.ts` |

## Architecture

```
Browser (3100)
  → POST /contracts/rental/:token/driving-license
  → Fastify backend (8000)
  → DOCUMENT-ENGINE/LICENSE (8020) Crop V1 + OCR V1.1
  → Postgres persistence
  → GET context → ContractStep prefill (B5)
```

Browser **never** calls `:8020` directly (monitored in spec).

## Run command

```powershell
# Terminals: Licence :8020, backend (UAE_DRIVING_LICENSE_API_URL), frontend :3100, Postgres
cd APP\frontend
$env:PLAYWRIGHT_API_URL="http://localhost:8000"
$env:PLAYWRIGHT_BASE_URL="http://localhost:3100"
$env:UAE_DRIVING_LICENSE_API_URL="http://127.0.0.1:8020"
npx playwright test e2e/driving-license-ocr.spec.ts --project=chromium-en-desktop
```

Playwright project `chromium-en-desktop` (en-GB, 180s timeout) added in `playwright.config.ts`.

## Fixture semantics (John Wick)

| Signal | Expected |
|--------|----------|
| Engine `document_status` | `REVIEW_REQUIRED` |
| UI licence panel | `license-unreadable` (verification `UNREADABLE`) |
| **Not** | `license-valid` |

Prefill (from expectations JSON): name, nationality, licence #, DOB, place; issue/expiry often empty.

## Selectors

| Control | Locator |
|---------|---------|
| Licence step | `getByTestId('license-step')` |
| File input | `[data-testid="license-capture"] input[type="file"]` |
| OCR loading | `getByTestId('license-verifying')` (optional) |
| Terminal partial | `getByTestId('license-unreadable')` |
| Customer form | `getByTestId('contract-step')` |
| OCR banner | `getByTestId('ocr-review-notice')` |
| Fields | `getByPlaceholder('Full name')`, etc. |
| Save | `getByRole('button', { name: /Save details/i })` |
| Return to licence after FORM | `getByRole('button', { name: /Document Verification/i })` |

## Assertions (main test)

1. Real file upload → `POST …/driving-license` 2xx  
2. Partial UI + prefill from engine  
3. Manual correction `Duba` → `DUBAI`; edit survives blur  
4. `POST …/form` 2xx  
5. DB: `Customer.drivingLicensePlaceOfIssue = DUBAI`, extraction `placeOfIssue = Duba`  
6. Reload: no second licence upload; confirmed place still `DUBAI`  
7. `BROWSER_DIRECT_LICENSE_ENGINE_CALLS = 0`

## Application fixes exposed by B7

| Change | Reason |
|--------|--------|
| OCR HTTP **outside** Prisma tx on upload | Real engine > 5s tx timeout |
| `submitPublicForm` allows `UNREADABLE` / `REVIEW_REQUIRED` partial save | Customer can save reviewed metadata before VALID licence |
| `ContractStep` on licence stage when extraction exists | B5 UI wired for E2E |
| `data-testid="license-capture"` | Stable file input |

## Results (2026-10-05)

| Run | Result |
|-----|--------|
| Playwright consecutive ×2 | **2 / 2** pass (2 tests each) |
| Backend OCR integration | **15 / 15** |
| Frontend unit | **742 / 742** |

## Trace / artifacts

- `trace: on-first-retry`, `screenshot: only-on-failure` (config)  
- Main test attaches PNGs: before upload, prefill, after correction, after reload  

## Verdict

**`DIAMOND_LICENSE_OCR_PLAYWRIGHT_E2E_PASS`**
