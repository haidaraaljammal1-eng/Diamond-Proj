# Official Rental Contract — Backend Domain

The backend provides **one** authoritative representation of the Diamond rental agreement. The future A4 renderer consumes it as-is. It never assembles the contract from several APIs and never decides where a field belongs.

- Builder (pure, no writes, no OCR call): `backend/src/modules/contracts/official-contract.ts` → `buildOfficialContractView`
- Service: `getPublicOfficialContract`, `updatePublicOfficialContractReview` in `contracts.service.ts`
- DTO / PATCH schemas: `OfficialContractViewSchema`, `OfficialContractReviewPatchSchema` in `contracts.schema.ts`
- Template version: `DIAMOND_CONTRACT_V1` (`contract.templateVersion`), alongside the contract's `termsVersion`

Identity capture that feeds it: `official-contract-identity-ocr.md`. Link lifecycle: `public-rental-flow.md`.

## Official contract price policy

The rental price is intentionally excluded from the public/legal contract. Pricing remains internal to Diamond.

- The official contract DTO carries no agreed amount, rate amount, rate basis (Daily/Weekly/Monthly), vehicle default rate, or currency.
- `Contract.agreedAmount` and `Contract.priceType` are unchanged. Payment, Stripe, Finance, reporting and staff contract APIs keep using them.
- The A4 renderer removes the paper's monetary rate area rather than showing blank price fields. No. of Days and the mileage terms stay.
- A test asserts that the public response contains no price field or value.

## Public API

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/contracts/rental/:token/official-contract` | Any status, including completed links. Read-only. |
| PATCH | `/contracts/rental/:token/official-contract` | Strict whitelist: personal fields, `cardNumberLast4`, `damageOut`. `null` clears. |
| PUT | `/contracts/rental/:token/official-contract/signatures/:slot` | Multipart PNG. Slots: `hirer`, `additional-driver`, `sponsor`, `vehicle-out-hirer`. Replaces an earlier capture. |
| DELETE | `/contracts/rental/:token/official-contract/signatures/:slot` | Clears a capture before signing. |
| GET | `/contracts/rental/:token/official-contract/signatures/:slot` | Token-scoped image stream (`private, no-store`). No storage details exposed. |
| POST | `/contracts/rental/:token/official-contract/sign` | Signs: AWAITING/FORM → SIGNED. |
| PATCH | `/contracts/:id/official-contract/terms` | **Staff** (`contracts.manage`): `plateCode`, `contractNotes`, `includedKmPerDay`, `extraKmRate`, `damageIn`. |

The token is the only selector: no contract id, no staff JWT. Invalid or expired links → `401` with `CONTRACT_LINK_INVALID` / `CONTRACT_LINK_EXPIRED`. The frontend uses `publicRequest`, so the customer is never sent to staff login.

Write rules (public):
- Unknown or system-locked keys → `422`. This covers staff terms, Vehicle IN damage, vehicle, dates, days, price, a full card number, CVV and expiry.
- `AWAITING` without `identityReady` → `409 CONTRACT_IDENTITY_NOT_READY`.
- `SIGNED` and later → `409 OFFICIAL_CONTRACT_REVIEW_LOCKED`.
- The Vehicle IN signature slot → `409 OFFICIAL_SIGNATURE_SLOT_UNAVAILABLE` (it belongs to the return workflow).
- Audit rows carry field or slot **names** only. They never include values, card digits, images or damage payloads.

## Field source matrix

| Paper field | DTO path | Source | Who can set it |
| ----------- | -------- | ------ | -------------- |
| Agreement No. | `contract.agreementNumber` | `Contract.contractNumber` (server-allocated, unique, stable) | System |
| Plate Code | `vehicle.plateCode` | No Vehicle plate-code field exists → official-contract term `plateCode` (never parsed from plate text) | Staff |
| Plate No. | `vehicle.plateNumber` | Assigned `Vehicle.plateNumber` | System |
| Vehicle Type | `vehicle.vehicleType` | Assigned Vehicle (Fleet type label) | System |
| Year Made | `vehicle.yearMade` | `Vehicle.modelYear` | System |
| Vehicle Color | `vehicle.color` | `Vehicle.color` | System |
| Notes | `vehicle.notes` | Contract-visible official-contract term `contractNotes` (internal/staff notes are never exposed) | Staff |
| Hirer Name | `hirer.name` | Review override → Passport OCR `fullName` → contract Customer record | Customer |
| Nationality | `hirer.nationality` | Review override → Passport OCR → Customer record | Customer |
| Passport No. / I.D. | `hirer.passportNumber` | Review override → Passport OCR → Customer record | Customer |
| Address / Tel | `hirer.address`, `hirer.telephone` | Review override → Customer record (otherwise `null`) | Customer |
| Driving LIC. NO. | `hirer.driverLicenseNumber` | Driver License OCR (VALID) → Customer record | System |
| Expiry Date | `hirer.driverLicenseExpiryDate` | Driver License OCR (VALID) → Customer record | System |
| Additional Driver / Nationality / LIC. NO. | `additionalDriver.*` | Review override only (`null` until entered) | Customer |
| Sponsor Name / Passport NO. / I.D. | `sponsor.name`, `sponsor.idNumber` | Review override only | Customer |
| Date/Time Out | `vehicleOut.occurredAt` (planned: `rental.plannedStartAt`) | Car-Out event (planned from `Contract.startAt`) | System |
| Date/Time In | `vehicleIn.occurredAt` (planned: `rental.plannedEndAt`) | Car-In event (planned from `Contract.endAt`) | System |
| No. of Days | `rental.numberOfDays` | `Contract.rentalDays` (+ applied renewals); `periodConsistent` checks the one period formula | System |
| Daily / Weekly / Monthly Rate, rate amount, agreed total | — | **Excluded by price policy.** Not in the DTO. | — |
| km per day / AED per extra km | `rental.includedKmPerDay`, `rental.extraKmRate` | No rental-agreement source exists → official-contract terms (never defaulted) | Staff |
| Mileage / Fuel OUT | `vehicleOut.mileage`, `vehicleOut.fuel` | `ContractCarOut` | System |
| Mileage / Fuel IN | `vehicleIn.mileage`, `vehicleIn.fuel` | `ContractCarIn` | System |
| Vehicle damage OUT | `vehicleOut.damage` | Structured marks `[{ zone, type }]` on the demo diagrams | Customer (before signing) |
| Vehicle damage IN | `vehicleIn.damage` | Structured marks | Staff (return) |
| Vehicle condition photos | `vehicleOut/vehicleIn.inspectionAngles` | Car-Out / Car-In photo angles (no file references) | System |
| Card number boxes | `card.last4` | **Last 4 digits only.** The customer types the full number in the paper boxes; it never leaves the browser. No CVV, no expiry. | Customer |
| Hirer / Additional Driver / Sponsor Signature | `signatures.hirer`, `.additionalDriver`, `.sponsor` | `OfficialContractSignature` PNG (legacy: `ContractAcceptance`) | Customer |
| Vehicle OUT / IN hirer signature | `signatures.vehicleOutHirer`, `.vehicleInHirer` | `OfficialContractSignature` PNG (IN: return workflow) | Customer (OUT) |
| Deposit | — | **Not used** (Diamond V1: no deposit). Not in the DTO. | — |

Precedence: a review override wins over OCR, and OCR wins over the contract's Customer record. OCR rows (`PassportExtraction`, `DrivingLicenseVerification`) are never mutated by review. Neither is Customer master data. The builder keeps per-field provenance internally (`CUSTOMER_REVIEW`, `PASSPORT_OCR`, `DRIVER_LICENSE_OCR`, `CUSTOMER_RECORD`, `VEHICLE`, `RENTAL_AGREEMENT`, `OFFICIAL_CONTRACT_TERMS`, `OFFICIAL_SIGNATURE`, `CAR_OUT`, `CAR_IN`, `NONE`). It is not returned publicly.

## Storage

- `OfficialContractReviewDraft` (one row per contract) holds:
  - customer overrides
  - `cardNumberLast4`
  - `damageOut` / `damageIn` JSON, validated against the zone list in `official-contract-interactive.ts`
  - staff terms: `plateCode`, `contractNotes`, `includedKmPerDay`, `extraKmRate`

  It never holds vehicle, pricing, days, custody, deposit, a full card number, CVV or expiry.
- `OfficialContractSignature` has one row per slot and points to a PNG in the existing Attachment store. A re-capture replaces the row.
- At signing, `Contract.snapshot.officialContract` freezes the exact view. Afterwards GET serves the legal content (identity, vehicle, terms, card, OUT damage) from the snapshot, while custody events and signature state stay live.

## Signing (`POST …/official-contract/sign`)

Requirements, validated server-side (`OFFICIAL_CONTRACT_INCOMPLETE` lists what is missing):
- Link valid and contract `AWAITING`/`FORM`; `AWAITING` also requires `identityReady` and a VALID license.
- Hirer name, passport number and driver license number present.
- Hirer signature always. The additional driver signature is needed only when additional-driver details are filled, and the sponsor signature only when sponsor details are filled. The Vehicle IN signature is never needed at this stage.

Effect, in one transaction:
- `AWAITING → FORM → SIGNED`, with the existing transitions and events `contract.form_completed` and `contract.signed`.
- A `ContractAcceptance` row (ip, user agent, terms version, hirer signature attachment).
- The legacy snapshot plus `officialContract`.

No Customer is created or updated, and there is no Vehicle, payment, Finance or Stripe side effect. The flow step then becomes `PAYMENT`.

## Lifecycle

- **AWAITING:** interactive once `identityReady`. The Backend still lists its field policy (`editableFields`, `signableSlots`) while the contract is reviewable; `canEdit` carries the identity gate.
- **FORM:** interactive, not signed. Existing FORM contracts load without re-running identity capture.
- **SIGNED and later:** read-only and frozen.

## Layout for the A4 renderer

`layout.sections` is the paper order: header, agreement, title, infoGrid, rentalTerms, vehicleOut, vehicleIn, legalTerms, signatures.

`layout.infoGrid` lists the paper's info-grid rows as field paths. `a|b` means "actual, else planned", and `@time` / `@date` picks the part of a timestamp a cell shows. Deposit is omitted. Legal Arabic/English wording stays in the approved demo template; the backend supplies no CSS and no legal text.

## A4 interactive contract frontend

The public rental link's step 2, **Contract Review**, sits between Document Verification and payment.

Structure (`APP/frontend/src/modules/public-rental/`):

```
PublicRentalScreen (stage "contract")
 → ContractReviewStep        page shell: intro, A4 viewport, Save Changes / Sign Contract / Continue
   → useOfficialContract     hook
     → official-contract.store (Zustand, memory only: edits, card digits, damage marks, pending signatures)
       → public-rental.api   GET / PATCH / signature PUT·DELETE / sign (publicRequest)
 → OfficialContractA4        presentational legal document, modes REVIEW | READONLY | PRINT
   → buildOfficialContractDocument (pure model: values, sizes, editability, card, damage, fuel, signatures)
   → contract-paper-widgets  DamageOverlay + DamageToolbar, FuelBar, CardNumberBoxes
   → signature-pad           pointer/touch ink pad
   → official-contract-template.ts (DIAMOND_CONTRACT_V1 wording, verbatim from the demo)
```

- **Full-value visibility.** No value is truncated or ellipsized. Values wrap anywhere and step down in type size by length (`data-size` md/sm/xs). Two-field cells stack their labels above the value so it gets the full cell width. Signature captions wrap instead of overlapping.
- **Damage map.** Transparent tap zones sit over the demo's top, left, right and front/rear drawings, in the same SVG viewBox. The demo toolbar ✕ خدش / ◯ انبعاج / △ كسر / ▢ مفقود / مسح الكل picks the mark. Tapping a zone sets that mark, and tapping again with the same mark removes it. Marks are drawn in red on the paper. OUT is editable before signing; IN is shown read-only. The toolbar is hidden in print.
- **Signature pads.** Ink is kept as vector strokes normalized to the box, so zoom and resizes never distort or erase it. Each stroke exports a PNG. Clear resets the pad. A stored signature is shown from the token-scoped image route. Required, unsigned boxes are outlined in red during review.
- **Fuel.** A horizontal 8-segment bar from E to F with the level text (Full, 7/8 … 1/8, Empty).
- **Card boxes.** 16 paper boxes with auto-advance, paste and backspace-back. The full digits stay in memory; saving sends only the last 4 (fewer than 12 typed digits is flagged). Stored values render as `••••••••••••1234`.
- **Save / Sign.**
  - Save sends one PATCH for changed fields, the card last 4 and damage, then PUT/DELETE for each changed signature, and reconciles with the backend response.
  - Sign first checks required signatures locally, saves, then calls `POST …/sign`. On success the page reloads the rental context and opens payment.
  - A failure keeps all local state and shows a safe message.
- **Simulation.** Browser-only. Normalized simulated identity also re-evaluates the backend's identity gate for `canEdit` (same rule; the policy lists still come from the backend), so pads, marks and card boxes work in demo mode. Save stays local, and Sign runs the simulated accept, which leads to demo payment. Nothing reaches the backend.
- **A4 portrait, 210 × 297 mm.**
  - The sheet has 6 × 7.5 mm margins.
  - Desktop: centered with a shadow; the rental summary column is hidden on this stage.
  - Mobile: scaled with CSS `zoom`, with horizontal scroll as a fallback.
  - Print: the named page `@page diamond-contract { size: A4 portrait; margin: 0 }`. Only the sheet prints; signatures, marks, fuel bar and typed card boxes print, while the damage toolbar, Clear links and hints do not.
- **Mixed direction.** The sheet is `dir="ltr"` with explicit `dir="rtl"` on Arabic text; it stays bilingual in both locales.

### Rental price policy on the A4 agreement

**The vehicle rental price is not displayed.**

- Hidden: Daily, Weekly and Monthly rental price, and the agreed rental amount.
- Still displayed: No. of Days, included km per day, extra-km rate, and the approved non-rental charges in the terms.
- No Deposit.

### One-page fit (browser-measured)

Measured in Chromium at 1280 px width with a demo contract that has staff terms filled: the sheet is exactly 297 mm tall with about 275 mm of content and no overflow. Unusually long wrapped values or several long Arabic address lines could still push content past one page.
