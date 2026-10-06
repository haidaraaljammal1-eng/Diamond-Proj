# 09 — Error & partial-success contract (future API)

## Diamond-facing error codes (recommended mapping)

| Code | When | HTTP (public upload) |
|------|------|----------------------|
| `INVALID_IMAGE` | Decode / validation failed | 200 + `UNREADABLE` or 400 if pre-save |
| `UNSUPPORTED_FORMAT` | MIME / magic bytes | 400 validation (existing `files.save`) |
| `CROP_FAILED` | Table/geometry stop | 200 + `UNREADABLE` or `PROVIDER_UNAVAILABLE` |
| `TABLE_NOT_FOUND` | Crop `TABLE_*` stop | same |
| `FIELD_CROP_UNCERTAIN` | Value crop not `VALUE_OK` | partial success |
| `OCR_REJECT` | Field status REJECT | partial success |
| `OCR_FLAG_UNCERTAIN` | Field uncertain | map to `REVIEW_REQUIRED` if critical fields |
| `OCR_WORKER_UNAVAILABLE` | PP-OCRv5 down | `PROVIDER_UNAVAILABLE` |
| `OCR_TIMEOUT` | Client timeout | `PROVIDER_UNAVAILABLE` / `FAILED` |
| `MODEL_INTEGRITY_FAILURE` | Hash check fail | `PROVIDER_UNAVAILABLE` |
| `INTERNAL_OCR_ERROR` | Unexpected | `FAILED` / `PROVIDER_UNAVAILABLE` |

Align with existing `DrivingLicenseVerificationStatus` rather than new enum values where possible.

## Partial success (AUDIT 21)

OCR returns per-field `{ status, normalized_text, ... }`.

**Recommended:** persist successful fields; mark verification `REVIEW_REQUIRED` if any **gate field** (number, expiry) uncertain; return extended DTO to frontend for display/prefill.

Current policy **requires** number + expiry for `VALID` (`driving-license-policy.ts`) — partial OCR cannot become `VALID` without both.

## Compatibility with form flow

- User can still edit `name`, `nationality` on contract step after OCR prefill.
- Licence number/expiry shown read-only from verification — if OCR only fills form but not verification, UX mismatch — **implementation must update verification row + context projection**.

## Gemini / fallback

**No fallback** to Gemini or Vision AI on licence path (same as passport). `NOT_CONFIGURED` until service wired.
