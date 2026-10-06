# D-OCR-A3 — Conceptual Prisma proposal (DO NOT APPLY)

**Not applied to `schema.prisma`.** Illustrates recommended **OPTION C**.

## New model: `DrivingLicenseExtraction`

One normalized **machine read** per active licence document attempt (mirror `PassportExtraction`).

```prisma
enum DrivingLicenseExtractionStatus {
  PROCESSING
  READY
  PARTIAL          // engine document_status REVIEW_REQUIRED
  FAILED
  PROVIDER_UNAVAILABLE
}

model DrivingLicenseExtraction {
  id              String   @id @default(uuid())
  contractId      String
  contract        Contract @relation(...)
  documentId      String   @unique
  document        ContractDocument @relation(...)
  attachmentId    String

  status          DrivingLicenseExtractionStatus @default(PROCESSING)

  /// LICENSE engine document_status at completion
  engineDocumentStatus String?  // ACCEPT | REVIEW_REQUIRED | REJECT

  jobId           String?
  provider        String?
  providerVersion String?

  /// Normalized machine-detected values (ISO dates at UTC noon)
  licenseNumber   String?
  holderNameEn    String?
  nationality     String?
  dateOfBirth     DateTime?
  issueDate       DateTime?
  expiryDate      DateTime?
  placeOfIssue    String?

  /// Optional: per-field status/confidence/crop_status from engine (audit UI)
  fieldsMeta      Json?

  completedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([contractId, createdAt])
}
```

Add relation on `ContractDocument`: `drivingLicenseExtractions DrivingLicenseExtraction[]`

## `DrivingLicenseVerification` (evolve minimally)

Keep as **policy gate** for the same upload attempt:

- `status`, `licenseNumber`, `expiryDate`, `confidence`, `provider`, `verifiedAt`
- Optional: `extractionId String? @unique` → `DrivingLicenseExtraction` for join convenience

Do **not** add rich OCR columns here long term.

## `Customer` (confirmed identity only)

Additive nullable fields for **form-submitted** values:

```prisma
dateOfBirth              DateTime?  // person
drivingLicenseIssueDate  DateTime?  // licence metadata
drivingLicensePlaceOfIssue String?  // licence metadata
```

Do **not** auto-write these from OCR without form submit.

## `OfficialContractReviewDraft`

Optional future: user corrections for licence fields if business allows editing on review step (today licence on official doc is OCR-only).

## JSON vs columns

- **Typed columns** for the seven extraction fields (query, stable API).
- **`fieldsMeta` Json** for per-field engine status/confidence (minimal extension for UI).
- **No** full raw HTTP body storage (PII + size).
