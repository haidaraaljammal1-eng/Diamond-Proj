# 06 — Upload security & privacy

## Authentication

| Route | Auth |
|-------|------|
| `POST /contracts/rental/:token/driving-license` | **Public** — opaque `ContractLink` token (hash stored; raw token in URL only) |
| Staff APIs | JWT (not used for public licence upload) |

Token scoped to contract + link type `RENTAL`; resolved via `resolveContractLink`.

## Rate limiting

Public contract routes use shared Fastify rate-limit plugin (`authRateLimit` imported in public routes). **Licence-specific limits:** no dedicated throttle beyond global/public patterns — **gap for burst OCR abuse** (IMPORTANT, not necessarily BLOCKER).

## Validation

- MIME allowlist + magic bytes (`files.service.ts`).
- Size cap `MAX_UPLOAD_SIZE`.
- Contract status gate (`AWAITING` / `FORM`).

## Storage

- **Permanent** attachment for each upload attempt (superseded documents remain in DB; attachment retained).
- Path: `FILE_STORAGE_DIR` + `storageKey` (content-addressed style key).
- **Not** world-readable HTTP; served through backend attachment APIs where applicable.

## PII logging risks

| Area | Finding | Class |
|------|---------|-------|
| Fastify default request logging | May log URLs; avoid logging multipart bodies | IMPORTANT |
| OCR debug (future) | Crop/OCR job dirs must not log field values at info level | IMPORTANT |
| Public rental errors | Contract errors use stable codes (`DRIVING_LICENSE_*`) | OK |
| Audit log | Integration tests assert passport number **not** in audit payloads | pattern to replicate for licence |

## Privacy (100% local OCR)

- Target architecture: **on-prem / same host** Python service (like Passport). **No cloud OCR** in approved design.
- External UAE OCR projects are local Tesseract/RapidOCR/PP-OCRv5 — **no third-party image upload** in engine design read.

## Public flow gaps (AUDIT 31)

- No virus scanning (same as passport).
- Concurrent large uploads → CPU/RAM pressure on Python service (**resource exhaustion** risk).
- Malicious files: mitigated by image decode + magic bytes; not full image bomb hardening documented.

## Retention (see also audit JSON)

- Original licence image: **kept** as `Attachment` today.
- Future crop/OCR temp dirs: should be **per-job** and **deleted** after response (recommended policy).
