# D-OCR-A6 — Engine Comparison Matrix

Local artefacts: `output/a6_recovery/<sample_id>/a6_matrix_a.json`, `a6_report.json`, `a6_summary.json`.

## Summary table (both samples, V1.2 baseline)

| Sample | Ground truth | V1.2 Tesseract policy | Rapid (A5-aligned UP2 Otsu) | PP-OCRv5 1× worker | PP-OCRv5 2× engine |
|--------|--------------|-------------------------|-----------------------------|--------------------|--------------------|
| Mohamed | `2608080` | **808090** (wrong ACCEPT) | `200` (A5) / `2000` (A6 UP2 Otsu) | empty raw, conf ~0.80 | **2608080**, conf ~0.86 |
| Marlon | `1893918` | **1893918** | **1893918** | empty raw, conf ~0.97 | **1893918**, conf ~0.91 |

## PP-OCRv5 by scale (LANCZOS4, raw + white pad) — Mohamed

| Scale | Digit height | Worker `raw_text` | Worker digits | Engine raw | Engine digits | Engine conf |
|-------|--------------|-------------------|---------------|------------|---------------|-------------|
| 1× | 11 | `""` | `""` | — | — | — |
| 2× | 19 | `""` | `""` | `2608080` | `2608080` | 0.877 |
| 3× | 29 | `""` | `""` | `2608080` | `2608080` | 0.913 |
| 4× | 30 | `""` | `""` | `2608080` | `2608080` | 0.926 |

Marlon: same pattern at 2×–4× engine → **1893918**; 1× engine not batched.

## Best single-engine outputs (Mohamed)

| Engine | Best variant (oracle-free where noted) | Digits | Confidence | Exact GT |
|--------|----------------------------------------|--------|------------|----------|
| Tesseract | Otsu UP2 PSM 8 (production family) | **808090** | 0.0 | No |
| RapidOCR | Highest conf in matrix (UP4 gray) | **2608080** | ~0.85 | Yes* |
| PP-OCRv5 engine | UP2 LANCZOS raw | **2608080** | ~0.86 | Yes |

\*Single-sample peak; not stable across preprocess variants.

## Best single-engine outputs (Marlon)

| Engine | Digits | Exact GT |
|--------|--------|----------|
| Tesseract | **1893918** | Yes |
| RapidOCR | **1893918** | Yes |
| PP-OCRv5 engine UP2+ | **1893918** | Yes |

## Agreement rules tested

| Rule | Mohamed | Marlon |
|------|---------|--------|
| Tesseract + Rapid exact | REJECT | ACCEPT (`1893918`) |
| PP + Tesseract exact | REJECT | ACCEPT |
| 3-engine majority (diagnostic script)** | mixed | ACCEPT |

\*\*Script’s “best Rapid” row used ground truth for ranking in one helper — **do not use for production metrics**. Oracle-free Rapid best on Mohamed is **not** consistently `2608080`.

## Confidence analysis (Step 18)

| Observation | Implication |
|-------------|-------------|
| Tesseract conf **0.0** on wrong **808090** | Confidence useless for acceptance |
| PP worker high conf with **empty** raw | Confidence misleading until sanitizer fixed |
| PP engine conf **0.86–0.93** when correct on UP2+ | May support minimum threshold **after** sanitizer fix |
| Rapid conf **0.57** on wrong `2000` vs **0.85** on UP4 `2608080` | Threshold alone unsafe on n=2 |

**Recommendation:** Prefer **exact digits + validation** over raw confidence; use confidence only as a secondary gate once calibrated on a larger corpus.

## Runtime (warm, Mohamed, UP4 LANCZOS Otsu representative)

| Step | ms (approx) |
|------|-------------|
| Tesseract PSM8 | 404 |
| RapidOCR | 73 |
| PP-OCRv5 worker call | 93 |
| Sequential sum | ~570 |

PP-OCRv5 worker already resident: **no new model**, **no new worker process** for licence (reuse English worker).

Cold start (worker ping): ~5 ms in this run (worker already warm from prior sample).

## Memory / model impact (Step 20)

- **NO NEW MODEL** — `en_PP-OCRv5_rec_mobile.onnx` already loaded for names.
- **NO NEW WORKER** — same `Ppocrv5WorkerClient` subprocess.
- Incremental cost: one extra `recognize` per licence attempt (+ optional UP2 image materialization CPU/RAM negligible).

## Baseline vs candidate exact-match (corpus n=2)

| Metric | V1.2 baseline | Candidate A (PP UP2+ engine) | Candidate C (Tess+Rapid agree) |
|--------|---------------|------------------------------|--------------------------------|
| Exact match | **1/2 (50%)** | **2/2** | **1/2** |
| False accept on Mohamed | Yes (`808090`) | No | No |
| Recovery on Mohamed | No | Yes | No |

## Reject / false-accept rates (n=2, illustrative)

| Pipeline | Accept count | Correct accepts | Wrong accepts |
|----------|--------------|-----------------|---------------|
| V1.2 | 2 | 1 | 1 (`808090`) |
| Tess+Rapid consensus | 1 | 1 | 0 |
| PP UP2+ (proposed) | 2 | 2* | 0 |

\*Subject to worker fix + future corpus validation.
