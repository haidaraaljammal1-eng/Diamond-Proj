# D-OCR-A7 — Local diagnostics reference

Artifacts (gitignored): `DOCUMENT-ENGINE/LICENSE/output/a7_khader_sample/`

| Path | Purpose |
|------|---------|
| `input.jpg` | Attached licence photo |
| `ui_screenshot.png` | Diamond UI capture (wide aspect) |
| `a7_audit_report.json` | Machine summary |
| `original_photo/crop/` | Crop V1 pipeline_report, row crops |
| `original_photo/row1_trim.png`, `row7_trim.png` | Value trims |
| `original_photo/pp_*.png` | PP variant crops |

Regenerate:

```powershell
$env:LICENSE_ENGINE_ROOT="C:\Users\Rw\Documents\DIAMOND-SYSTEM\DOCUMENT-ENGINE\LICENSE"
& "DOCUMENT-ENGINE\LICENSE\.venv\Scripts\python.exe" `
  "DOCUMENT-ENGINE\LICENSE\scripts\a7_clear_license_rejection_audit.py"
```

Diamond live smoke (local only, set image path via env):

```powershell
$env:UAE_DRIVING_LICENSE_API_URL="http://127.0.0.1:8020"
$env:B6F_LOCAL_LICENSE_IMAGE="...\output\a7_khader_sample\input.jpg"
cd APP\backend
npx tsx scripts/b6f-live-smoke-once.ts
```
