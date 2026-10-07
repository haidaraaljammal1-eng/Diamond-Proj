# Crop V1 → OCR output contract

## Required artifacts per job

- `pipeline_report.json` — geometry and field statuses
- `ocr_handoff.json` — per-field OCR eligibility (machine-readable)
- `run_metadata.json` — `run_id`, `input_sha256`, timestamps, `pipeline_status`

## Never trust PNGs alone

Consumers must read `ocr_handoff.json` and `pipeline_report.json`.

Use `src.ocr_handoff.is_field_ocr_eligible(field_dict)`:

- `crop_geometry_status == VALUE_OK`
- `content_sanity_status != CONTENT_EMPTY_OR_UNRELIABLE`
- `ocr_eligible == true` in handoff (derived from the above)

## Stale output

Each run calls `clean_job_output()` first so failed jobs cannot leave prior `value_crops/`.

## Templates

Inference loads pinned templates only (`require_templates`). Rebuild explicitly:

`python -m src.build_label_templates --force`
