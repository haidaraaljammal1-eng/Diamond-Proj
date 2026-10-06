# Ground truth (human-verified only)

**No OCR.** Values are typed manually via the review workflow.

## Initialize / merge workspace

```text
cd C:\Users\Rw\UAE_LICENSE_OCR_V1
C:\Users\Rw\UAE_LICENSE_CROP_V2\venv\Scripts\python.exe -m scripts.init_ground_truth_workspace
```

Creates or updates (without overwriting verified fields):

- `ground_truth.json`
- `ground_truth_review.json` — asset paths (value crop, row crop, original)
- `ground_truth_missing.json`
- `ground_truth_summary.json`

## Interactive review

```text
C:\Users\Rw\UAE_LICENSE_CROP_V2\venv\Scripts\python.exe -m scripts.review_ground_truth --reviewer AB --test-id real12
```

Commands: `/empty`, `/unreadable`, `/uncertain`, `/skip`, `/quit`. No pre-filled suggestions.

## Development set (automated prep)

```text
cd C:\Users\Rw\UAE_LICENSE_OCR_V1
set PYTHONPATH=.
C:\Users\Rw\UAE_LICENSE_CROP_V2\venv\Scripts\python.exe -m scripts.orchestrate_development_review_prep
```

Creates `development_review_pack/`, `development_review_queue.json`, validation report.

**One command for full development transcription session:**

```text
C:\Users\Rw\UAE_LICENSE_CROP_V2\venv\Scripts\python.exe -m scripts.review_development_set --reviewer KJ
```

Autosaves `ground_truth.json` after every field. Excludes holdout `real4`, negative `real9`, hard `real13`.

## Offline contact sheets (full corpus)

```text
C:\Users\Rw\UAE_LICENSE_CROP_V2\venv\Scripts\python.exe -m scripts.generate_ground_truth_review_sheets
```

Output: `ground_truth/review_sheets/<test_id>_review_sheet.png`

## Field record shape

```json
{
  "value": "Abu Dhabi",
  "truth_status": "VERIFIED",
  "crop_sha256": "..."
}
```

Negative control (`real9`): use `truth_status: "EMPTY"` with `value: null` where there is no semantic content.
