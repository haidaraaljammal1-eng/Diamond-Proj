# Driving licence Playwright fixture (B6F)

| File | Purpose |
|------|---------|
| `uae-driving-license-ocr-test.png` | Committed E2E image — fictional **John Wick** internal OCR corpus sample (not a Diamond customer). |
| `uae-driving-license-ocr-expectations.json` | Machine OCR expectations from `:8020` (authoritative for B7). |

Regenerate expectations after engine changes:

```bash
curl -s -X POST http://127.0.0.1:8020/extract-driving-license \
  -F "image=@APP/frontend/e2e/fixtures/driving-license/uae-driving-license-ocr-test.png"
```

Do **not** commit real customer licence photos.
