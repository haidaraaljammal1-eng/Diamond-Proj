# D-OCR-A6 — Recommended Licence Number Pipeline (Design Only)

**Status:** Research complete — **no production implementation in A6.**

## Chosen rule (Step 22) — ONE algorithm

**OPTION 1 variant (evidence-led):**  
**Primary read:** PP-OCRv5 on **2× LANCZOS4** grayscale numeric trim (existing Crop V1 row value zone, white pad).  
**Field handling:** Digit-safe post-processing for `license_number` in the PP worker (stop using name sanitizer for this field).  
**Safety backstop:** If Tesseract and RapidOCR on the **same upscaled crop** both yield non-empty digits and **agree with each other exactly** but **disagree with PP** → **REJECT** (re-upload). (Mohamed: `808090` vs `200` → no mutual Rapid+Tess agreement → PP primary stands.)  
**If PP yields empty / REJECT validation / below minimum confidence after sanitizer fix** → **REJECT** (do not fall back to Tesseract alone on low-res).

Rationale on **n=2**:

- Tess+Rapid consensus (**OPTION 3**) blocks `808090` but **does not recover** `2608080`.
- PP UP2+ recovers both corpus samples; Tesseract remains useful only as a **disagreement veto**, not as primary on ~11px crops.
- Fuzzy or majority voting across >2 mismatched strings rejected (Step 12).

Not chosen:

- **OPTION 3 alone** — safe but no recovery.
- **OPTION 4 (3-engine majority)** — Mohamed engines disagree; majority is unstable.
- **OPTION 5 alone** — unnecessary if PP path is validated on more samples.

## False-accept gate (Step 23)

**KNOWN_FALSE_ACCEPT_BLOCKED = true** for the recommended rule:

- Mohamed: PP UP2+ → `2608080`, not `808090`.
- Veto: Tess `808090` and Rapid `200` **do not agree** → no veto → ACCEPT PP `2608080`.

Marlon: PP, Tess, Rapid align on **1893918** → ACCEPT.

## Recovery gate (Step 14)

**KNOWN_FAILURE_RECOVERED = YES** (research path: PP-OCRv5 engine, UP2 LANCZOS, existing trim).

Production recovery contingent on worker sanitizer + integration tests.

## Version (Step 28)

Recommend **`OCR_ENGLISH_V1_3_TWO_FIELD`** (not a silent V1.2 patch):

- New licence-number recognition path (PP + upscale + veto).
- Worker behavior change for `field_name=license_number`.
- Explicit regression tests and DOCU update.

## Future implementation files (Step 27)

| File | Change |
|------|--------|
| `DOCUMENT-ENGINE/LICENSE/services/uae_license_api/two_field/license_number_recognizer.py` | **New** — UP2 materialization, PP read, Tess/Rapid veto, ACCEPT/REJECT |
| `DOCUMENT-ENGINE/LICENSE/services/uae_license_api/two_field/ocr_pipeline.py` | Wire `license_number` to recognizer; leave expiry unchanged |
| `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/src/workers/ppocrv5_worker.py` | Digit-safe raw handling when `field_name == "license_number"` |
| `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/src/inference/name_output.py` | Optional: `sanitize_license_ocr_output()` or branch in worker |
| `DOCUMENT-ENGINE/LICENSE/scripts/a6_license_number_recovery_benchmark.py` | Keep as regression harness |
| `DOCU/OCR_INTEGRATION/*` | V1.3 integration note after implementation |

**Do not change** Crop V1 geometry, Diamond policy, frontend, Prisma, passport.

### ACCEPT / REJECT sketch

```
crop = row_value_trim(license_number)  # existing
img = pad(gray(upscale_lanczos(crop, 2)))
pp = ppocrv5_worker.recognize(img, field_name=license_number)
pp_digits = safe_digits_only(pp.raw)  # after worker fix

if not valid_license_number(pp_digits): REJECT
if pp.confidence < T_min (calibrate later): REJECT

tess = best_tesseract_digits(img)  # existing policy helpers
rapid = rapid_digits(img)

if tess and rapid and tess == rapid and tess != pp_digits:
    REJECT

ACCEPT pp_digits
```

## Required implementation tests (Step 29)

| Test | Expectation |
|------|-------------|
| Mohamed low-res fixture | `2608080` |
| Marlon fixture | `1893918` |
| All manifest-labelled samples | exact match |
| Engine disagreement (Mohamed UP2 Otsu) | REJECT if veto enabled without PP primary |
| False accept | never `808090` on Mohamed |
| Expiry | unchanged dates/status |
| Service | real `:8020` smoke |
| Diamond policy | unchanged |
| Playwright | VALID/EXPIRED flows; update e2e expected number to **2608080** when recognition fixed |

## Original-resolution crop (Step 21)

**No** — A/B pixels identical when deskew is off. Keep Crop V1 trim; only add **numeric upscale** before OCR.

## Tight ink bbox (Step 8)

Mohamed: bbox already full width; no gain. Optional lightweight margin trim in recognizer if generic CC bbox shrinks input — retest on corpus.

## Re-run benchmark

```powershell
$env:LICENSE_ENGINE_ROOT="C:\Users\Rw\Documents\DIAMOND-SYSTEM\DOCUMENT-ENGINE\LICENSE"
& "DOCUMENT-ENGINE\LICENSE\.venv\Scripts\python.exe" `
  "DOCUMENT-ENGINE\LICENSE\scripts\a6_license_number_recovery_benchmark.py"
```

Add samples via `scripts/a6_labelled_manifest.json`.
