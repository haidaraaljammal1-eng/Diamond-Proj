# D-OCR-B6F — Playwright fixture + live smoke unblock

## Fixture (committed)

| Item | Value |
|------|--------|
| Path | `APP/frontend/e2e/fixtures/driving-license/uae-driving-license-ocr-test.png` |
| Expectations | `uae-driving-license-ocr-expectations.json` |
| PII | Fictional **JOHN WICK** internal OCR corpus image — not a Diamond customer |

Engine `:8020` authoritative field values are in the JSON expectations file.

## Live smoke (local only, uncommitted)

| Item | Value |
|------|--------|
| Image | `C:\Users\Rw\UAE_LICENSE_CROP_V2\input\real02.jpg` (local, never committed) |
| Chain | `POST /contracts/rental/:token/driving-license` → Fastify → `:8020` → DB → `GET` context |
| Result | **PASS** (after moving licence OCR **outside** Prisma transaction — real runs exceed 5s default tx timeout) |

### real02 machine output (Diamond-persisted)

| Field | Value |
|-------|--------|
| licenseNumber | 90527 |
| holderNameEn | RISHAD PADAIH BASHEEK PADAIO S |
| nationality | INDIA |
| dateOfBirth | 1990-05-03 |
| issueDate | 2019-09-12 |
| expiryDate | 2021-09-11 |
| placeOfIssue | HAB |
| engineDocumentStatus | ACCEPT |
| DrivingLicenseVerification.status | REVIEW_REQUIRED (policy; expiry in past — assert in B7) |

## Integration fix (B6F)

`uploadDrivingLicense`: `analyzeDrivingLicenseDocument` now runs **before** `withTransaction` (network I/O must not hold DB tx open).

## Dev helper

`APP/backend/scripts/b6f-live-smoke-once.ts` — requires `UAE_DRIVING_LICENSE_API_URL` + `B6F_LOCAL_LICENSE_IMAGE`.

## Verdict

**`D_OCR_B6_READY_FOR_PLAYWRIGHT`**
