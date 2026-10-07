# D-OCR-V1.2 — Two-field licence validation

## Release layout

| Path | Role |
|------|------|
| `frozen/ocr_v1_1/` | **Unchanged** immutable V1.1 baseline (engines + models) |
| `frozen/ocr_v1_2/config/two_field_label_zones.json` | Row-relative label trim ratios + geometry gate |
| `services/uae_license_api/two_field/` | Geometry gate, row trim, `TwoFieldOcrPipeline` |
| `services/uae_license_api/orchestrator.py` | Crop V1 → gate → row trim → OCR (2 fields only) |

## Product

- OCR verifies **license number** (digits only) and **expiry date** (complete date, future).
- All other licence fields are **manual**; no OCR prefill.
- `DrivingLicenseVerification` no longer uses confidence-based `REVIEW_REQUIRED`.

## Restart

Licence HTTP service (`:8020`) after any engine/service change.
