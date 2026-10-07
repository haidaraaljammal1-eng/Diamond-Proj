# D-OCR-A8 — Clear standard licence returns UNREADABLE (2490527)

**Audit only — no production changes.**  
**Engine:** `OCR_ENGLISH_V1_3_TWO_FIELD`  
**Scoring GT (local only, not in repo):** licence `2490527`, expiry `11-09-2021` → policy **EXPIRED** if both fields read.

**Local artifacts (gitignored):** `DOCUMENT-ENGINE/LICENSE/output/a8_rishad_sample/`

---

## Executive summary

| Layer | Result |
|-------|--------|
| Frame / geometry | **PASS** (693×429, aspect 1.615) |
| Row 1 crop | **CROP_CLEAN** |
| Licence number (V1.3) | **REJECT** — `LICENSE_NUMBER_PP_NO_DIGITS` |
| Expiry (row 7) | **ACCEPT** — `11-09-2021` |
| Engine `document_status` | **REJECT** (number field blocks) |
| Diamond | **UNREADABLE** / `unreadableReason: OCR` (not `BAD_FRAME`) |

**Primary root cause:** `NUMBER_RECOGNITION_FAILURE` — PP-OCRv5 returns **no digits** on all three V1.3 variants; stability never reaches veto. **RapidOCR reads `2490527` correctly** on the same 2× crop in local diagnostic, but V1.3 does not use Rapid as primary.

---

## Step 1 — Direct `:8020`

```
POST /extract-driving-license  (input.png, 693×429)
```

| Field | Value | Status | Confidence | Engine |
|-------|-------|--------|------------|--------|
| `license_number` | `null` | **REJECT** | — | `ppocrv5_en_stability` |
| `expiry_date` | `11-09-2021` | **ACCEPT** | ~0.869 | `date_policy` |
| `document_status` | **REJECT** | | | |

---

## Step 2 — Geometry

| Metric | Value |
|--------|-------|
| Dimensions | **693 × 429** |
| Aspect | **1.6154** (within 1.25–2.10) |
| Validation | `INPUT_VALID` / `INPUT_OK_FOR_CROP_AND_OCR` |
| Geometry gate | **GEOMETRY_OK** |
| Table bbox ratio (w/h of image) | **0.753 / 0.618** |
| Row 1 present | **yes** |
| Row 7 present | **yes** |

No `BAD_FRAME` / crop geometry rejection.

---

## Step 3 — Row 1 visual diagnostic

| Metric | Value |
|--------|-------|
| Row size | 522 × 37 |
| Trim value zone | x1=124, x2=436 (312×37) |
| Digit height (est.) | **17 px** |
| Sharpness (Laplacian) | ~2009 |
| Classification | **CROP_CLEAN** |

Full visible number **2490527** appears inside trim in `output/a8_rishad_sample/diag/row1_trim.png` (local). No obvious clip; faint table line above row; background watermark present but not blocking legibility.

---

## Step 4 — PP-OCRv5 variants (V1.3 pipeline)

| Variant | Sanitized digits | Confidence | Notes |
|---------|------------------|------------|--------|
| PP RAW 2× LANCZOS | **(empty)** | — | ~9.2s first read in diag |
| PP CLAHE 2× | **(empty)** | — | |
| PP OTSU 2× | **(empty)** | — | |

**Stable PP:** none  
**Stability:** **FAIL** → `LICENSE_NUMBER_PP_NO_DIGITS`

---

## Step 5 — Tesseract + Rapid (veto path inputs)

| Engine | Digits on 2× RAW crop |
|--------|------------------------|
| Tesseract | **(empty)** |
| RapidOCR | **2490527** |

**Independent veto fired:** **NO** (veto runs only after stable PP exists).

---

## Step 6 — Final number decision

| | |
|--|--|
| Expected | `2490527` |
| Candidate | **none** |
| Field status | **REJECT** |
| Reason | **`LICENSE_NUMBER_PP_NO_DIGITS`** |

---

## Step 7 — Row 7 crop

**CROP_CLEAN** — trim 303×33; hyphens visible in source; expected `11-09-2021` fits value zone.

---

## Step 8–9 — Expiry

| | |
|--|--|
| Raw | `11-09-2021` |
| Normalized | `11-09-2021` (policy accepts `DD-MM-YYYY`) |
| ISO for Diamond | `2021-09-11` when policy maps calendar fields |
| Status | **ACCEPT** |

Expiry is **not** the failure.

---

## Step 10 — Engine aggregation

```
license_number → REJECT
expiry_date    → ACCEPT
⇒ document_status = REJECT
```

Blocking field: **license_number**.

---

## Step 11 — Diamond backend (`b6f-live-smoke-once`)

| | |
|--|--|
| Engine `document_status` | **REJECT** |
| `licenseVerification.status` | **UNREADABLE** |
| `unreadableReason` | **OCR** (not `BAD_FRAME`) |
| `licenseNumber` / `expiryDate` on verification | **null** (two-field policy requires both) |
| Extraction | `FAILED`; expiry field OCR **ACCEPT** in nested extraction |

Mapping is correct: engine reject on number → Diamond unreadable, **not** EXPIRED.

---

## Step 12 — DB / extraction

Failed upload path stores **REJECT** engine status; verification **UNREADABLE** without publishing partial expiry to customer card (by design).

---

## Step 13 — Frontend

Renders backend **`UNREADABLE`** with OCR copy (`unreadableTitle` / `unreadableOcrBody`). Screenshot matches **OCR** path, not bad-frame card.

---

## Step 14 — Comparison vs known samples (`:8020`)

| Sample | Image | Aspect | Row1 digit h | `:8020` number | `:8020` expiry |
|--------|-------|--------|--------------|----------------|----------------|
| **A8 Rishad** | 693×429 | 1.615 | 17 | **REJECT** | ACCEPT `11-09-2021` |
| Mohamed | 506×305 | 1.659 | 10 | ACCEPT `2608080` | ACCEPT |
| Marlon | 701×438 | 1.601 | 17 | ACCEPT `1893918` | ACCEPT |
| Khader | 1024×626 | 1.636 | 26 | ACCEPT `5128524` | ACCEPT |

Marlon has **similar row height / digit scale** to A8 but PP succeeds; A8 failure is **not** explained by frame or aspect alone — **PP empty-read on this specific crop appearance** (contrast/watermark/scan softness).

---

## Step 15 — Local recovery experiment

On `row1_trim.png`:

- PP at **2× / 3× / 4×** (RAW/CLAHE/OTSU): subprocess diag showed `ENGINE_ERROR` / empty (worker batch context); **does not change production `:8020` result**.
- **RapidOCR 2×:** **`2490527`** (matches GT).

Upscaling alone does not fix PP in offline batch; **Rapid already recovers GT** when invoked on the production 2× materialization.

---

## Step 18 — Root cause classification

**`NUMBER_RECOGNITION_FAILURE`**  
(subtype: V1.3 PP primary path returns no digits; expiry and geometry are healthy)

Not: `BAD_FRAME`, `EXPIRY_*`, `DIAMOND_MAPPING`, `FRONTEND_ONLY`.

---

## Step 19 — One recommended next action

**Implement a narrowly scoped V1.3 licence-number fallback:** when PP stability fails with **`LICENSE_NUMBER_PP_NO_DIGITS`** (or all PP variants empty), allow **RapidOCR-only ACCEPT** only if:

1. Rapid digits pass existing `validate_field("license_number", …)`, and  
2. Tesseract is **empty or agrees** with Rapid (no independent veto pair disagreeing with Rapid).

Regression gate: Mohamed `2608080`, Marlon `1893918`, Khader `5128524`, plus this sample → **EXPIRED**; preserve veto when Tess+Rapid agree on a **wrong** number.

Alternative (heavier): debug PP-OCRv5 empty reads on 312×37 crops without changing Rapid role.

---

## Step 20 — Future tests

| Case | Expected |
|------|----------|
| A8 `2490527` / `11-09-2021` | **EXPIRED** (after number fix) |
| Mohamed | `2608080` |
| Marlon | `1893918` |
| Khader | `5128524` |
| UNREADABLE safety | partial engine reject unchanged |
| `:8020` + Diamond + Playwright | |

---

## Files that would change later (implementation phase)

- `DOCUMENT-ENGINE/LICENSE/services/uae_license_api/two_field/license_number_recognizer.py`
- Possibly `ocr_pipeline.py` / aggregation tests
- `tests/test_license_number_v1_3.py`
- Diamond integration only if API shape changes (unlikely)
- New gitignored local fixture reference in docs only

**Production changes in this audit:** **0**

**Verdict:** `D_OCR_A8_ROOT_CAUSE_FOUND`
