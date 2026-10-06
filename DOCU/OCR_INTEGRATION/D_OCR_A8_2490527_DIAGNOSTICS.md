# D-OCR-A8 — Local diagnostics (2490527)

Gitignored outputs only. No PII in this file.

## Machine report

Path: `DOCUMENT-ENGINE/LICENSE/output/a8_rishad_sample/a8_audit_report.json`

Runner: reused `scripts/a7_clear_license_rejection_audit.audit_image` (diagnostic import, not committed).

## Scale experiment

Path: `DOCUMENT-ENGINE/LICENSE/output/a8_rishad_sample/scale_experiment.json`

Summary:

- PP 2×/3×/4× variants: empty / `ENGINE_ERROR` in offline worker batch.
- Rapid 2× on production-style crop: **`2490527`**.

## Crop artifacts

Under `output/a8_rishad_sample/diag/`:

- `row1_full.png`, `row1_trim.png`, `row7_trim.png`
- `pp_PP_*.png` (variant materializations)

Do not commit.
