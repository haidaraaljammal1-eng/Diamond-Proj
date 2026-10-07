# OCR English V1.1 Runtime

- PP-OCRv5: persistent JSON-lines worker (`venv_ppocrv5`)
- Main venv: Tesseract + RapidOCR v4 unchanged
- Date: short-circuit when `validate_date_text(primary)==ACCEPT`
- Rollback: `runtime.ppocrv5_worker.enabled=false` in config (requires legacy CLI path if re-added)
