# D-OCR-A5 — Licence number benchmark matrix

Local artifacts: `DOCUMENT-ENGINE/LICENSE/output/a5_mohamed_sample/` (gitignored).  
Runner: `scripts/a5_license_number_benchmark.py` (audit-only).

## Mohamed sample (GT 2608080)

### Production path

| Step | Output |
|------|--------|
| Row trim OCR | `808090`, P7_OTSU_UP2_PAD, PSM 8, conf 0.0, ACCEPT |
| Orchestrator field | `808090` ACCEPT |

### Preprocess × PSM (trim crop)

| Variant | Digits | Match GT |
|---------|--------|----------|
| P0_RAW PSM7 | — | no |
| P7_OTSU_UP2 PSM7/6 | — | no |
| P7_OTSU_UP2 PSM8/13 | **808090** | no |
| P4_UP3_GRAY PSM7 | — | no |
| P5_CLAHE PSM6 | — | no |
| P2_GRAY_PAD PSM8 | 2000 | no |

### Line-removed crop

Mostly empty; UP3 PSM7 → `503080` (still wrong).

### RapidOCR (Otsu UP2)

| raw | digits | conf | ms |
|-----|--------|------|-----|
| (partial) | **200** | 0.58 | ~231 |

### Cross-engine check (diagnostic)

| Engine | Mohamed | Marlon (control) |
|--------|---------|----------------|
| Tesseract (production) | 808090 | 1893918 |
| RapidOCR (same UP2 crop) | 200 | **1893918** |

## Corpus baseline (V1.2 production, row trim)

| Sample | Expected | Got | Exact |
|--------|----------|-----|-------|
| marlon_v12h | 1893918 | 1893918 | yes |
| e2e_expired_corpus (= Mohamed) | 2608080 | 808090 | no |

**Accuracy (2-image labelled set): 50%.**

## Candidate strategy bench: Tesseract + RapidOCR agreement

**Rule (experimental):** ACCEPT digits only if Tesseract winning string **equals** RapidOCR digits-only string **and** both non-empty.

| Sample | Tess | Rapid | Rule outcome |
|--------|------|-------|----------------|
| Marlon | 1893918 | 1893918 | **ACCEPT** (correct) |
| Mohamed | 808090 | 200 | **REJECT** (blocks false accept) |

Runtime: +~200–400 ms for one Rapid pass on existing UP2 crop (engine already loaded).

## False-accept comparison

| Strategy | Mohamed | Marlon |
|----------|---------|--------|
| Current V1.2 | **incorrect ACCEPT** 808090 | correct ACCEPT |
| Tess+Rapid agree | **REJECT** | correct ACCEPT |
| Tess-only consensus | incorrect ACCEPT | correct ACCEPT |

## Runtime (Mohamed sample)

| Stage | ms (approx) |
|-------|-------------|
| Current row-1 OCR | ~5200–8400 (cold), ~500–1000 warm per variant |
| Full multi-candidate tess | ~6–8 s first call |
| + RapidOCR | +~230 |

Whole-document impact: one extra Rapid read on licence row only; expiry path unchanged.
