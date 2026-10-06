# 03 — OCR / document code in Diamond

Classification: **ACTIVE** | **DEAD_CODE** | **EXPERIMENTAL** | **LEGACY** | **NOT_REFERENCED**

## Active (rental production paths)

| Component | Status | Notes |
|-----------|--------|-------|
| `document-engine/passport-number-api.client.ts` | **ACTIVE** | Public passport upload |
| `passport-extraction-policy.ts` | **ACTIVE** | VALID/REVIEW → `PassportExtraction` |
| `driving-license-ocr.adapter.ts` | **ACTIVE** (stub) | Always `NOT_CONFIGURED` in production |
| `driving-license-policy.ts` | **ACTIVE** | Expiry + confidence → verification status |
| `contracts.service` `uploadDrivingLicense` / `uploadPassport` | **ACTIVE** | |

## Legacy — Gemini / Vision AI (not rental upload)

| Component | Status |
|-----------|--------|
| `src/modules/vision-ai/**` (Gemini providers, schemas) | **LEGACY** |
| `analyzeIdentityDocument` (`identity-analysis.service.ts`) | **NOT_REFERENCED** in `contracts.service` (only unit tests) |
| `env` `AI_VISION_PROVIDER`, `GEMINI_*` | **LEGACY** (dev scripts per `env.ts` comment) |
| `scripts/test-gemini*.ts` | **EXPERIMENTAL / dev-only** |

No PaddleOCR/Tesseract/RapidOCR in Node production code.

## DOCUMENT-ENGINE / Passport (reference pattern)

| Component | Status |
|-----------|--------|
| `DOCUMENT-ENGINE/PASSPORT/` Python + FastAPI | **ACTIVE** (external to backend process) |
| `dev-with-passport-api.ts` | **ACTIVE** (dev orchestration) |

`DOCUMENT-ENGINE/LICENSE/` — **NOT_IMPLEMENTED** (placeholder per `document-engine.md`).

## Python in Diamond repo

- **Passport engine** under `DOCUMENT-ENGINE/PASSPORT` (frozen MRZ pipeline).
- **No** UAE licence crop/OCR code in monorepo yet.

## Subprocess / spawn

- Backend: `child_process` in **dev scripts** (postgres, integration tests), **not** for OCR today.
- Passport: separate uvicorn process (dev) or reused instance.

## Search notes (no hits in active licence path)

- Azure Document Intelligence, Google Vision, OpenAI Vision: **not found** in `APP/backend/src/modules/contracts`.
- MRZ parsers: **Passport engine only** (`DOCUMENT-ENGINE/PASSPORT`), not used for UAE licence.
