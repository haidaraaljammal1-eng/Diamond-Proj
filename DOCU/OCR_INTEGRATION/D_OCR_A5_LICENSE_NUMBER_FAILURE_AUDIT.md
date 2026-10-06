# D-OCR-A5 — Licence number failure audit (2608080 → 808090)

**Phase:** audit / experimentation only — no production changes.  
**Engine:** `OCR_ENGLISH_V1_2_TWO_FIELD` (unchanged).  
**Sample:** local diagnostic copy under `DOCUMENT-ENGINE/LICENSE/output/a5_mohamed_sample/` (gitignored, real PII).

## A. Reproduction (Audit 1)

| Item | Value |
|------|--------|
| Ground truth (scoring only) | **2608080** |
| Production HTTP / orchestrator | **808090** (`ACCEPT`) |
| `license-expired` UI (Diamond) | Shows **808090** (policy EXPIRED correct; number wrong) |
| Expiry control | Correct (`02/07/2020` / `2020-07-02`) — out of scope |

Deterministic: repeated runs yield **808090** (`a5_report.json`, `output/a5_mohamed_sample/`).

## B. Geometry & row 1 crop (Audits 2–3)

| Metric | Value |
|--------|--------|
| Image | 506×305 px |
| Geometry | `GEOMETRY_OK` |
| Row 1 trim bounds | x1=93, x2=326, row width=390, **row height=24 px** |
| Crop classification | `CROP_CLEAN` + **`LOW_RESOLUTION`** |
| Median char height (trim) | **~11 px** (2 large CC blobs, not 7) |
| Median char height (after P7 UP2) | **~22 px** |
| Visual | Full digit string appears in photo; trim crop is **very short vertically**; guilloche + table line through row; digits thin |

**Not primary:** `CROP_CLIPPED` / `LABEL_BLEED` on horizontal bounds (value band ~60% of row width). Failure is **segmentation + low scale + merged/partial ink**, not missing right side only.

## C. Current V1.2 licence-number OCR (Audit 4)

Path: `TwoFieldOcrPipeline._recognize_license_number` → `recognize_license()` (`frozen/ocr_v1_1/src/inference/license_policy.py`).

| Setting | Value |
|---------|--------|
| Engine | Tesseract `eng.traineddata` |
| Whitelist | `0123456789` |
| Candidates | P0_RAW PSM7; then P7_OTSU_UP2_PAD PSM 8/7/13/6; P1/P2 pads; P4 UP3; P5 CLAHE |
| Winner on sample | **`selected_otsu_psm8`** → `808090` |
| Confidence | **0.0** (still `ACCEPT` via digits validator) |
| Retry trigger | conf &lt; 0.35 or non-ACCEPT primary |

## D. Digits-only validator limitation (Audit 5)

`^[0-9]+$` accepts **808090** and **2608080** equally. Syntax cannot detect substitution/deletion. **High “confidence” is unreliable** (0.0 on winning reads).

## E. Why 808090 (root cause summary)

1. **Very low row height (24 px)** → ~11 px glyph height before upscale.  
2. Tesseract **PSM 8/13** on Otsu×2 reads a **stable wrong 6-digit string**; leading **“26”** not recovered in any tested variant.  
3. Scoring favours **length 6 vs typical 7** slightly but is not the main driver; multiple independent paths agree on the **same wrong** string.  
4. **No cross-check**: RapidOCR on the same preprocessed crop returns **`200`** (disagreement ignored).  
5. **False accept**: wrong number is worse than REUPLOAD (Audit 20).

**Layer:** `OCR_PREPROCESSING + TESSERACT_SEGMENTATION` on an otherwise acceptable crop — **not** Crop V1 geometry gate, **not** Diamond policy/UI.

## F. Experiments (summary)

Full matrix: `output/a5_mohamed_sample/a5_report.json`.

| Experiment | Result on 2608080 |
|------------|-------------------|
| Preprocess matrix (trim) | **No exact match**; best wrong `808090` (Otsu PSM 8/13) |
| Tight ink bbox | Same wrong reads |
| Horizontal line removal | **Worse** (empty / fragments) |
| PSM 6/7/8/13 (Otsu UP2) | Only 8/13 → `808090` |
| RapidOCR (Otsu UP2) | **`200`** |
| PP-OCRv5 | Not used in V1.2 licence path (diagnostic skipped) |
| Tesseract-only consensus | **2× agree on `808090`** → would false-accept |

## G. Digit length corpus (Audit 15)

Pilot `ground_truth_subset.json` (5 docs): readable numbers **2490527**, **1893918**, **4718880** — all **7 digits**; 2 marked UNREADABLE. Observed range in that pack: **7** (do not hardcode in production).

## H. Available labelled runtime corpus (Audit 16–17)

| ID | Image in repo | Expected | V1.2 production |
|----|---------------|----------|-----------------|
| marlon_v12h | yes (local) | 1893918 | **1893918** ✓ |
| e2e_expired_corpus | yes | **2608080** (true; E2E JSON still says 808090 from old wrong read) | **808090** ✗ |
| pilot_01–05 | **images not in repo** | JSON only | n/a |

**Baseline exact-match (images available, true GT):** **1 / 2 = 50%** (Marlon pass; Mohamed fail).

Pilot PNGs are not present under `DOCUMENT-ENGINE/LICENSE/`; broader accuracy needs restored pilot inputs or more local labelled scans.

## I. UI / policy

**No OCR/Crop/policy/Prisma/frontend changes in this phase.** Expired card display bug was fixed separately; this audit is **recognition quality** only.
