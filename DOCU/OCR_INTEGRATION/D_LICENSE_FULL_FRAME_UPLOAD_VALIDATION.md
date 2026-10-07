# D-LICENSE-FRAME-1 — Full-licence frame validation

## Problem

Wide screenshots (e.g. aspect ~2.34) fail **Crop V1** geometry checks on the licence engine **before OCR**. Diamond previously surfaced a generic unreadable message, hiding the real framing issue.

## Accepted aspect rule (authoritative)

Aligned with `DOCUMENT-ENGINE/LICENSE/frozen/crop_v1/config/crop_layout.json`:

| Constant | Value |
|----------|-------|
| `min_aspect_ratio` | **1.25** |
| `max_aspect_ratio` | **2.10** |

Inclusive bounds: reject when `aspect < 1.25` **or** `aspect > 2.10`.

Backend mirror: `APP/backend/src/modules/contracts/license-frame.ts`  
Frontend UX mirror: `APP/frontend/src/modules/public-rental/utils/license-frame.ts`

## Upload path (original bytes)

`LicenseUpload` → `FormData.append("file", file)` → `POST /contracts/rental/:token/driving-license` → `files.save` (buffer write, no resize) → licence engine multipart `image`.

No client-side resize, canvas re-encode, or crop in the public rental flow.

## Client preflight (UX only)

On file selection, `readLicenseImageMeta` decodes width/height only. `evaluateLicenseFramePreflight` blocks upload when aspect is out of range and shows the **bad frame** panel (`license-bad-frame`). Server/engine remains authoritative.

## Server error mapping

| Engine / adapter | Policy status | `unreadableReason` (public API) |
|------------------|---------------|--------------------------------|
| `LICENSE_OCR_CROP_FAILED` | `UNREADABLE` | `BAD_FRAME` |
| Missing number/expiry after ACCEPT | `UNREADABLE` | `OCR` |
| Valid number + expiry, not expired | `VALID` | `null` |
| Valid number + expiry, expired | `EXPIRED` | `null` |

`uploadFailureCode` is stored on failed extractions (`fieldsMeta.uploadFailureCode`) for `BAD_FRAME` / `OCR_FAILED`.

## Privacy-safe diagnostics

Non-production only: `driving_license_upload_meta` logs MIME, byte size, width, height, aspect, and `frameAspectValid`. No image bytes, base64, or OCR field values.

Implementation: `license-upload-diagnostics.ts` + `contracts.service.ts` upload handler.

## Tests

- Frontend unit: `license-frame.test.ts`, `license-view.test.ts`
- Backend unit: `license-frame.test.ts`, `license-upload-diagnostics.test.ts`, adapter crop → `BAD_FRAME`
- Backend integration: `driving-license-frame-upload.test.ts` (byte preservation + `BAD_FRAME` context)
- Playwright: wide synthetic fixture → bad frame, zero `POST` uploads; existing OCR flows unchanged

## Out of scope (this phase)

No OCR V1.3 changes, no Crop V1 threshold changes, no auto-crop / deskew / perspective normalization.

## FINAL LIVE VERIFICATION (D-LICENSE-FRAME-1V)

**Date:** 2026-10-05 (local)  
**Stack:** Postgres OK · `:8020` READY `OCR_ENGLISH_V1_3_TWO_FIELD` · backend `:8000` · frontend `:3100`

| Check | Result |
|-------|--------|
| `driving-license-frame-upload.test.ts` | **2 pass / 0 fail / 0 skip** (`BAD_FRAME` + byte equality) |
| Client wide aspect (2.34) Playwright | **`license-bad-frame`**, geometry copy, re-upload button; **`POST` driving-license = 0** |
| Server bypass (234×100 PNG, real engine) | **`UNREADABLE`**, `unreadableReason: BAD_FRAME`, no ACCEPT extraction |
| OCR-unreadable Playwright (partial corpus) | **`license-unreadable`** + OCR-specific body (not bad-frame) |
| Khader `input.jpg` → `:8020` | **ACCEPT** `5128524` / `30/01/2028` |
| Khader → Diamond (`b6f-live-smoke-once`) | **VALID** `5128524` / `2028-01-30` |
| Mohamed `input.png` | **EXPIRED** `2608080` / `2020-07-02` |
| Marlon (real clock) | **EXPIRED** `1893918` / `2023-04-13` |
| Marlon (E2E policy clock 2023-01-01) | **VALID** (Playwright) |
| Frontend unit suite | **752 pass / 0 fail** |
| Backend licence unit (frame/policy/client) | **31 pass / 0 fail** |
| Playwright `driving-license-ocr.spec.ts` | **5 / 5 pass** |
| Privacy logging `driving_license_upload_meta` | MIME, size, width, height, aspect, `frameAspectValid` only (observed on integration + live upload) |
| Real images in git | **gitignored**, not staged (`output/a7_*`, `a5_*`, `v1_2h_*`) |

**Khader frame preflight (backend probe):** 1024×626, aspect **1.636**, `frameAspectValid: true` (would pass client preflight).

**Note:** Some older integration cases (e.g. `driving-license-engine-bridge`) still assert `holderNameEn: "TEST DRIVER"` while V1.3 two-field returns `name_en: null` on extraction — unrelated to frame validation; not re-baselined in this verification pass.

**Verdict:** `D_LICENSE_FULL_FRAME_UPLOAD_FULLY_VERIFIED`
