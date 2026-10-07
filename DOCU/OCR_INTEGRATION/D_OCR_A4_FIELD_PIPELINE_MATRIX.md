# D-OCR-A4 — Field pipeline matrix (current state)

**Baseline date:** 2026-10-05 · **Source of truth:** `DOCUMENT-ENGINE/LICENSE` frozen runtime + Diamond bridge code.

## Semantic crop outputs (Crop V1)

| `field_name` | Value crop file | OCR in HTTP API |
|--------------|-----------------|-----------------|
| `license_number` | `value_crops/01_license_number.png` | Yes |
| `name_ar` | `value_crops/02_name_ar.png` | No (`NOT_OCR_PROCESSED`) |
| `name_en` | `value_crops/03_name_en.png` | Yes |
| `nationality` | `value_crops/04_nationality.png` | Yes |
| `date_of_birth` | `value_crops/05_date_of_birth.png` | Yes |
| `issue_date` | `value_crops/06_issue_date.png` | Yes |
| `expiry_date` | `value_crops/07_expiry_date.png` | Yes |
| `place_of_issue` | `value_crops/08_place_of_issue.png` | Yes |

Crop eligibility (orchestrator mirrors `is_field_ocr_eligible`): `crop_geometry_status == VALUE_OK`, `content_sanity_status != CONTENT_EMPTY_OR_UNRELIABLE`, `ocr_eligible == true`.

---

## Field → engine matrix

| Field | Primary engine | Fallback / policy | Preprocessing (typical) | Validator | Normalizer | Engine field `status` | Public JSON `engine` |
|-------|----------------|-------------------|-------------------------|-----------|------------|----------------------|----------------------|
| `license_number` | Tesseract (`recognize_license` policy) | Multi-variant preprocess + PSM sweep in `license_policy.py` | `P0_RAW`, `P7_OTSU_UP2_PAD`, etc. | `validate_field` → `license_digits_only` | `normalize_for_field` | ACCEPT if validator ACCEPT; else FLAG_UNCERTAIN if text; else REJECT | `tesseract` |
| `name_en` | PP-OCRv5 worker (`rapidocr_ppocrv5_en`) | None (empty → FLAG_UNCERTAIN) | `P0_RAW` | `name_en_latin` | `normalize_for_field` | ACCEPT / REJECT / FLAG_UNCERTAIN | `rapidocr_ppocrv5_en` |
| `nationality` | Tesseract (`recognize_nationality`) | RapidOCR PP-OCRv4 EN on `P3_UP2_GRAY_PAD` if weak | `P0_RAW`, `P1_PAD`, PSM 7/13 | `nationality_latin` | `normalize_for_field` | ACCEPT or FLAG_UNCERTAIN (quality floor) | `tesseract` |
| `date_of_birth` | RapidOCR PP-OCRv4 (`date_policy`) | Tesseract PSM 7/13 + Rapid variants via `select_date_output` | `P0_RAW` primary; fallbacks `P1_PAD`, `P3_UP2_GRAY_PAD` | `validate_date_text` + `validate_field` | `normalize_for_field` | ACCEPT short-circuit or `_map_status` from selector | `date_policy` |
| `issue_date` | Same as DOB | Same | Same | Same | Same | Same | `date_policy` |
| `expiry_date` | Same as DOB | Same | Same | Same | Same | Same | `date_policy` |
| `place_of_issue` | `recognize_place` (Tesseract + Rapid) | Policy picks best candidate | `P1_PAD` default in config | `english_fields` place rules | `normalize_for_field` | ACCEPT or FLAG_UNCERTAIN | `tesseract` or `rapidocr_en` |

Implementation entry: `frozen/ocr_v1_1/src/inference/english_ocr_pipeline.py` → `recognize_field()`.

Config routing reference: `frozen/ocr_v1_1/config/ocr_final_english_v1.json`.

---

## End-to-end value chain (seven English fields)

| Public / form key | Engine `fields` key | HTTP JSON | Adapter (`driving-license-ocr.adapter.ts`) | DB column (`DrivingLicenseExtraction`) | `fieldsMeta` key | Public context field | Form `name` |
|-------------------|---------------------|-----------|--------------------------------------------|----------------------------------------|------------------|----------------------|-------------|
| licenseNumber | `license_number` | `fields.license_number.value` | `licenseNumber`, `fieldText` | `licenseNumber` | `license_number` | `fields.licenseNumber` | `drivingLicenseNumber` |
| holderNameEn | `name_en` | `fields.name_en.value` | `holderName`, `extraction.nameEn` | `holderNameEn` | `name_en` | `fields.holderNameEn` | `name` |
| nationality | `nationality` | `fields.nationality.value` | `extraction.nationality` | `nationality` | `nationality` | `fields.nationality` | `nationality` |
| dateOfBirth | `date_of_birth` | `fields.date_of_birth.value` | `ocrVisibleDateToIso` → `extraction.dateOfBirth` | `dateOfBirth` (UTC noon) | `date_of_birth` | `fields.dateOfBirth` | `dateOfBirth` |
| issueDate | `issue_date` | `fields.issue_date.value` | `ocrVisibleDateToIso` → `extraction.issueDate` | `issueDate` | `issue_date` | `fields.issueDate` | `drivingLicenseIssueDate` |
| expiryDate | `expiry_date` | `fields.expiry_date.value` | `ocrVisibleDateToIso` → top-level `expiryDate` + column | `expiryDate` | `expiry_date` | `fields.expiryDate` | `drivingLicenseExpiry` |
| placeOfIssue | `place_of_issue` | `fields.place_of_issue.value` | `extraction.placeOfIssue` | `placeOfIssue` | `place_of_issue` | `fields.placeOfIssue` | `drivingLicensePlaceOfIssue` |

Mappers: persistence `driving-license-extraction.mapper.ts`; API projection `public-driving-license-extraction.mapper.ts`; prefill `public-rental-form-prefill.ts`.

---

## Status chains

### Engine document vs field

| Layer | Values | Producer |
|-------|--------|----------|
| Per-field OCR | `ACCEPT`, `FLAG_UNCERTAIN`, `REJECT`, `SKIPPED_INELIGIBLE_CROP`, `NOT_OCR_PROCESSED` | `orchestrator._map_field_result` + `EnglishOcrPipeline` |
| Document | `ACCEPT`, `REVIEW_REQUIRED`, `REJECT` | `orchestrator._document_status` |

Document rules: all eligible fields `ACCEPT` and no ineligible → `ACCEPT`; any eligible `ACCEPT` with mixed outcomes → `REVIEW_REQUIRED`; no eligible or all bad → `REJECT`.

### Engine → Diamond verification (`evaluateDrivingLicenseOcr`)

| Condition | `DrivingLicenseVerification.status` |
|-----------|--------------------------------------|
| Adapter `ok: false`, `NOT_CONFIGURED` / transport/model | `PROVIDER_UNAVAILABLE` |
| Adapter `ok: false`, other | `UNREADABLE` |
| `ok: true`, missing number or expiry ISO | `UNREADABLE` |
| `ok: true`, confidence below `DOCUMENT_OCR_MIN_CONFIDENCE` (default 0.8) on license number and/or expiry | `REVIEW_REQUIRED` |
| `ok: true`, expiry before business today | `EXPIRED` |
| `ok: true`, else | `VALID` |

OCR quality inputs: engine confidences on `license_number` and `expiry_date` only (`aggregateConfidence` in adapter).

### Engine document → extraction row status

| `document_status` | `DrivingLicenseExtraction.status` |
|-------------------|-----------------------------------|
| `ACCEPT` | `READY` |
| `REVIEW_REQUIRED` | `PARTIAL` |
| `REJECT` | `FAILED` |

### Verification → license UI panel (`licensePanelFromStatus`)

| `licenseVerification.status` | `pending` | Panel `data-testid` |
|------------------------------|-----------|---------------------|
| any | `true` | `license-verifying` |
| `VALID` | false | `license-valid` |
| `EXPIRED` | false | `license-expired` |
| `UNREADABLE` | false | `license-unreadable` |
| `REVIEW_REQUIRED` | false | `license-review` |
| `PROVIDER_UNAVAILABLE` | false | `license-unavailable` |
| `PENDING` / null | false | (idle — no panel) |

### Prefill vs field OCR status

`ocrFieldPrefillValue`: uses value when `ocrStatus !== REJECT` (public `ocrStatus` = engine field `status` from `fieldsMeta`).

---

## Date transformations

| Stage | Format | Function |
|-------|--------|----------|
| OCR raw / engine `value` | `DD/MM/YYYY` or `DD-MM-YYYY` (visible) | validators in engine |
| Adapter / persistence | `YYYY-MM-DD` ISO calendar | `ocrVisibleDateToIso` (`uae-driving-license-date.ts`) |
| Prisma | `DateTime` UTC noon | `calendarDateToStoredUtc` |
| Public API / form | `YYYY-MM-DD` string | `formatStoredExpiry` |

Invalid or partial visible dates → `null` at adapter; verification may become `UNREADABLE` if expiry missing.

---

## PP-OCRv5 worker (summary)

| Item | Detail |
|------|--------|
| Spawn | `Ppocrv5WorkerClient._start_worker` → `LICENSE_PPOCRV5_PYTHON -m src.workers.ppocrv5_worker` |
| IPC | JSON lines on stdin/stdout; stderr for logs |
| Models | `vendor/ppocrv5_en/en_PP-OCRv5_rec_mobile.onnx`, `ppocrv5_en_dict.txt` |
| Timeout | 120s per request (`Ppocrv5WorkerClient`) |
| Crash/hang | Terminate + one restart retry; returns `ENGINE_ERROR` to pipeline |
| Malformed JSON | Request fails → `INTERNAL_OCR_ERROR` at HTTP layer if uncaught |

See `D_OCR_A4_CURRENT_ARCHITECTURE_AUDIT.md` § lifecycle for restart rules.
