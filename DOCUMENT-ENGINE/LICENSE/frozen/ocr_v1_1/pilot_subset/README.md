# UAE Licence OCR Pilot Subset

This pilot subset contains exactly 4 user-supplied UAE driving-licence images and 32 field slots.

Files:
- `pilot_subset_manifest.json` — exact images included in the pilot.
- `ground_truth_subset.json` — field-level transcriptions and truth status.
- `ground_truth_subset.csv` — flat table for benchmarking.
- `images/` — renamed copies of the 4 supplied images.

Important:
- The values were visually transcribed from the supplied images by the assistant.
- They are appropriate for a pilot OCR comparison, but they are **not human-verified ground truth**.
- `pilot_04/license_number` is marked `UNREADABLE` because the number is visibly obscured/redacted.
- No OCR engine was used to create these labels.
