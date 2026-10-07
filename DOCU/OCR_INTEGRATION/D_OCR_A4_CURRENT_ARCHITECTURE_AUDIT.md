# D-OCR-A4 — Current OCR integration architecture audit

**Scope:** READ-ONLY baseline for future OCR and public-rental UI work.  
**Repository:** `DIAMOND-SYSTEM` · **Date:** 2026-10-05  
**Companion artifacts:** `D_OCR_A4_FIELD_PIPELINE_MATRIX.md`, `D_OCR_A4_MODIFICATION_IMPACT_MATRIX.md`, `D_OCR_A4_CURRENT_ARCHITECTURE.json`

---

## 1. Top-level architecture (file/function per hop)

```
Browser (file input)
  → LicenseUpload.handleChange
      APP/frontend/.../license-upload/license-upload.tsx
  → PublicRentalScreen.handleFile → usePublicRentalStore.uploadLicense
      public-rental-screen.tsx, public-rental.store.ts
  → uploadPublicRentalLicense (FormData field `file`)
      public-rental.api.ts
  → POST /contracts/rental/:token/driving-license
      APP/backend/.../contracts/routes/public/route.ts (request.file())
  → contracts.uploadDrivingLicense
      contracts.service.ts
  → files.save + readFile(storage) → analyzeDrivingLicenseDocument
      driving-license-ocr.adapter.ts
  → extractDrivingLicenseFromImage (FormData field `image`)
      uae-driving-license-api.client.ts
  → POST http://127.0.0.1:8020/extract-driving-license
      services/uae_license_api/main.py::extract_driving_license
  → asyncio.Lock + process_driver_license (thread)
      orchestrator.py
  → subprocess: python -m src.run_crop_pipeline
      frozen/crop_v1/src/run_crop_pipeline.py
  → EnglishOcrPipeline.recognize_field (per eligible crop)
      frozen/ocr_v1_1/src/inference/english_ocr_pipeline.py
  → Tesseract / RapidOCR / PP-OCRv5 worker
      engines/*.py, workers/ppocrv5_client.py → ppocrv5_worker.py
  → JSON { document_status, fields, job_id }
      orchestrator._map_field_result, _document_status
  → mapBusinessBody + evaluateDrivingLicenseOcr
      adapter + driving-license-policy.ts
  → createDrivingLicenseExtractionForUpload + drivingLicenseVerification.create
      driving-license-extraction.repository.ts, contracts.service.ts
  → loadPublicRental → toPublicRentalContext
      public-rental-context.ts, public-driving-license-extraction.mapper.ts
  → resolvePublicRentalFormDefaults (mount once)
      public-rental-form-prefill.ts, contract-step.tsx
  → submitPublicForm → Customer (verification-backed number/expiry)
      contracts.service.ts submitPublicForm
```

**Image transforms before OCR:** None in Diamond backend (raw bytes from storage). Licence service: magic-byte sniff only (`image_decode.py`); no recompress/resize. Crop V1 deskews/decodes internally.

---

## 2. DOCUMENT-ENGINE/LICENSE tree

| Path | Purpose | Class |
|------|---------|--------|
| `services/uae_license_api/` | FastAPI wrapper, orchestration, health | **Runtime service** — safe to edit for HTTP contract/ops |
| `frozen/crop_v1/` | DYNAMIC_CROP_V1 vendored release | **Frozen algorithm** — edit only with version discipline |
| `frozen/ocr_v1_1/` | OCR_ENGLISH_V1_1 runtime | **Frozen algorithm** + `vendor/` models (gitignored) |
| `config/service.env.example` | Service env template | Docs |
| `jobs/<uuid>/` | Per-request artifacts | **Local/generated**, gitignored |
| `tests/run_vendored_ocr_regression.py` | 26/26 baseline gate | **Test-only** |
| `docs/` | MODELS, ARCHITECTURE | Docs |
| `.venv/` | Main Python (crop subprocess + API + in-proc OCR) | **Local**, gitignored |
| `.venv_ppocrv5/` | PP-OCRv5 worker interpreter only | **Local**, gitignored |
| `output/` | Service OCR cache | **Generated**, gitignored |

Passport engine under `DOCUMENT-ENGINE/PASSPORT/` is **not** imported by licence code (`runtime_paths.py` enforces separation).

---

## 3. Service entrypoint (`services/uae_license_api/`)

| Item | Detail |
|------|--------|
| **FastAPI app** | `main.py` — `app = FastAPI(..., lifespan=lifespan)` |
| **Startup** | `lifespan` → `EnglishOcrPipeline(cache_dir=.../output/ocr_service_cache)` |
| **Health** | `GET /health` → `build_health(_pipeline)` |
| **Extract** | `POST /extract-driving-license` — multipart **`image`** (JPEG/PNG, ≤5 MiB) |
| **Success schema** | `job_id`, `document_status`, `fields{value,status,crop_status,ocr_eligible,confidence,engine}`, `runtime_ms` |
| **Error schema** | `{ "error": code, "message": string }` — e.g. `INVALID_IMAGE`, `CROP_FAILED`, `TABLE_NOT_FOUND`, `INTERNAL_OCR_ERROR` |

Trace: `extract_driving_license` → `process_driver_license(tmp_path, _pipeline, job_id)` → crop subprocess → loop `pipeline.recognize_field`.

---

## 4. Process lifecycle (startup vs request)

| Component | When created | Restart needed after change |
|-----------|--------------|----------------------------|
| `EnglishOcrPipeline` | Once per FastAPI process (lifespan) | **Restart uvicorn :8020** |
| Tesseract + RapidOCR engines | Pipeline `__init__` (`cold_init`) | Restart :8020 |
| `Ppocrv5WorkerClient` / worker PID | First `name_en` request (`ensure_started`) | Restart :8020 (kills worker) |
| `asyncio.Lock` | Module load | N/A |
| Crop subprocess | **Each request** (`_run_crop_subprocess`) | Crop code: next request; manifest verify at health |
| Config JSON | Read at pipeline init (`load_final_config`) | Restart :8020 |
| Job dir `jobs/<uuid>/` | Per request | N/A |

Diamond backend: no OCR state; change adapter/client → restart **backend only**. Frontend changes → HMR / refresh only.

---

## 5. Crop pipeline

| Item | Value |
|------|--------|
| Entry | `frozen/crop_v1/src/run_crop_pipeline.py::run_pipeline` |
| Invoked by | `orchestrator._run_crop_subprocess` |
| Command | `{LICENSE/.venv}/python -m src.run_crop_pipeline --input ... --output .../crop --config .../crop_layout.json` |
| CWD / PYTHONPATH | `CROP_ROOT`, `PYTHONPATH=CROP_ROOT` |
| Input | `jobs/<id>/input/original.{jpg|png}` (copy of upload) |
| Outputs | `crop/value_crops/*.png`, `ocr_handoff.json`, `pipeline_report.json`, diagnostics |
| Stop conditions | `stopped_reason` in report → `TABLE_NOT_FOUND` or `CROP_FAILED` |

Handoff consumed by orchestrator; OCR never imports crop `src` in-process (name collision avoided).

---

## 6–7. OCR pipeline & field matrix

See **`D_OCR_A4_FIELD_PIPELINE_MATRIX.md`** for per-field engines, validators, status rules, and end-to-end value chains.

Batch API `recognize_license_english()` exists in `english_ocr_pipeline.py` but **HTTP path uses per-field `recognize_field` only** (dead path for production HTTP).

---

## 8–10. Worker, models, configuration

**PP-OCRv5:** JSON-lines stdin/stdout; `recognize` command with `crop_path`; 120s timeout; 2-attempt restart on failure. See matrix doc.

**Models (under `frozen/ocr_v1_1/vendor/`, gitignored):**

- `tessdata/eng.traineddata` — Tesseract
- `rapidocr_en/en_PP-OCRv4_rec_infer.onnx` — dates, nationality fallback, place
- `ppocrv5_en/en_PP-OCRv5_rec_mobile.onnx` + `ppocrv5_en_dict.txt` — `name_en`

Integrity: `health.check_model_integrity`, worker SHA check, `release/.../model_manifest.json`.

**Config files:**

- `ocr_final_english_v1.json` — field routing, thresholds, date calibration
- `tesseract.json` — host binary hints
- `crop_layout.json` — crop geometry
- `config/service.env.example` — ports, paths

---

## 11–12. Safe zones & frozen meaning

**“Frozen” today:** Vendored trees `frozen/crop_v1` and `frozen/ocr_v1_1` with `release/*` manifests and regression baselines. Runtime edits have been made **in-tree** (not a separate copy step on each run); treat as **immutable release tags** for production discipline.

**Recommendation:** Future OCR changes → new folder `ocr_v1_2` (or `crop_v1_1`), point `OCR_ROOT` / `CROP_ROOT` in `runtime_paths.py`, re-run regression, then integrate. Do not silently drift `ocr_v1_1` without baseline update.

Full A/B/C/D file lists: **`D_OCR_A4_MODIFICATION_IMPACT_MATRIX.md`**.

---

## 13. Job directory lifecycle

```
jobs/<uuid>/
  input/original.*
  crop/          (value_crops, ocr_handoff.json, pipeline_report.json, …)
  result.json    (if KEEP_JOB_ARTIFACTS=true, default)
```

Created at start of `process_driver_license`. Temp upload file in system temp deleted in `main.py` finally. Retention: no auto-delete (env `KEEP_JOB_ARTIFACTS`); concurrent jobs isolated by UUID. Failed crop may leave partial `crop/` dir.

---

## 14–15. Image & frontend upload flow

**Frontend:** `LICENSE_ACCEPT` in `license-file.ts`; client-side preview via `URL.createObjectURL` only.  
**Upload trigger:** `uploadPending` on store; `license-verifying` panel when pending.  
**States:** `license-view.ts` + testids in `license-step.tsx` (see matrix).  
**Contract step on license tab:** Rendered when `context.drivingLicenseExtraction` is non-null (`public-rental-screen.tsx`) — enables B7 partial flow while `licenseVerification.status === UNREADABLE`.

---

## 16–17. Backend client & adapter

**Client (`uae-driving-license-api.client.ts`):** Builds `FormData` with blob field **`image`**; timeout `UAE_DRIVING_LICENSE_API_TIMEOUT_MS` (120s); Zod `SuccessBodySchema`; maps HTTP errors to `LICENSE_OCR_*` codes. No byte transformation.

**Adapter responsibilities:**

| Concern | Location |
|---------|----------|
| Transport | Delegates to client |
| Field text / dates | `fieldText`, `ocrVisibleDateToIso` |
| Top-level policy fields | `licenseNumber`, `expiryDate`, `holderName`, confidences |
| Rich extraction | `buildExtraction` (no `license_number` in extraction object — top-level only) |
| `fieldsMeta` | `buildFieldsMetaFromEngineFields` |
| Errors | `mapClientError` → `NOT_CONFIGURED` / `PROVIDER_UNAVAILABLE` / `UNREADABLE` |

**New engine field:** extend engine JSON → `SuccessBodySchema` → adapter `buildExtraction` / `fieldText` → Prisma + public mapper + prefill + tests.

---

## 18–20. Transformation chains

Compact tables in **`D_OCR_A4_FIELD_PIPELINE_MATRIX.md`** (values + statuses + dates).

---

## 21–22. DrivingLicenseExtraction & Verification

**Extraction (immutable after insert):** Normalized columns + `fieldsMeta` JSON (per-field engine `status`, confidence, cropStatus, ocrEligible, engine). `engineDocumentStatus` stores raw document_status. Status enum: `READY` | `PARTIAL` | `FAILED` | …

**Verification policy (`evaluateDrivingLicenseOcr`):**

- **OCR quality:** adapter success, confidences, presence of number/expiry
- **Business:** expiry vs `businessToday` → `EXPIRED`; threshold → `REVIEW_REQUIRED`

Unreadable/review does not delete extraction row when `ocr.ok` was true with partial data.

---

## 23. PublicRentalContext selection

`PUBLIC_RENTAL_INCLUDE.drivingLicenseExtractions`: `where: { document: { supersededAt: null } }`, `orderBy: createdAt desc`, `take: 1`. Reupload supersedes prior `ContractDocument`; old extraction remains on old document but is not current.

---

## 24–25. Prefill & form fields

**Precedence:** Customer confirmed string → else OCR (if not `REJECT`) → else verification fields for license number/expiry only (`licenseNumberFallback`, `licenseExpiryFallback`).

**formMountKey:** `saved-{contract}` if customer name set; else `draft-{contract}-{extraction seed}` — `FormBuilder` `key={formMountKey}` prevents refetch overwriting edits.

**Form fields:** `public-rental-form.fields.ts` — all editable in form; `drivingLicenseNumber` / `drivingLicenseExpiry` displayed but **submit uses verification** (see §27).

---

## 26–27. Submit & number/expiry policy

`submitPublicForm`: `drivingLicenseNumber` / `drivingLicenseExpiry` taken from **`latest DrivingLicenseVerification`**, not form body. User may edit those inputs for UX; values are **not** persisted from form for those two fields. Other fields → Customer. Extraction **never updated** on form save.

Partial save path: `UNREADABLE` or `REVIEW_REQUIRED` allows save with `verification.licenseNumber` only (no full `identityReady`).

---

## 28. Failure paths (summary)

| Scenario | Engine | Backend verification | Extraction row | UI |
|----------|--------|----------------------|----------------|-----|
| Bad image / 415 | HTTP error | UNREADABLE | null | unreadable panel |
| Crop fail | 422 CROP_FAILED | UNREADABLE | null | unreadable |
| Provider down | adapter PROVIDER_UNAVAILABLE | PROVIDER_UNAVAILABLE | null | unavailable |
| Low confidence | 200 + fields | REVIEW_REQUIRED | usually PARTIAL | review + form |
| Document REJECT | 200 REJECT | UNREADABLE if missing number/expiry | FAILED | unreadable |
| Expired date | 200 | EXPIRED | may exist | expired |
| PP worker down | health NOT_READY / ENGINE_ERROR | PROVIDER_UNAVAILABLE or UNREADABLE | varies | unavailable / unreadable |

User can reupload from license step (supersedes document).

---

## 29. Reupload

New `ContractDocument`, new `DrivingLicenseVerification`, new `DrivingLicenseExtraction` when `ocr.ok`. Prior documents get `supersededAt`. Form remounts if `formMountKey` changes (extraction seed). User edits lost unless customer already saved.

---

## 30. Concurrency

- Multiple Diamond uploads: each calls engine; **serialized** at licence API lock → queue at ~1× crop+OCR duration.
- 2–5 parallel uploads: linear wait; 120s client timeout may fire on backlog.
- Passport upload uses attempt counter; **licence upload has no equivalent race guard** (known asymmetry).

---

## 31. Frontend state machine

**Flow step (backend):** `derivePublicRentalFlowStep` — `LICENSE_VERIFICATION` until `identityReady` (VALID + passport READY), then `CONTRACT`, etc.

**License UI panel:** `licensePanelFromStatus(verification.status, uploadPending)`.

**Contract step transition:** User navigates via `RentalProgress`; allowed stage from `flow.step`. B7: unreadable license still shows `contract-step` when extraction present on license stage.

---

## 32. Playwright B7 (`driving-license-ocr.spec.ts`)

**Proves:** Real `:8020` engine; real backend; fixture image upload; `license-unreadable` + `contract-step` + OCR prefill; manual correction; form save; DB audit script (`auditDrivingLicenseOcr`); reload preserves customer edits; **no browser calls to :8020**; mobile layout smoke.

**Not covered:** VALID panel path, EXPIRED, PROVIDER_UNAVAILABLE, reupload race, passport, payment.

---

## 33–34. Tests & impact matrix

Listed in **`D_OCR_A4_MODIFICATION_IMPACT_MATRIX.md`**.

---

## 35–37. Future workflows & change points

See impact matrix § Recommended workflows and § Likely change points.

---

## 38. Local startup sequence

1. PostgreSQL (dev DB)
2. `cd DOCUMENT-ENGINE/LICENSE && .venv/Scripts/python -m uvicorn services.uae_license_api.main:app --host 127.0.0.1 --port 8020`
3. Optional passport `:8010`
4. `cd APP/backend && npm run dev` — `scripts/dev-with-document-engines.ts` may spawn licence API when `UAE_DRIVING_LICENSE_API_URL` is localhost and `UAE_DRIVING_LICENSE_API_ORCHESTRATE` ≠ `false`
5. `cd APP/frontend && npm run dev` (port 3100)

Bootstrap: `APP/backend npm run dev:bootstrap` for permissions/data.

---

## 39. Environment variables

| Variable | Owner |
|----------|--------|
| `UAE_DRIVING_LICENSE_API_URL` | Diamond backend |
| `UAE_DRIVING_LICENSE_API_TIMEOUT_MS` | Diamond backend |
| `UAE_DRIVING_LICENSE_API_ORCHESTRATE` | dev script only |
| `DOCUMENT_OCR_MIN_CONFIDENCE` | Diamond policy |
| `LICENSE_ENGINE_ROOT`, `LICENSE_JOBS_ROOT`, `KEEP_JOB_ARTIFACTS` | Licence service |
| `LICENSE_TESSERACT_CMD`, `LICENSE_TESSDATA_DIR` | Licence OCR + crop health |
| `LICENSE_PPOCRV5_PYTHON` | PP worker spawn |

---

## 40. Blueprint summary

| Area | Reference |
|------|-----------|
| A. Process diagram | §1 above + `D_OCR_A4_CURRENT_ARCHITECTURE.json` |
| B. File map | §2, impact matrix |
| C. Data flow | Field matrix doc |
| D. Status flow | Field matrix § Status chains |
| E. Persistence | §21–23, contracts.service upload |
| F. UI flow | §14–15, §31 |
| G. Safe zones | Impact matrix |
| H. Regression map | Impact matrix § Test inventory |

---

## Architectural notes (AC–AD)

**Weaknesses:** Engine serial lock; licence upload lacks passport-style in-flight attempt guard; dual multipart field names (`file` vs `image`); `UNREADABLE` + extraction UX is easy to misread as “failed closed.”

**Stale / duplicate:** `recognize_license_english()` batch path unused by HTTP; legacy vision-ai tests hook adapter but production path is document-engine only.

---

## Final verdict

**`D_OCR_A4_ARCHITECTURE_BASELINE_READY`** — End-to-end map, field matrix, impact matrix, and machine-readable JSON are in `DOCU/OCR_INTEGRATION/` for future implementation prompts.
