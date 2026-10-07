# D-OCR-B2 — Fastify ↔ isolated Licence engine bridge

## Architecture

```
POST /contracts/rental/:token/driving-license (multipart `file`)
  → contracts.service uploadDrivingLicense (Attachment unchanged)
  → driving-license-ocr.adapter
  → uae-driving-license-api.client (HTTP)
  → DOCUMENT-ENGINE/LICENSE :8020
```

Passport (`8010`) and Licence (`8020`) clients and health checks are **independent**.

## Environment

| Variable | Purpose |
|----------|---------|
| `UAE_DRIVING_LICENSE_API_URL` | Base URL (e.g. `http://127.0.0.1:8020`) |
| `UAE_DRIVING_LICENSE_API_TIMEOUT_MS` | Default **120000** (Crop + OCR + serial queue; B1 ~30–90s) |
| `UAE_DRIVING_LICENSE_API_ORCHESTRATE` | Dev auto-start when URL is localhost (`false` to disable) |

## Client contract

- `GET /health` → `checkUaeDrivingLicenseApiHealth()`
- `POST /extract-driving-license` multipart field **`image`**
- Success body validated with **Zod** (`SuccessBodySchema`); malformed → `LICENSE_OCR_INVALID_RESPONSE`

## Date conversion

OCR visible `DD-MM-YYYY` / `DD/MM/YYYY` → ISO `YYYY-MM-DD` in `uae-driving-license-date.ts` at the adapter boundary only.

## Error mapping (HTTP → client code → adapter reason)

| Engine HTTP `error` | Client code | Adapter `reason` |
|---------------------|-------------|------------------|
| (no URL) | `NOT_CONFIGURED` | `NOT_CONFIGURED` |
| connection | `LICENSE_OCR_UNAVAILABLE` | `PROVIDER_UNAVAILABLE` |
| timeout | `LICENSE_OCR_TIMEOUT` | `PROVIDER_UNAVAILABLE` |
| `INVALID_IMAGE` | `LICENSE_OCR_INVALID_IMAGE` | `UNREADABLE` |
| `UNSUPPORTED_FORMAT` | `LICENSE_OCR_UNSUPPORTED_FORMAT` | `UNREADABLE` |
| `FILE_TOO_LARGE` | `LICENSE_OCR_FILE_TOO_LARGE` | `UNREADABLE` |
| `CROP_FAILED` / `TABLE_NOT_FOUND` | `LICENSE_OCR_CROP_FAILED` | `UNREADABLE` |
| worker/model | `LICENSE_OCR_MODEL_UNAVAILABLE` | `PROVIDER_UNAVAILABLE` |
| other 5xx | `LICENSE_OCR_INTERNAL_ERROR` | `UNREADABLE` |
| bad JSON shape | `LICENSE_OCR_INVALID_RESPONSE` | `UNREADABLE` |

`document_status: REVIEW_REQUIRED` remains a **successful** HTTP 200 business body; adapter returns `ok: true` with partial fields.

## Dev orchestration

`npm run dev` → `scripts/dev-with-document-engines.ts` starts Passport and Licence APIs separately when local URLs are configured.

## Tests

```bash
cd APP/backend
npm run test:unit -- tests/unit/uae-driving-license-api.client.test.ts tests/unit/uae-driving-license-date.test.ts
RUN_INTEGRATION=true TEST_DATABASE_URL=... npm run test:integration -- tests/integration/driving-license-engine-bridge.test.ts
```

## Real smoke (manual)

1. Start `DOCUMENT-ENGINE/LICENSE` on `8020`
2. Set `UAE_DRIVING_LICENSE_API_URL` in backend `.env`
3. `POST /contracts/rental/:token/driving-license` with a real licence image

### Smoke (real02.jpg via adapter → :8020)

| Field | Value |
|-------|--------|
| licenseNumber | 90527 |
| expiryDate (ISO) | 2021-09-11 |
| holderName | RISHAD PADAIH BASHEEK PADAIO S |
| nationality | INDIA |
| dateOfBirth | 1990-05-03 |
| issueDate | 2019-09-12 |
| placeOfIssue | HAB |
| documentStatus | ACCEPT |
