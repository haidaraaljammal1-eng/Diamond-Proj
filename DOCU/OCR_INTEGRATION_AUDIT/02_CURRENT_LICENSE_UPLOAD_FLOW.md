# 02 — Current driving-licence upload flow

## Entry points

### Public rental (primary)

| Layer | Location |
|-------|----------|
| UI | `APP/frontend/src/modules/public-rental/components/license-step/license-step.tsx` |
| Upload control | `LicenseUpload` with `testId="license-capture"` (`license-upload.tsx`) |
| Handler | `public-rental-screen.tsx` → `rental.uploadLicense(file)` |
| Store | `public-rental.store.ts` → `uploadPublicRentalLicense` |
| API | `POST /contracts/rental/:token/driving-license` multipart field **`file`** |
| Route | `APP/backend/src/modules/contracts/routes/public/route.ts` |
| Service | `contracts.service.ts` → `uploadDrivingLicense` |

### Staff / other

Customer documents module uses `CustomerDocumentType` including `DRIVING_LICENSE` for CRM uploads (`contracts.schema.ts`); **public rental path above is the integration target** for UAE licence OCR.

## Upload constraints (backend)

From `contracts.constants.ts` + `files.service.ts`:

- **MIME:** `image/jpeg`, `image/png` only (`DRIVING_LICENSE_UPLOAD_MIME`).
- **Magic-byte verification** (declared type not trusted).
- **Max size:** `env.MAX_UPLOAD_SIZE` (default **5_242_880** bytes).
- **Multipart:** `@fastify/multipart`; `bodyLimit` = `MAX_UPLOAD_SIZE` (`app.ts`).

## Frontend accept list

`license-file.ts`: JPEG/PNG only; `capture="environment"` on file input (mobile camera).

## After upload (backend sequence)

1. Resolve **RENTAL** `ContractLink` token → `contractId`; status must be `AWAITING` or `FORM`.
2. `files.save` → `Attachment` on disk (`FILE_STORAGE_DIR`).
3. Supersede prior `ContractDocument` type `DRIVING_LICENSE`.
4. Create new `ContractDocument` + `DrivingLicenseVerification` row.
5. Read bytes from storage → `analyzeDrivingLicenseDocument({ bytes, mimeType })`.
6. `evaluateDrivingLicenseOcr` → status + `licenseNumber` + `expiryDate` + confidence.
7. Persist verification; emit `contract.license_uploaded` / `contract.license_verified`.
8. Return `PublicRentalContext` via `loadPublicRental`.

## Current OCR outcome (production)

`driving-license-ocr.adapter.ts` returns **`NOT_CONFIGURED`** unless test hook injected → policy maps to **`PROVIDER_UNAVAILABLE`**.

DEV: `POST /rental/:token/simulation/license` + UI `simulate-license-valid` (`DIAMOND_SIMULATION_ENABLED`).

## Retake / supersede

Same pattern as passport: new document supersedes old; latest verification row per contract query (`licenseVerifications` orderBy `createdAt` desc, take 1).

## Identity gate

`buildContractIdentityDraft`: licence must be **`VALID`** for `identityReady`; passport must be **`READY`**. Licence OCR does **not** populate contract review draft fields beyond number/expiry on verification row.
