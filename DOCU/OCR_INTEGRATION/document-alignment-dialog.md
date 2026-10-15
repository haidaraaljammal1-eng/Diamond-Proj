# Public rental — document alignment dialog

Pre-upload alignment for driving licence and passport on the customer rental flow (`/[locale]/rental/[token]`).

## Flow

`LicenseUpload` file pick → `PublicRentalScreen` opens `DocumentAlignmentDialog` → user pan/zoom/rotate → **Confirm and upload** → canvas export (padded guide region) → existing `uploadLicense` / `uploadPassport` (multipart field `file` unchanged).

## Module

`APP/frontend/src/modules/public-rental/components/document-alignment/`

- Profiles: licence guide ~1.59, passport ~1.42; rotation clamps; **WYSIWYG export** crops the guide frame only (no automatic padding or upscale).
- No brightness/contrast/OCR quality UI in V1.

## OCR

Engines and backend contracts are unchanged; exported pixels replace the previous “raw file bytes” upload on the public path only.
