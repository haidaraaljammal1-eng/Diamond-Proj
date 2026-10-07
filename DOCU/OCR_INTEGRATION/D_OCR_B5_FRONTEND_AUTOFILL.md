# D-OCR-B5 — Frontend autofill and confirmed Customer data

## Prefill precedence

On form mount only (`resolvePublicRentalFormDefaults`):

1. Confirmed `customer.*` value when non-empty
2. Else usable OCR `drivingLicenseExtraction.fields.*` (not `REJECT`)
3. Else empty (or licence number/expiry from verification as fallback)

Form `key` uses `publicRentalFormMountKey` so OCR is not reapplied after user edits or context refetch.

## New form fields

- `dateOfBirth`, `drivingLicenseIssueDate`, `drivingLicensePlaceOfIssue`
- `drivingLicenseNumber`, `drivingLicenseExpiry` (editable for review; see licence policy below)

## Submission

`POST /contracts/rental/:token/form` accepts optional:

- `dateOfBirth`, `drivingLicenseIssueDate`, `drivingLicensePlaceOfIssue` (ISO `YYYY-MM-DD`)

Persisted on **Customer** on submit.

## Licence number / expiry policy (unchanged from A3)

`Customer.drivingLicenseNumber` and `Customer.drivingLicenseExpiry` remain sourced from **DrivingLicenseVerification** at submit (policy gate). Form fields are for review/display; re-upload is required to change verified licence identity.

## OCR vs Customer

`DrivingLicenseExtraction` rows are never updated by form submit.

## Tests

- Frontend: `public-rental-form-prefill.test.ts`, `public-rental-form.schema.test.ts`
- Backend: `public-rental-form-ocr-b5.test.ts`

## Verdict

`D_OCR_B5_FRONTEND_AUTOFILL_READY_FOR_FINAL_TESTING`
