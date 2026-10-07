# D-OCR-A6 — Licence Number Recovery Research (Low-Resolution Digits)

**Phase:** D-OCR-A6 (experiment / benchmark only)  
**Baseline tag:** `D_OCR_A5_LICENSE_NUMBER_IMPROVEMENT_DESIGN_READY`  
**Production:** unchanged (`two_field/ocr_pipeline.py`, Crop V1, policy, frontend)  
**Local runner:** `DOCUMENT-ENGINE/LICENSE/scripts/a6_license_number_recovery_benchmark.py`  
**Local output:** `DOCUMENT-ENGINE/LICENSE/output/a6_recovery/` (gitignored diagnostics)

## Objective

Determine whether the **existing lightweight local stack** can recover UAE licence numbers when digit height is ~11px (Mohamed ground truth **2608080**), without cloud OCR, heavy new models, Crop V1 changes, or hardcoded numbers.

**Safety order:** correct ACCEPT → safe REJECT/re-upload → never wrong ACCEPT.

## Labelled corpus

| ID | Image (local) | Ground truth |
|----|----------------|--------------|
| `mohamed_lowres` | `output/a5_mohamed_sample/input.png` | `2608080` |
| `marlon_regression` | `output/v1_2h_local_fixture/marlon_reference.png` | `1893918` |

**CORPUS_SIZE = 2** — no broad accuracy claims.

Manifest hook: `scripts/a6_labelled_manifest.json` (+ `a6_labelled_manifest.example.json`).

## Crop geometry (unchanged from A5)

- Row-1 value trim: 233×24 px, **median digit height ~11 px**, `CROP_CLEAN|LOW_RESOLUTION`.
- Tight ink bbox: generic connected-components; no digit-count or coordinate tuning.

## Original-image mapped crop vs reconstructed row (Step 7)

Deskew was **not** applied on either sample (`applied_rotation_deg = 0`).

Mapping used existing table bbox + first horizontal row band + `value_x_bounds()` (same as row trim).

| Metric | Crop A (row trim) | Crop B (original mapped) |
|--------|-------------------|---------------------------|
| Pixel diff | **identical** (max diff 0) | **identical** |
| Digit height | 11 px (Mohamed) | 11 px |
| Laplacian sharpness | 4898.2 | 4898.2 |

**Finding:** For these inputs, row reconstruction does **not** lose resolution versus mapping back to the upload. **Do not add original-image remap complexity** for V1.3 on this evidence.

## Upscaling benchmark (Step 5)

OpenCV **LANCZOS4** and **CUBIC** at 2× / 3× / 4× on the clean numeric trim (Mohamed):

| Scale | Median digit height (px) | PP-OCRv5 engine digits (LANCZOS, raw+pad) |
|-------|----------------------------|-------------------------------------------|
| 1× | 11 | (not run at 1× in engine batch) |
| 2× | **19** | **2608080** (conf ~0.86) |
| 3× | 29 | **2608080** (conf ~0.91) |
| 4× | 30 | **2608080** (conf ~0.93) |

**Bottleneck:** ~11px height is insufficient for Tesseract and for PP-OCRv5 at 1×; **2× upscale is the minimum scale where PP-OCRv5 engine recovery appears** on Mohamed.

CUBIC vs LANCZOS4: recognition outcomes matched on sampled UP2–UP4 raw paths; LANCZOS4 used for engine batch reporting.

## Preprocessing benchmark (Step 6)

On UP2–UP4, controlled set: raw grayscale, CLAHE, Otsu, adaptive, light unsharp.

- **Tesseract** (PSM 7/8/13, digits whitelist): still produces **808090** on Otsu+upscale paths (same failure mode as A5); other variants include garbage (`222008000`, `1`, etc.).
- **RapidOCR:** raw/upscale often **200** / **2000**; best oracle-free pick by confidence at **4× gray** → **2608080** (conf ~0.85) on Mohamed — **corpus n=1 observation**, not a production rule alone.
- **PP-OCRv5 engine (UP2+ LANCZOS, raw/CLAHE/Otsu):** stable **2608080** / **1893918** on both corpus images.

## PP-OCRv5 worker vs engine (Steps 3–4)

Mandatory worker runs completed. **Critical integration finding:**

- Worker applies `sanitize_name_ocr_output()`, which strips leading non-letters, so **digit-only licence reads become empty `raw_text`** while `confidence` stays high (~0.80–0.97).
- **Engine raw** (same ONNX, `venv_ppocrv5`) returns correct digit strings after safe separator removal.

Production cannot use the **current worker response** for licence numbers without a **field-aware sanitizer** (future V1.3 work). A6 used a diagnostic engine batch in `venv_ppocrv5` for scoring only.

## Tesseract specialized benchmark (Step 9)

Best exact match on Mohamed matrix: **no** variant equals `2608080`.  
Production-aligned winner remains **808090** (Otsu UP2, PSM 8), confidence **0.0**.

Marlon: Tesseract remains **1893918** across strong variants.

## Multi-engine agreement (Step 11)

Representative **UP2 LANCZOS Otsu** (Mohamed):

| Engine | Digits |
|--------|--------|
| Tesseract PSM8 | `1` / garbage (not 2608080) |
| RapidOCR | `2000` |
| PP-OCRv5 engine | **2608080** |
| Ground truth | **2608080** |

V1.2-style **Tesseract + Rapid** on comparable preprocess: **no exact agreement** (A5: **808090** vs **200**) → safe REJECT, blocks false accept.

## Candidate architectures (Step 12)

| Candidate | Mohamed | Marlon | Blocks `808090`? |
|-----------|---------|--------|------------------|
| A — best PP-OCRv5 UP2+ engine single | **2608080** | **1893918** | Yes |
| B — best Tesseract single | wrong | **1893918** | Mohamed: B alone still wrong |
| C — Tesseract + Rapid exact agree | REJECT (disagree) | **1893918** | Yes |
| C — PP + Tesseract exact agree | REJECT (disagree) | **1893918** | Yes |
| V1.2 production | **808090** | **1893918** | **No** (false accept) |

## Multi-preprocess consensus within PP-OCRv5 (Step 13)

UP2 LANCZOS: raw / CLAHE / Otsu engine reads **agree on `2608080`** (Mohamed) and **`1893918`** (Marlon).  
Worker path remains empty on all — correlated empty outputs, not independent evidence.

## Expiry control (Step 26)

Expiry OCR snapshots unchanged in A6 runs:

- Mohamed: `02-07-2020`, ACCEPT  
- Marlon: `13/04/2023`, ACCEPT  

## Gates

| Gate | Result |
|------|--------|
| **KNOWN_FAILURE_RECOVERED** | **YES** (PP-OCRv5 engine, UP2+ LANCZOS on existing trim) |
| **KNOWN_FALSE_ACCEPT_BLOCKED** | **YES** for Tess+Rapid consensus; **YES** for proposed PP UP2+ path (does not emit `808090`) |
| Marlon regression | **1893918** preserved |

## Verdict

**`D_OCR_A6_RECOVERY_SOLUTION_FOUND`** with **CORPUS_SIZE = 2** — recovery demonstrated only via **PP-OCRv5 on upscaled numeric crop** plus **worker sanitization fix** before production.  
Also: **`D_OCR_A6_MORE_LABELLED_SAMPLES_REQUIRED`** for pilot confidence.

## Remaining uncertainty

- Only two labelled plates; low-res failure modes may differ (glare, blur, partial crop).
- Rapid 4× gray hit `2608080` once by confidence ranking — needs more samples before treating Rapid as co-primary.
- Optimal minimum scale (2× vs 3×) and confidence threshold not statistically tuned (by design).
