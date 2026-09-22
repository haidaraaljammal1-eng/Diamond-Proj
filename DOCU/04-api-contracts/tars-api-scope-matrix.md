# TARS API Scope Matrix

Source of truth for **what Diamond implements** vs **what is excluded**. Live HTTP mapping is inserted later per company (`UNIQUE` / `ELITE`) without workflow redesign.

See also: [tars-integration.md](./tars-integration.md).

| Capability | Official evidence | Classification | Diamond implementation | Live mapping |
| ---------- | ----------------- | -------------- | ---------------------- | ------------ |
| Authentication / agency context | RTA TARS rental API auth | **REQUIRED** | `checkAuthReadiness()`, per-company `TARS_<CO>_*` config | Pending |
| Create Rental | Official rental create | **REQUIRED** | `CREATE_RENTAL`, async `PENDING_PROVIDER` | Pending |
| Update Rental | Rental change / renewal | **REQUIRED** (conditional) | `UPDATE_RENTAL` + `correlationSubject` | Pending |
| Async request status | HTTP 202 + status poll | **REQUIRED** | `getAsyncRequestStatus`, `refreshPendingOperation` | Pending |
| Return Rental | Car return documentation | **REQUIRED** | `RETURN_RENTAL`, reuses Car-In evidence | Pending |
| Settle Rental | Contract completion/settlement | **REQUIRED** | `SETTLE_RENTAL` | Pending |
| Vehicle DID / identity | Rental requires vehicle DID | **REQUIRED** | `TarsVehicleIntegration`, mapper `externalVehicleDid` | Pending |
| OTP / contract acceptance | Digital approval flow | **UNCERTAIN_PREPARED** | `TarsOtpService`, public routes, OTP UI | Pending |
| Digital acceptance linkage | Post-signature TARS step | **UNCERTAIN_PREPARED** | `linkDigitalAcceptance()` boundary | Pending |
| Vehicle lookup | Resolve DID before create | **UNCERTAIN_PREPARED** | `lookupVehicle()` | Pending |
| Vehicle register | Create vehicle in TARS if required | **UNCERTAIN_PREPARED** | `registerVehicleIfRequired()` — no auto mutation | Pending |
| Driver license inquiry | Separate TARS capability | **UNCERTAIN_PREPARED** | `inquireDrivingLicense()` — isolated | Pending |
| Attachment upload | TARS upload + hash/url | **UNCERTAIN_PREPARED** | `TarsAttachmentUpload`, `uploadAttachment()` | Pending |
| Handover evidence | Post Car-Out submission | **UNCERTAIN_PREPARED** | `submitHandoverEvidence()`, reuses Car-Out photos | Pending |
| Return evidence | Post Car-In submission | **UNCERTAIN_PREPARED** | `submitReturnEvidence()`, reuses Car-In photos | Pending |
| Salik retrieval | TARS optional catalog | **OPTIONAL_EXCLUDED** | Road Liabilities module only | N/A |
| Traffic fines retrieval | TARS optional catalog | **OPTIONAL_EXCLUDED** | Road Liabilities module only | N/A |
| Employee APIs | TARS optional catalog | **OPTIONAL_EXCLUDED** | Not implemented | N/A |
| Maintenance APIs | TARS optional catalog | **OPTIONAL_EXCLUDED** | Maintenance module only | N/A |
| Borrowing / reservation / replacement | TARS optional catalog | **OPTIONAL_EXCLUDED** | Not implemented | N/A |

## Permanent rules

- **Two providers:** `Contract.company` → `UNIQUE` or `ELITE` TARS. No fallback.
- **OTP UI is built now;** exact TARS OTP request/response mapping is pending.
- **CREATE_RENTAL vs OTP order** is not hard-coded (`TARS_CREATE_RENTAL_CHECKPOINT_PENDING_STAGING_VERIFICATION`).
- **Fail closed** until live adapter configured. No fake government success.
- **Browser never calls TARS.** Diamond Backend proxies all traffic.
