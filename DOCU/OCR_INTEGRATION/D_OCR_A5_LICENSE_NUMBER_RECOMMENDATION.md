# D-OCR-A5 — Licence number improvement recommendation

**Verdict:** `D_OCR_A5_LICENSE_NUMBER_IMPROVEMENT_DESIGN_READY`  
(With **limited labelled corpus** — see `D_OCR_A5_MORE_SAMPLES_REQUIRED` for pilot PNGs and human-verified GT.)

## Recommended production algorithm (next phase only)

**Name:** `LICENSE_NUMBER_DUAL_READ_CONSENSUS_V1` (patch to V1.2, not expiry).

```
row 1 value trim (unchanged)
→ P7_OTSU_UP2_PAD (shared preprocess cache)
→ Tesseract: existing recognize_license() multi-PSM candidates → best tess_digits
→ RapidOCR english (already in TwoFieldOcrPipeline): rapid_digits
→ IF tess_digits == rapid_digits AND both match ^[0-9]+$ AND len >= 4:
      ACCEPT tess_digits
  ELSE:
      REJECT (field UNREADABLE → document REJECT / re-upload)
→ expiry_date path UNCHANGED
```

### Evidence

| Case | Tess | Rapid | Outcome |
|------|------|-------|---------|
| Mohamed (2608080 GT) | 808090 | 200 | **REJECT** — prevents false accept |
| Marlon (1893918 GT) | 1893918 | 1893918 | **ACCEPT** |

No tested single-Tesseract variant recovered **2608080**; improvement is **safety + re-upload**, not magic recovery on this scan without new preprocess (e.g. UP4) or new samples.

### Optional phase-2 (only if dual-read REJECT rate too high on corpus)

1. Add **`P4_UP3` or new `UP4_OTSU`** variant **only** for licence number.  
2. Require **≥2 Tesseract candidates** agree **and** Rapid agrees.  
3. Never accept on **0.0 confidence** alone.

Do **not** add `_TYPICAL_LEN=7` hard reject; use agreement only.

## Versioning (Audit 25)

**Recommend:** `OCR_ENGLISH_V1_2_TWO_FIELD` **recognition-quality patch** (config flag + `ocr_pipeline.py` / small helper).  
Not a full **V1.3** unless UP4 + new consensus module grows beyond ~1–2 files.

## Files to touch (implementation phase)

| File | Change |
|------|--------|
| `services/uae_license_api/two_field/ocr_pipeline.py` | Dual-read gate after `recognize_license` |
| `services/uae_license_api/two_field/license_number_consensus.py` (new) | Pure agreement logic |
| `frozen/ocr_v1_2/config/two_field_label_zones.json` | Optional: document consensus flag |
| Tests | `tests/test_two_field_v1_2.py` + new consensus unit tests |

**Do not modify:** `frozen/ocr_v1_1` algorithms, Crop V1, expiry pipeline, Prisma, frontend.

## RAM / 8 GB

Uses **already-loaded** Tesseract + RapidOCR v4; no new models.

## Implementation acceptance tests (Audit 26)

- A. Mohamed local sample: must **not** ACCEPT `808090` (REJECT or future correct read).  
- B. Marlon: **1893918** ACCEPT.  
- C. E2E expired corpus: REJECT or correct — **not** wrong ACCEPT.  
- D. Pilot subset when images restored.  
- E–G. Low-res / skew / label bleed — REJECT preferred over wrong digits.  
- H. Forced disagreement → REJECT.  
- I. Expiry regression unchanged.  
- J. `:8020` integration.  
- K. Diamond VERIFIED/EXPIRED/UNREADABLE.  
- L. Playwright VALID/EXPIRED.

## Remaining uncertainty

- **2608080** not recovered by any tested Tesseract matrix; may need **higher upscale** or **better source photo** even with dual-read.  
- Pilot images absent from repo — **D_OCR_A5_MORE_SAMPLES_REQUIRED** for statistically strong accuracy claims.  
- PP-OCRv5 not benchmarked on this field (V1.2 intentionally Tess+Rapid/date_policy).

## OCR caused UI/policy changes?

**NO** (this phase).
