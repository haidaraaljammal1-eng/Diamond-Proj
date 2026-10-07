# 04 — Data model mapping (Prisma)

## Driving licence verification (contract-scoped)

**Model:** `DrivingLicenseVerification` (`contracts.prisma`)

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `licenseNumber` | String | yes | Only OCR text field persisted today |
| `expiryDate` | DateTime | yes | UTC noon calendar storage |
| `confidence` | Float | yes | Aggregate / legacy threshold |
| `status` | `DrivingLicenseVerificationStatus` | no | PENDING, VALID, EXPIRED, UNREADABLE, REVIEW_REQUIRED, PROVIDER_UNAVAILABLE |
| `provider` / `providerVersion` | String | yes | |

**Not present:** `name_en`, `nationality`, `date_of_birth`, `issue_date`, `place_of_issue`, per-field confidence JSON.

## Customer (post–form materialization)

**Model:** `Customer` (`operational.prisma`)

| Field | Type | Notes |
|-------|------|-------|
| `name` | String | required |
| `nationality` | String? | free text |
| `drivingLicenseNumber` | String? | indexed, not unique |
| `drivingLicenseExpiry` | DateTime? | |
| `passportNumber`, `identityNumber`, `address` | String? | |

**FIELD_NOT_PRESENT_IN_CURRENT_SCHEMA:** `dateOfBirth`, `licenseIssueDate`, `placeOfIssue` on `Customer`.

## Passport extraction (contrast — richer OCR storage)

**Model:** `PassportExtraction` — stores multiple normalized fields + status enum (`READY`, `NOT_RECOGNIZED`, etc.). **No equivalent `LicenseExtraction` aggregate** for multi-field licence OCR.

## Contract documents

**Model:** `ContractDocument` — `type` includes `DRIVING_LICENSE`; `attachmentId` → `Attachment` (image bytes on disk).

## Official contract review

**Model:** `OfficialContractReviewDraft` — `hirerName`, `nationality`, `passportNumber`, etc. Overrides for A4; **no licence issue/DOB/place columns**.

## Contract identity draft (derived, not stored)

`contract-identity-draft.ts` maps:

- Passport OCR → `fullName`, `nationality`, `passportNumber`, DOB, dates, etc.
- Licence verification → **`driverLicenseNumber`**, **`driverLicenseExpiryDate`** only (when VALID).

## OCR field → Diamond persistence (today)

| OCR field | Persisted today | Target for integration |
|-----------|-----------------|------------------------|
| `license_number` | `DrivingLicenseVerification.licenseNumber` | Same |
| `expiry_date` | `DrivingLicenseVerification.expiryDate` | Parse DD/MM/YYYY → calendar → stored UTC noon |
| `name_en` | **FIELD_NOT_PRESENT** (optional `holderName` in OCR types only, unused) | `Customer.name` / form `name` / review `hirerName` (design choice) |
| `nationality` | **FIELD_NOT_PRESENT** on verification | `Customer.nationality` / form |
| `date_of_birth` | **FIELD_NOT_PRESENT** | Would need schema or passport-only path |
| `issue_date` | **FIELD_NOT_PRESENT** | |
| `place_of_issue` | **FIELD_NOT_PRESENT** | |
| `name_ar` | N/A (not OCR'd) | Intentionally excluded |

## Contract / legal snapshot

Customer data materializes on **`POST /rental/:token/form`** (before signing). Contract PDF / official contract uses **snapshot + review draft overrides**; licence number on contract step is **read-only display** from verification/customer (`contract-step.tsx`). OCR-populated values that never reach `Customer` or review draft **will not appear** on signed contract.
