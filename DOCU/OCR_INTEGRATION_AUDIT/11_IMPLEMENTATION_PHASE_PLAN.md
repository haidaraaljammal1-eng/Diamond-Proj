# 11 — Minimal implementation phases (proposed)

Based on audit findings only. **Not executed.**

## D-OCR-B1 — Document Engine packaging

- Vendor `DYNAMIC_CROP_V1` + `OCR_ENGLISH_V1_1_RUNTIME` into `DOCUMENT-ENGINE/LICENSE/` (copy, no logic changes).
- Single Python FastAPI app: image in → crop job dir → OCR → JSON out.
- Long-lived process; warm `EnglishOcrPipeline` + PP-OCRv5 worker.
- `GET /health`, parity tests against external regression outputs.

## D-OCR-B2 — Backend bridge

- `uae-license-api.client.ts` + env vars.
- Wire `driving-license-ocr.adapter.ts` (replace `NOT_CONFIGURED`).
- Map to existing `DrivingLicenseOcrResult` + extend types for extra fields (response-only until schema decision).
- Unit tests + fake client (mirror passport).

## D-OCR-B3 — Dev orchestration

- Extend `dev-with-passport-api.ts` or parallel script to start licence API on localhost.
- Document in `document-engine.md`.

## D-OCR-B4 — Data model decision gate

- **Option A:** Form prefill only (no new Prisma fields) — number/expiry in verification; name/nationality via client-side prefill until form submit.
- **Option B:** New `LicenseExtraction` table (mirror `PassportExtraction`) — migration + bootstrap update.
- **Required before** claiming legal persistence for DOB/issue/place.

## D-OCR-B5 — Frontend autofill UX

- After upload, merge OCR into `contract-step` defaults + licence panel (optional extra read-only fields).
- REVIEW_REQUIRED / UNREADABLE messaging (i18n).

## D-OCR-B6 — Security & ops

- Per-job temp dirs, size limits, serial queue, structured errors, no PII logs.
- Integration tests: `public-identity-flow` with fake API; optional live regression job in CI (gated).

## D-OCR-B7 — E2E

- Playwright public rental licence upload (headed optional) on frozen sample.
- Verify form prefill + verification status + no Gemini.

## Test strategy (AUDIT 37) — not written yet

- Backend unit: client, policy, adapter.
- Python: crop→OCR parity, worker-down, bad image.
- Integration: public identity, provider unavailable.
- E2E: autofill form fields.

## Date semantics (AUDIT 26)

- OCR: DD/MM/YYYY strings.
- Diamond policy: `parseCalendarDate` → `YYYY-MM-DD` ISO strings in OCR result → `calendarDateToStoredUtc` for DB.
- Conversion boundary: **adapter** after HTTP response, before `evaluateDrivingLicenseOcr`.

## Name / nationality (AUDIT 27–28)

- Preserve OCR casing unless product asks otherwise (no forced uppercase in audit).
- Nationality: **free text** on `Customer` — OCR English text maps directly; no enum required.

## Expiry validation (AUDIT 30)

- **OCR extracts; Diamond validates** (`isLicenseExpiredOn`, confidence thresholds) — keep separation.
