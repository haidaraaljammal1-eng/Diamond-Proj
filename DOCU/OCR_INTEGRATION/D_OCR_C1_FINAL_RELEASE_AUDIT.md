# D-OCR-C1 — Final release / policy / git readiness audit

**Date:** 2026-10-05  
**Scope:** UAE Driving Licence OCR (B1→B7). **Audit only** — no code changes, commit, or push.  
**Accepted E2E status:** `DIAMOND_LICENSE_OCR_PLAYWRIGHT_E2E_PASS` (see `D_OCR_B7_PLAYWRIGHT_ACCEPTANCE.md`).

---

## Audit 1 — Git state (recorded)

| Field | Value |
|--------|--------|
| Branch | `main` |
| HEAD | `96cbce6a9c2a8ae44044c5732304dc6e5497cf02` |
| vs `origin/main` | **ahead 1** (local commit: dev Postgres bootstrap — not OCR) |
| Staged | none |
| Tracked diff | **32 files**, +814 / −208 (`git diff --stat`) |

### Classification

**A — Driving Licence OCR integration**

- `DOCUMENT-ENGINE/LICENSE/` (new tree; excludes gitignored venv/jobs/output/vendor)
- `APP/backend/prisma/migrations/20261004120000_driving_license_extraction/`
- `APP/backend/prisma/schema/contracts.prisma`, `operational.prisma`
- `APP/backend/src/modules/document-engine/` (UAE licence client)
- `APP/backend/src/modules/contracts/driving-license-extraction.*`
- `APP/backend/src/modules/contracts/public-driving-license-extraction.mapper.ts`
- `APP/backend/src/modules/contracts/ocr/driving-license-ocr.*`
- `APP/backend/src/modules/contracts/driving-license-policy.ts`
- `APP/backend/src/modules/contracts/public-rental-context.ts`
- `APP/backend/src/modules/contracts/contracts.service.ts` (upload OCR-outside-tx, partial form save)
- `APP/backend/src/modules/contracts/contracts.schema.ts`
- `APP/backend/src/modules/contracts/contract-customer-materialization.ts`
- `APP/backend/src/config/env.ts`, `APP/backend/.env.example`
- `APP/backend/scripts/dev-with-document-engines.ts`, `e2e-audit-driving-license-ocr.ts`
- `APP/backend/tests/**/driving-license*`, `fake-uae-driving-license-api.ts`, `public-rental-form-ocr-b5.test.ts`
- `APP/frontend` public-rental form/OCR UI, i18n, Playwright spec/fixtures/helpers
- `DOCU/OCR_INTEGRATION/*`, `DOCU/00-system-overview/document-engine.md`, `vision-ai-foundation.md` (OCR sections)
- Root `.gitignore` (Document Engine ignores)

**B — Passport pre-existing / parallel WIP (do not mix into licence-only commits)**

- `APP/backend/src/modules/contracts/passport-extraction-policy.ts`
- `APP/backend/scripts/dev-with-passport-api.ts`
- `APP/backend/tests/helpers/fake-passport-number-api.ts`
- `APP/backend/tests/unit/passport-number-engine-policy.test.ts`
- `DOCUMENT-ENGINE/PASSPORT/` (if present under untracked `DOCUMENT-ENGINE/`)
- Parts of `public-identity-flow.test.ts`, `vision-ai-document.test.ts`, `fake-vision-ai-provider.ts` — **review diff**; stage only licence-related hunks or defer with Passport PR

**C — Unrelated / optional**

- `DOCU/OCR_INTEGRATION_AUDIT/` (pre-implementation audit pack)
- `APP/backend/scripts/b6f-live-smoke-once.ts` (local `real02` smoke; documents `C:\Users\Rw\...` — optional, not required for prod)

**D — Must NOT commit**

- `DOCUMENT-ENGINE/**/.venv/`, `.venv_ppocrv5/`
- `DOCUMENT-ENGINE/LICENSE/jobs/`, `LICENSE/output/` (incl. `ocr_service_cache/`)
- `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/vendor/` (model binaries)
- `.env`, secrets, Playwright `test-results/`, traces (unless project policy says otherwise)
- Local licence photos (`real02.jpg`, user uploads)

---

## Audit 2 — B1→B7 change inventory

| Phase | Deliverable | Key paths |
|-------|-------------|-----------|
| B1 / engine | Crop V1 + OCR V1.1 HTTP `:8020` | `DOCUMENT-ENGINE/LICENSE/` |
| B2 | Fastify bridge | `document-engine/uae-driving-license-api.client.ts`, adapter |
| A3 / B3 | Schema + persistence | migration `20261004120000_*`, mappers, repository |
| B4 | Public context | `public-rental-context.ts`, `public-driving-license-extraction.mapper.ts` |
| B5 | Form prefill / submit policy | frontend `public-rental-form-prefill.ts`, `contract-step`, B5 tests |
| B6 / B6F | Regression + fixture + tx fix | OCR outside Prisma tx; synthetic Playwright PNG |
| B7 | Playwright E2E | `e2e/driving-license-ocr.spec.ts`, B7 doc |

**Ambiguous attribution:** `package.json` `dev` → `dev-with-document-engines.ts` (licence + passport **dev** orchestration only). `e2e-api.ts` default API URL `8000` (E2E hygiene, licence-related).

---

## Audit 3 — Critical policy (public rental after form save)

### `submitPublicForm` partial path (B7)

When `DrivingLicenseVerification.status` is **`UNREADABLE`** or **`REVIEW_REQUIRED`**:

- Skips `assertLicenseProgress` and **`identityReady`**.
- Still requires `verification.licenseNumber`.
- Writes `Customer.drivingLicenseNumber` / `drivingLicenseExpiry` from **`DrivingLicenseVerification`** (not editable OCR fields).
- May transition **`AWAITING` → `FORM`** (`public-rental-flow.ts`: `FORM` → UI step **`CONTRACT`**).

Semantics: **CUSTOMER_FORM_SAVE_ALLOWED** — not licence approval.

### Downstream gates (code-traced)

| Step | `assertLicenseProgress` (requires `VALID`) | Notes |
|------|---------------------------------------------|--------|
| `submitPublicForm` (partial) | No | By design |
| `submitPublicForm` (normal) | Yes | |
| `acceptPublic` (legacy) | Yes | Blocks UNREADABLE / REVIEW_REQUIRED / EXPIRED |
| **`signPublicOfficialContract`** | **No** | Uses `view.permissions.canSign` (field presence only) |
| `startPublicPayment` (card) | Yes | Blocks after `SIGNED` if not `VALID` |
| Staff **Car-Out** → `ACTIVE` | Indirect | Requires **CONFIRMED** `RENTAL` payment |

### Official contract hirer licence fields

`buildOfficialContractView`: licence number/expiry from **OCR identity draft when `VALID`**, else **`Customer` record** after partial save (`official-contract.ts`).

After partial save with **`REVIEW_REQUIRED`** (number + expiry on verification): hirer licence fields can be **filled from `Customer`** while verification remains **non-VALID**.

### Can UNREADABLE / REVIEW_REQUIRED progress legally?

| Action | UNREADABLE (typical B7: number, expiry often null) | REVIEW_REQUIRED (number + expiry) |
|--------|-----------------------------------------------------|-----------------------------------|
| Save customer form | Yes (if `licenseNumber`) | Yes |
| Contract signing (`signPublicOfficialContract`) | Unlikely (missing expiry → `DRIVER_LICENSE_EXPIRY`) | **Yes — no `VALID` check** |
| Card payment | No | No (blocked at payment start) |
| **CASH rental** (`settleCashRentalInTx` on sign) | N/A if cannot sign | **Yes — SIGNED + cash settled without `VALID`** |
| Car-Out / ACTIVE | No without confirmed payment | **CASH: possible after sign** |

**Finding:** **`CRITICAL_LICENSE_POLICY_BYPASS`** — `signPublicOfficialContract` does not call `assertLicenseProgress`. **`REVIEW_REQUIRED` + `collectionMode: CASH`** can reach **SIGNED**, **cash settlement**, and **READY_FOR_HANDOVER** UI without **`DrivingLicenseVerification.status === VALID`**. Electronic rentals are partially protected by payment gate; CASH is not.

**Verdict:** Partial save policy is acceptable for **save/review**; **legal progression beyond signing must be fixed** before release (out of scope for this audit).

---

## Audit 4 — Save vs approve

| Concept | Implementation |
|---------|----------------|
| `CUSTOMER_FORM_SAVE_ALLOWED` | `partialLicenseSave` for UNREADABLE / REVIEW_REQUIRED |
| `DRIVING_LICENSE_APPROVED` | `assertLicenseProgress` → only `VALID` passes |

Partial save does **not** set verification to `VALID`. **Bypass risk** is **signing / CASH**, not form save mutating verification.

---

## Audit 5 — EXPIRED

`evaluateDrivingLicenseOcr` sets **`EXPIRED`** when parsed expiry is before business today (after confidence pass).  
`submitPublicForm` (non-partial) calls `assertLicenseProgress` → **`drivingLicenseExpired`**.  
OCR success does **not** upgrade EXPIRED to VALID. Saving form does not clear EXPIRED on verification row.

---

## Audit 6 — Verification status source of truth

**Authoritative:** `DrivingLicenseVerification.status` (and linked evaluation at upload).  
**Not authoritative for gating:** `DrivingLicenseExtraction.engineDocumentStatus`, frontend OCR banner, customer-editable metadata (issue place, DOB, etc.).

Public context exposes masked licence only when `verification.status === "VALID"` (`public-rental-context.ts`).

---

## Audit 7 — Number / expiry source (B5)

On `submitPublicForm`, `drivingLicenseNumber` and `drivingLicenseExpiry` are taken from **`latestLicense` → verification**, not from request body OCR fields.  
Frontend cannot silently override verification for those two fields on submit.

---

## Audit 8 — Confirmed metadata source

From form body on submit: `dateOfBirth`, `drivingLicenseIssueDate`, `drivingLicensePlaceOfIssue` → **`Customer`**.  
No backend `DrivingLicenseExtraction` update on form edit/submit (B7 E2E proved place immutability).

---

## Audit 9 — Extraction immutability

**`MACHINE_SNAPSHOT_IMMUTABLE = true`** — only `createDrivingLicenseExtractionForUpload` on upload; no `drivingLicenseExtraction.update` in `APP/backend/src`.

---

## Audit 10 — Current document selection

| Layer | Selection |
|-------|-----------|
| Reupload | Supersedes prior `ContractDocument` (`supersededAt`) |
| Public extraction | `drivingLicenseExtractions` where `document.supersededAt: null` |
| Verification | `latestLicense`: newest `DrivingLicenseVerification` by `createdAt` |

Upload always creates a new verification tied to the new document; aligned with active extraction when OCR succeeds.

---

## Audit 11 — OCR outside transaction (B6F)

Flow: save attachment → read bytes → **`analyzeDrivingLicenseDocument`** → `withTransaction` (supersede, document, extraction, verification).

| Failure | Residual state |
|---------|----------------|
| OCR fails | Attachment may exist; tx still runs with `UNREADABLE` / `PROVIDER_UNAVAILABLE`, document + verification created |
| OCR ok, tx fails | Orphan attachment possible; no new document until retry |
| User retry | New upload; prior doc superseded; **acceptable** |

Consistent with prior upload semantics; not a redesign trigger.

---

## Audit 12 — Retry / idempotency

| Scenario | Class |
|----------|--------|
| Double upload | **ACCEPTABLE_EXISTING_BEHAVIOR** — advisory lock + supersede |
| Parallel OCR before tx | Two engine jobs possible; last tx wins on document chain |
| Refresh during OCR | Retries upload; may supersede |
| Engine timeout (120s) | **RISK** — user waits; second concurrent request queues on engine lock |

No duplicate extraction per `documentId` (unique index).

---

## Audit 13 — Serial engine (production)

- `asyncio.Lock` + single `EnglishOcrPipeline` + PP-OCRv5 worker.
- Second request waits for first (up to ~120s backend timeout each).
- **Deployment risk:** low for typical single-branch concurrency; **RISK** if many simultaneous licence uploads (queue latency, backend timeout). No optimization in C1.

---

## Audit 14 — LICENSE engine runtime (production)

See `DOCUMENT-ENGINE/LICENSE/README.md`, `docs/MODELS.md`.

| Item | Requirement |
|------|-------------|
| OS | Windows/Linux with Tesseract installed |
| Python | `.venv` (API + crop + RapidOCR); **separate** `.venv_ppocrv5` for worker |
| Native/libs | Tesseract, OpenCV, ONNX Runtime (via requirements) |
| Models | Under `frozen/ocr_v1_1/vendor/` (not in git) |
| Port | **8020** (`UAE_LICENSE_API_PORT`) |
| Env | `LICENSE_TESSERACT_CMD` if non-default; `KEEP_JOB_ARTIFACTS` optional |
| FS | Write `jobs/<uuid>/`, `output/ocr_service_cache/` |
| Memory | Single pipeline + worker; plan **≥ few GB** RAM per instance |

**Passport 8010 / Licence 8020 / backend / frontend:** independent processes. **`PASSPORT_LICENSE_RUNTIME_COUPLING = NONE`** in production.

---

## Audit 15 — Model distribution

Vendor ONNX/tessdata **gitignored**. Deploy must copy models per `docs/MODELS.md`.  
**`LICENSING_READY = LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION`** — unchanged.

---

## Audit 16 — Old dev paths in runtime

`APP/backend/src`: **0** references to `C:\Users\Rw\`, `UAE_LICENSE_CROP_V2`.  
`health.py` mentions `UAE_LICENSE_OCR_V1` only in **manifest path string** for integrity check.

---

## Audit 17 — Privacy / fixtures

Committed fixture: fictional **John Wick** corpus (`uae-driving-license-ocr-test.png` + expectations JSON).  
**No** `real02.jpg` or production attachments in git. Docs may mention local `real02` — not tracked.

---

## Audit 18 — `.gitignore`

Covers `.venv`, `.venv_ppocrv5`, `LICENSE/jobs/`, `LICENSE/output/`, `vendor/`, Python caches. Adequate for stated artifacts.

---

## Audit 19 — Environment

| Variable | Purpose |
|----------|---------|
| `UAE_DRIVING_LICENSE_API_URL` | Engine base URL (no hardcoded prod localhost) |
| `UAE_DRIVING_LICENSE_API_TIMEOUT_MS` | Default **120000** |
| `UAE_DRIVING_LICENSE_API_ORCHESTRATE` | Dev-only spawn when localhost |
| `DOCUMENT_OCR_MIN_CONFIDENCE` | Review vs VALID threshold |
| `PASSPORT_NUMBER_API_*` | Separate passport engine (8010) |

Documented in `APP/backend/.env.example`. No secrets in diff.

---

## Audit 20 — Ports / orchestration

| Service | Port |
|---------|------|
| Passport API | 8010 |
| Licence API | 8020 |
| Backend (E2E) | 8000 typical |
| Frontend (E2E) | 3100 typical |

`dev-with-document-engines.ts`: separate child processes; one engine failure should not corrupt the other’s process (independent spawn/health).

**Production recommendation:** run Licence API as **separate managed process** (systemd / Windows Service / container sidecar) — same pattern as Passport; backend only needs URL + timeout.

---

## Audit 21 — Database migration

`20261004120000_driving_license_extraction`: additive tables/columns, nullable FKs, **no backfill required**.

**Safe deploy order:** (1) migrate DB, (2) deploy models + Licence engine, (3) backend with env, (4) frontend.

---

## Audit 22–24 — Backward compatibility

- Old contracts without extraction / new customer columns: **OK** (nullable).
- OCR not required for existing flows.
- `drivingLicenseExtraction` on `PublicRentalContext`: **additive, nullable**.

---

## Audit 25 — Tests (latest documented)

| Suite | Result | Engine |
|-------|--------|--------|
| Backend OCR integration | **15/15** | Fake + integration |
| Frontend unit | **742/742** | n/a |
| Playwright `driving-license-ocr.spec.ts` | **2×2 pass** | Real :8020 + backend + DB |
| Licence engine regression | Documented in README | Real vendored baseline |

C1 re-run `npm test -- driving-license` not relied on (long-running); B7/B6 docs are source for totals.

---

## Audit 26 — Typecheck

- **Frontend OCR paths:** `tsc --noEmit` — **0** matches for public-rental/OCR filters.
- **Backend OCR-related:** `contracts.service.ts` partial save — `MaterializableCustomer` expects `drivingLicenseExpiry: Date` but partial path may pass `null` (**TS2345**). Also pre-existing test fixture gaps for new customer fields.
- Full backend `tsc` exit 2 — **do not** treat entire repo as OCR regression.

---

## Audit 27 — Lint

No separate C1 lint run; OCR-touched TS follows existing patterns. Recommend `lint` on staged OCR files before commit.

---

## Audit 28 — Playwright acceptance (B7)

Confirmed: browser upload → backend → **:8020** → DB → prefill → manual correction → customer persist → extraction immutable → reload without re-OCR → **no browser :8020**.

---

## Audit 29 — Documentation

Present: B2, A3*, B3, B4, B5, B6, B6F, B7 under `DOCU/OCR_INTEGRATION/`, LICENSE README.

**Missing / thin:** production **runbook** (engine systemd/Docker, model install checklist, health monitoring, queue/concurrency SLO).

---

## Audit 30 — Recommended commit groups

### Commit 1 — Licence Document Engine (source only)

- `DOCUMENT-ENGINE/LICENSE/**` (respect gitignore)
- `DOCUMENT-ENGINE/README.md` if licence-specific

**Exclude:** `DOCUMENT-ENGINE/PASSPORT/`

### Commit 2 — Backend persistence + bridge

- Migration `20261004120000_driving_license_extraction/`
- Prisma schema changes
- `document-engine/uae-driving-license-api.client.ts`
- `driving-license-extraction.*`, `public-driving-license-extraction.mapper.ts`
- `ocr/driving-license-ocr.*`, `driving-license-policy.ts`
- `contracts.service.ts` (licence hunks only if splitting), `contracts.schema.ts`, `public-rental-context.ts`, `contract-customer-materialization.ts`
- `env.ts`, `.env.example`
- `scripts/dev-with-document-engines.ts`, `e2e-audit-driving-license-ocr.ts`
- `package.json` dev script change
- `.gitignore`

### Commit 3 — Frontend + i18n

- All `APP/frontend` public-rental OCR changes, messages, `playwright.config.ts`, `e2e-api.ts`

### Commit 4 — Tests + Playwright + docs

- Backend `driving-license*` tests, `fake-uae-driving-license-api.ts`, B5 integration test
- `e2e/driving-license-ocr.spec.ts`, `e2e/fixtures/driving-license/**`, helpers
- `DOCU/OCR_INTEGRATION/**`, `DOCU/00-system-overview/document-engine.md`, vision-ai updates

**Defer separate PR:** Passport files (Audit 1B), `DOCU/OCR_INTEGRATION_AUDIT/`, `b6f-live-smoke-once.ts` (optional).

---

## Audit 31 — Exclude from staging

- Passport WIP (list in Audit 1B)
- `DOCUMENT-ENGINE/PASSPORT/` (unless intentional passport release)
- All Audit 1D paths
- `APP/backend/scripts/b6f-live-smoke-once.ts` (unless explicitly wanted)
- Unrelated `main` bootstrap commit should be **separate** from OCR commits (already on branch)

---

## Audit 32 — Readiness matrix

| Gate | Status |
|------|--------|
| **CODE_READY** | Yes for OCR feature scope; **policy gap on signing/CASH** |
| **TEST_READY** | Yes (B7 + 15/15 + 742/742) |
| **GIT_READY** | **No** — mixed Passport WIP + untracked tree + partial-save TS issue |
| **DEPLOYMENT_READY** | **Conditional** — engine ops + models + migration order documented; concurrency risk acknowledged |
| **LICENSING_READY** | **`LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION`** |

---

## C1 recommendation

**`D_OCR_C1_POLICY_BLOCKER`** — fix `signPublicOfficialContract` (and align official-contract `canSign` / CASH path) with `assertLicenseProgress` before merge/deploy.

Secondary: **`D_OCR_C1_GIT_CLEANUP_REQUIRED`** — isolate Passport WIP and resolve OCR-related `tsc` on partial save.

**Not recommended until policy resolved:** `D_OCR_C1_RELEASE_READY`.

---

## Final report index (A–Z)

See sections above: **A** git classification (Audit 1); **B** inventory (2); **C** policy (3–4) **`CRITICAL_LICENSE_POLICY_BYPASS`**; **D** EXPIRED (5); **E** verification SoT (6); **F** immutability (9); **G** current doc (10); **H** tx/OCR (11); **I** idempotency (12); **J** serial queue (13); **K** runtime (14); **L** models/licensing (15); **M** dev paths **0** in APP (16); **N** fixtures (17); **O** env (19); **P** migration (21); **Q** compat (22–24); **R** tests (25); **S** tsc (26); **T** lint (27); **U** Playwright (28); **V** runbook gap (29); **W** commits (30); **X** exclude (31); **Y** matrix (32); **Z** **`D_OCR_C1_POLICY_BLOCKER`**.
