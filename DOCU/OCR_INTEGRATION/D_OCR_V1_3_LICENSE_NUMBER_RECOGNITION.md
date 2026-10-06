# D-OCR-V1.3 — Licence Number Recognition (PP-OCRv5 Primary)

**Release:** `OCR_ENGLISH_V1_3_TWO_FIELD`  
**Supersedes (active):** `OCR_ENGLISH_V1_2_TWO_FIELD` (preserved in `ocr_pipeline_v1_2.py` + frozen `ocr_v1_2`)  
**Crop:** unchanged `DYNAMIC_CROP_V1`  
**Expiry:** unchanged V1.2 date pipeline  

## Architecture

```
row-1 value trim (Crop V1)
    → LicenseNumberRecognizer
        → PP-OCRv5 × 3 variants (2× LANCZOS, raw / CLAHE / Otsu)
        → stability: ≥2 variants exact same digits
        → veto: Tesseract + Rapid agree with each other but ≠ stable PP → REJECT
        → validate_field(license_number)
    → ACCEPT digits or REJECT (re-upload)
```

Expiry continues via `TwoFieldOcrPipelineV12._recognize_expiry` (superclass).

## Worker field-aware sanitization

`ppocrv5_worker.py` supports `field_name`:

| field | sanitizer |
|-------|-----------|
| `name_en` | `sanitize_name_ocr_output` (unchanged) |
| `license_number` | `sanitize_license_ocr_output` (digit-safe) |

Unsupported `field_name` → `ENGINE_ERROR`.

## PP stability rule

Three deterministic variants must yield **at least two identical** digits-only strings. No “pick highest confidence” winner.

## Independent veto

If Tesseract and RapidOCR both return valid digits, **and** they are **equal**, **and** that value **≠** stable PP → **REJECT**.

## Labelled corpus (local)

`scripts/a6_labelled_manifest.json` — **CORPUS_SIZE = 2**

| Sample | GT | V1.2 | V1.3 |
|--------|-----|------|------|
| Mohamed | 2608080 | 808090 | **2608080** |
| Marlon | 1893918 | 1893918 | **1893918** |

**GENERALIZATION_NOT_YET_PROVEN** — do not claim fleet-wide accuracy.

## Runtime (warm HTTP, Mohamed)

Full extract ~8–9 s first request (crop + cold PP worker); licence-number recognizer ~300–600 ms warm after worker up (3× PP + veto). See `scripts/v13_corpus_benchmark.py`.

## RAM / models

No new ONNX, no new worker process — reuse persistent `Ppocrv5WorkerClient`.

## Tests

- `tests/test_license_number_v1_3.py`
- `frozen/ocr_v1_1/tests/test_ppocrv5_field_sanitize.py`
- Benchmark: `scripts/v13_corpus_benchmark.py`

## Future labelled samples

Add rows to `a6_labelled_manifest.json` (paths under gitignored `output/`).

---

## FINAL LIVE VERIFICATION (D-OCR-V1.3V)

**Date:** 2026-10-05 (local)  
**Verdict:** `D_OCR_V1_3_FULLY_VERIFIED`

### Runtime source classification

| Layer | Changed? |
|-------|----------|
| `frozen/ocr_v1_1/release/*` artifacts | **No** (release tree not edited) |
| `frozen/ocr_v1_1` **runtime source** (`ppocrv5_worker.py`, `name_output.py`) | **Yes** — field-aware sanitize |
| `frozen/ocr_v1_2` baseline (`ocr_pipeline_v1_2.py`, release metadata) | **No** (preserved) |
| V1.3 service (`license_number_recognizer.py`, `ocr_pipeline.py`) | **Yes** |

Physical paths:

- `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/src/workers/ppocrv5_worker.py`
- `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/src/inference/name_output.py`

### Health (`127.0.0.1:8020`)

- `status`: **READY**
- `engine`: **OCR_ENGLISH_V1_3_TWO_FIELD**
- `ppocrv5_worker`: **READY**, persistent PID reused

### Real HTTP

| Sample | `license_number` | Expiry |
|--------|------------------|--------|
| Mohamed | **2608080** | `02-07-2020` |
| Marlon | **1893918** | `13/04/2023` |

V1.2 baseline (`TwoFieldOcrPipelineV12`): Mohamed **808090**, Marlon **1893918** — still runnable via `scripts/v13_corpus_benchmark.py`.

### Worker reuse

`NEW_WORKER_PER_REQUEST = false` (PID stable across health checks + Mohamed + Marlon HTTP).

### Name OCR backward compatibility

- Full OCR-11B dataset crops **not** on this machine (`ocr6` paths point to legacy `UAE_LICENSE_OCR_V1`); **8 skipped**.
- Verified subset: `test_ppocrv5_field_sanitize`, `test_name_sanitizer_unchanged`, live `name_en` worker read on reference name row crop + PID reuse (`NAME_SUBSET_OK`).

### Python regression

**18 passed**, 0 failed (V1.3 + geometry + sanitizer).

### Playwright (`driving-license-ocr.spec.ts`)

**4/4 passed** (~10 min): unreadable re-upload, EXPIRED corpus shows **2608080** + facts, Marlon EXPIRED/VALID paths.

### E2E expectations

`uae-driving-license-ocr-expectations.json`: **2608080** (not **808090**).

### Performance (warm licence number path, Mohamed trim)

~**1085 ms** average over 5 calls (~400 ms PP variants total + veto); within ~1.2 s target.

### Privacy

Real plates under `DOCUMENT-ENGINE/LICENSE/output/` — **gitignored**, not staged.

### Generalization

**CORPUS_SIZE = 2** — `GENERALIZATION_NOT_YET_PROVEN`.

### A7 clear-licence rejection (2026-10-05)

Third local sample (scoring GT `5128524` / `2028-01-30`): **full JPEG passes** V1.3 and Diamond **VALID**; **wide UI screenshot fails** Crop V1 aspect validation → backend **UNREADABLE**. See `D_OCR_A7_CLEAR_LICENSE_REJECTION_AUDIT.md`.
