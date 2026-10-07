# D-OCR-A4 — Modification impact matrix

Use this when scoping OCR vs mapping vs UI work. **Restart column** assumes local dev; production needs the same process restarts.

| Change type | Primary files | Tests to run / update | Restart | Migration | Frontend | Playwright |
|-------------|---------------|----------------------|---------|-----------|----------|------------|
| **A. Crop coordinates / logic** | `frozen/crop_v1/src/**`, `frozen/crop_v1/config/crop_layout.json`, `services/uae_license_api/orchestrator.py` (`_run_crop_subprocess`) | `DOCUMENT-ENGINE/LICENSE/tests/run_vendored_ocr_regression.py`; crop tests under `frozen/crop_v1/tests/`; `driving-license-engine-bridge.test.ts` if handoff shape changes | **Licence FastAPI** (crop subprocess only loads per request; template manifest cached in process) | No | Only if crop failure rates change UX | **Yes** if fixture expectations change |
| **B. OCR preprocessing** | `frozen/ocr_v1_1/src/preprocess/**`, `english_ocr_pipeline._preprocess` | `run_vendored_ocr_regression.py`; `frozen/ocr_v1_1/tests/**` | **Licence FastAPI** (pipeline constructed at startup) | No | No | If prefill JSON fixture changes |
| **C. Tesseract settings** | `frozen/ocr_v1_1/config/tesseract.json`, `tesseract_english.py`, field policies | Unit tests in `ocr_v1_1/tests`; regression script | **Licence FastAPI** | No | No | Optional |
| **D. PP-OCRv5 name** | `ppocrv5_worker.py`, `rapidocr_ppocrv5_en.py`, `ocr_final_english_v1.json` `name_en` | `test_ocr11b_runtime.py`; worker recovery scripts; B7 expectations | **Licence FastAPI** + **PP worker** (child process) | No | No | **Yes** for `holderNameEn` |
| **E. RapidOCR dates** | `date_fallback.py`, `english_ocr_pipeline._recognize_date`, `ocr_final_english_v1.json` date section | `test_date_strict.py`, regression script | **Licence FastAPI** | No | No | If DOB/issue/expiry in fixture |
| **F. Validators** | `frozen/ocr_v1_1/src/validators/**` | Validator unit tests + regression | **Licence FastAPI** | No | No | If status flips REVIEW/UNREADABLE |
| **G. Field / document status logic** | `english_ocr_pipeline.py` status branches; `orchestrator._document_status`, `_map_field_result` | Engine regression; `driving-license-extraction.mapper` if DB status mapping changes | **Licence FastAPI** | No | If `engineDocumentStatus` / banner copy | If verification panel changes |
| **H. HTTP response schema** | `services/uae_license_api/schemas.py`, `main.py`, `SuccessBodySchema` in `uae-driving-license-api.client.ts` | `uae-driving-license-api.client.test.ts`, bridge integration | Licence + **Backend** if client changes | No | Types in `public-rental.types` if exposed | **Yes** |
| **I. DB fields** | `prisma/schema/contracts.prisma`, mappers, `PublicRentalContextSchema` | Migration; `driving-license-extraction-persistence.test.ts`, `public-driving-license-extraction.mapper.test.ts` | Backend + `db:generate` | **Yes** | Context types + prefill | **Yes** |
| **J. Frontend display only** | `license-step.tsx`, `contract-step.tsx`, CSS modules | `license-view.test.ts` | None | No | **Yes** | If testids / copy |
| **K. Prefill behavior** | `public-rental-form-prefill.ts`, `contract-step.tsx` (`formMountKey`) | `public-rental-form-prefill.test.ts`, `public-rental-form-ocr-b5.test.ts` | None | No | **Yes** | **Yes** (B7) |
| **L. UI layout** | `public-rental-screen.tsx`, progress, modules CSS | Component tests if any | None | No | **Yes** | Mobile test in B7 |

---

## Safe modification zones (file lists)

### A — Safe for OCR recognition improvement (with regression)

- `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/src/inference/*.py`
- `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/src/engines/*.py`
- `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/src/preprocess/*.py`
- `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/src/validators/*.py`
- `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/config/ocr_final_english_v1.json`
- `DOCUMENT-ENGINE/LICENSE/frozen/crop_v1/src/**` (geometry)
- `DOCUMENT-ENGINE/LICENSE/frozen/crop_v1/config/crop_layout.json`

**Forbidden without version bump:** changing `ocr_handoff.json` contract or crop file numbering (`01_`…`08_`) without updating orchestrator + Diamond tests.

### B — Modify only with regression tests

- `DOCUMENT-ENGINE/LICENSE/services/uae_license_api/orchestrator.py` (document status rules)
- `DOCUMENT-ENGINE/LICENSE/services/uae_license_api/main.py` (limits, lock behavior)
- `APP/backend/src/modules/contracts/driving-license-policy.ts`
- `APP/backend/src/modules/contracts/ocr/driving-license-ocr.adapter.ts`
- `APP/backend/src/modules/document-engine/uae-driving-license-date.ts`

### C — Frozen / immutable unless releasing new version

- `frozen/ocr_v1_1/release/OCR_ENGLISH_V1_1_RUNTIME/**` (manifests, baselines)
- `frozen/crop_v1/release/DYNAMIC_CROP_V1/**`
- Regression baselines referenced by `tests/run_vendored_ocr_regression.py`

**Recommendation:** copy to `ocr_v1_2` / `crop_v1_1` for algorithm releases; keep service wrapper pointing at active version via `runtime_paths.py`.

### D — Diamond integration (not OCR algorithm)

- `APP/backend/src/modules/document-engine/uae-driving-license-api.client.ts`
- `APP/backend/src/modules/contracts/contracts.service.ts` (`uploadDrivingLicense`, `submitPublicForm`)
- `APP/backend/src/modules/contracts/driving-license-extraction.*`
- `APP/backend/src/modules/contracts/public-rental-context.ts`
- `APP/frontend/src/modules/public-rental/**` (upload, prefill, steps)

---

## Likely change points by goal

### 1. OCR recognition improvement

| Layer | File | Function |
|-------|------|----------|
| Field router | `english_ocr_pipeline.py` | `recognize_field` |
| Policies | `license_policy.py`, `nationality_policy.py`, `place_policy.py`, `date_fallback.py` | policy entry functions |
| Worker | `ppocrv5_worker.py` | `handle_recognize` |
| Crop | `run_crop_pipeline.py` | `run_pipeline` |
| Tests | `DOCUMENT-ENGINE/LICENSE/tests/run_vendored_ocr_regression.py` | full gate |

**Do not** change multipart field name `image` or Fastify field `file` without coordinated client update.

### 2. OCR → Diamond mapping / status

| File | Function |
|------|----------|
| `driving-license-ocr.adapter.ts` | `mapBusinessBody`, `buildExtraction`, `aggregateConfidence` |
| `driving-license-policy.ts` | `evaluateDrivingLicenseOcr`, `confidencePasses` |
| `driving-license-extraction.mapper.ts` | `extractionStatusFromOcr`, `buildFieldsMetaFromEngineFields` |
| `public-driving-license-extraction.mapper.ts` | `mapDrivingLicenseExtractionForPublicContext` |

Tests: unit mappers + `driving-license-public-context.test.ts` + integration persistence.

### 3. UI / UX only

| File | Concern |
|------|---------|
| `license-step.tsx`, `license-view.ts` | Panels, testids |
| `contract-step.tsx` | Form layout, OCR banner |
| `public-rental-form-prefill.ts` | Precedence (policy change if logic changes) |
| `public-rental-screen.tsx` | When `ContractStep` embeds on license stage |
| `messages/en.json`, `ar.json` | Copy |

Tests: `license-view.test.ts`, `public-rental-form-prefill.test.ts`, Playwright B7 for regressions.

---

## Recommended workflows

### OCR algorithm (post A4)

1. Audit (this baseline) → branch `ocr_v1_2` (or new crop tag).
2. Change frozen tree + update `OCR_ROOT` / release pointer if versioned.
3. `run_vendored_ocr_regression.py` (26/26).
4. Live image on `:8020` `/extract-driving-license`.
5. `driving-license-engine-bridge.test.ts` (integration).
6. Backend unit mappers unchanged unless schema/status changes.
7. Playwright B7 with updated fixture JSON if values shift.

### UI-only

1. Confirm no engine/adapter diff.
2. Change frontend + i18n.
3. Unit prefill/view tests.
4. Playwright only if user-visible assertions change.

---

## Test inventory (licence OCR)

| Area | Path | Kind |
|------|------|------|
| Crop | `frozen/crop_v1/tests/**` | unit (Python) |
| OCR runtime | `frozen/ocr_v1_1/tests/**`, `tests/run_vendored_ocr_regression.py` | unit + real engine |
| API client | `tests/unit/uae-driving-license-api.client.test.ts` | unit |
| Date parse | `tests/unit/uae-driving-license-date.test.ts` | unit |
| Adapter | via bridge + `vision-ai-document.test.ts` hooks | unit |
| Persistence | `tests/integration/driving-license-extraction-persistence.test.ts` | integration |
| Public context | `tests/integration/driving-license-public-context.test.ts` | integration |
| Bridge | `tests/integration/driving-license-engine-bridge.test.ts` | integration (real :8020 optional) |
| Prefill API | `tests/integration/public-rental-form-ocr-b5.test.ts` | integration |
| Identity flow | `tests/integration/public-identity-flow.test.ts` | integration (fake OCR) |
| Prefill FE | `public-rental-form-prefill.test.ts` | unit |
| Playwright | `e2e/driving-license-ocr.spec.ts` | browser + **real engine** |
