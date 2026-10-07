# 05 — Frontend field mapping

## Licence upload UI (step 1)

| Item | Path |
|------|------|
| Step card | `license-step.tsx` |
| File input | `license-capture` → `input[type=file]` accept from `LICENSE_ACCEPT` |
| Display after VALID | licence **number** + **expiry** only (`license-valid` panel) |
| States | `license-verifying`, `license-valid`, `license-expired`, `license-unreadable`, `license-review`, `license-unavailable` |

No per-field OCR preview for name/nationality/DOB on licence step today.

## Customer form (step 2 — contract)

| OCR field | Form field | Schema key | API `PublicRentalFormPayload` |
|-----------|------------|------------|-------------------------------|
| `name_en` | `name` | `public-rental-form.schema.ts` `name` | `name` |
| (mobile) | `mobile` | required | `mobile` |
| `nationality` | `nationality` | min 2 chars | `nationality` |
| — | `identityNumber` | optional | `identityNumber` |
| passport OCR | `passportNumber` | optional | `passportNumber` |
| — | `address` | optional | `address` |
| `license_number` | **not in form** | — | — (shown read-only in contract summary from `licenseVerification`) |
| `expiry_date` | **not in form** | — | — (read-only summary) |
| `date_of_birth` | **no input** | — | **FIELD_NOT_PRESENT_IN_CURRENT_SCHEMA** |
| `issue_date` | **no input** | — | **FIELD_NOT_PRESENT** |
| `place_of_issue` | **no input** | — | **FIELD_NOT_PRESENT** |

Component: `contract-step.tsx` + `FormBuilder` fields from `public-rental-form.fields.ts`.

## Official contract review (post-identity)

Editable backend fields include `hirerName`, `nationality`, `passportNumber` (`official-contract.types.ts`). Licence number on A4 is typically **locked** from verification (see official-contract tests).

## Autofill patterns today

- **No** dedicated OCR autofill hook for licence form.
- **Passport:** server returns `identity.passport.fields` when READY; UI shows read-only facts on passport step.
- **Review draft:** employee/customer can **edit** permitted review fields; overrides stored in `OfficialContractReviewDraft`.
- **Confidence:** shown only as backend `licenseVerification.confidence` (number); no per-field UI.

## Recommended UX (conceptual, compatible with current UI)

1. Licence upload → multi-field OCR on server.
2. Prefill **contract form** `defaultValues` from OCR + verification (user can edit before submit).
3. Never lock identity fields solely because OCR succeeded; expiry/validity remains **backend policy** (`evaluateDrivingLicenseOcr`).

## i18n

Keys under `PublicRental.license` and `PublicRental.contract` in `messages/en.json` / `ar.json` (licence errors, review required, etc.).
