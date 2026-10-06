# D-OCR-V1.3.1 — RapidOCR fallback on `LICENSE_NUMBER_PP_NO_DIGITS`

**Release:** `OCR_ENGLISH_V1_3_1_TWO_FIELD`  
**Supersedes:** `OCR_ENGLISH_V1_3_TWO_FIELD` (frozen under `frozen/ocr_v1_3/`)

## Trigger (narrow)

Rapid fallback runs when:

1. `LICENSE_NUMBER_PP_NO_DIGITS` — all three PP variants yield no native `^[0-9]+$` text, **or**
2. `LICENSE_NUMBER_PP_UNSTABLE` with **at most one** distinct **substantial** PP digit string (length ≥ 4; single-digit OTSU noise ignored), **or** multiple substantial reads that differ only by a **suffix skew** (e.g. `62490527` vs `2490527`).

PP variant digits use **native digits-only** (no `extract_license_digits` / no O→0).

**Does not run** for:

- `LICENSE_NUMBER_PP_UNSTABLE` with **two or more** substantial PP strings that are **not** suffix-related (true digit conflict)
- Stable PP candidate (normal V1.3 veto path)
- PP validation failures with digit output

## Rapid stability

Three variants on the same row-1 crop (2× LANCZOS materialization):

| ID | Preprocess |
|----|------------|
| RAPID_RAW | raw grayscale |
| RAPID_CLAHE | CLAHE |
| RAPID_OTSU | Otsu |

**Rule:** at least **two** variants must output the **same** native `^[0-9]+$` string (no O→0). No confidence tie-break.

If Rapid quorum fails but **PP_RAW** and **RAPID_RAW** both output the same native digits, that pair may **ACCEPT** (fallback-only corroboration; not used on the stable-PP path).

## Tesseract contradiction

After stable Rapid candidate:

| Tesseract | Outcome |
|-----------|---------|
| empty / unreadable | Rapid may **ACCEPT** (if validator passes) |
| same digits as Rapid | **ACCEPT** |
| different valid digits | **REJECT** (`LICENSE_NUMBER_RAPID_TESS_CONFLICT`) |

## PP primary path

Unchanged: stable PP → Tess+Rapid independent veto → ACCEPT/REJECT.

## Diagnostics (engine metadata)

On Rapid accept: `primaryEngine=PP-OCRv5`, `primaryResult=NO_DIGITS`, `fallbackEngine=RapidOCR`, `fallbackConsensus=true`, `selectedValue`, `accept_path=rapid_fallback`.

## A8 recovery

Local sample `2490527` / expiry `11-09-2021`: PP empty → Rapid consensus `2490527` → engine **ACCEPT** → Diamond **EXPIRED**.

## Regressions (local labelled corpus)

| Sample | Expected number |
|--------|-----------------|
| Mohamed | 2608080 |
| Marlon | 1893918 |
| Khader | 5128524 |
| Rishad (A8) | 2490527 |

Manifest: `DOCUMENT-ENGINE/LICENSE/scripts/a6_labelled_manifest.json` (images gitignored).

## Runtime

Rapid triple-read runs **only** on `PP_NO_DIGITS` path; successful PP licences incur no extra Rapid cost.

## Limitation

**GENERALIZATION_NOT_YET_PROVEN** — evidence limited to labelled local corpus only.

## FINAL LIVE VERIFICATION (D-OCR-V1.3.1V)

Verification-only closure: real `:8020`, Diamond upload (B6F smoke), backend integration (five licence suites), frontend unit **752**, Playwright `driving-license-ocr.spec.ts` (including local A8 via `PLAYWRIGHT_A8_LICENSE_FIXTURE` or default gitignored path).

Stale integration expectations for `holderNameEn = "TEST DRIVER"` were updated to **`null`** (two-field persistence; name is manual).

A8 live path on this machine: PP **unstable** (suffix skew) → Rapid fallback → **`accept_path=rapid_pp_raw_corroboration`** when Rapid 2-of-3 quorum fails but PP_RAW matches RAPID_RAW (`2490527`).

**Verdict (2026-10-06):** `D_OCR_V1_3_1_FULLY_VERIFIED` — `:8020` A8 ACCEPT, B6F Diamond EXPIRED, backend integration **17/17**, Python **33 passed** (+8 expected skips in `test_ocr11b_runtime`), frontend **752/752**, Playwright **6/6**, corpus **4/4**, PP worker PID stable across health polls.
