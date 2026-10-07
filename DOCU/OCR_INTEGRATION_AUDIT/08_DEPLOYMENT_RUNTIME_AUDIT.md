# 08 — Deployment & runtime

## Diamond deployment target (from repo)

- **Documented dev:** Windows-friendly local PostgreSQL (`development-database-bootstrap.md`).
- **Production:** No Docker Compose or K8s manifests in `DOCU/` for Diamond app stack.
- **Conclusion:** **DEPLOYMENT_OS_COMPATIBILITY_AUDIT_REQUIRED** for production Linux/Docker.

Passport engine validated on Windows dev; UAE OCR uses `venv_ppocrv5\Scripts\python.exe` paths — **Windows-centric** in `ppocrv5_client.py`.

## Configuration (no hardcoded `C:\Users\Rw\` in Diamond)

Future env (conceptual):

| Variable | Purpose |
|----------|---------|
| `UAE_LICENSE_OCR_API_URL` | HTTP base (like `PASSPORT_NUMBER_API_URL`) |
| `UAE_LICENSE_OCR_API_TIMEOUT_MS` | Request timeout |
| `UAE_LICENSE_OCR_ORCHESTRATE` | Dev auto-start (optional) |
| Python service internal | `CROP_RELEASE_PATH`, `OCR_RUNTIME_PATH`, `TESSDATA_PREFIX`, venv paths |

External projects currently reference absolute paths in manifests (`ocr_corpus.json`) — **packaging blocker for other machines**, not for copying engines into `DOCUMENT-ENGINE/LICENSE`.

## Dev startup (today)

1. `npm run dev` (backend) — starts Passport API if configured.
2. `npm run dev` (frontend) — port 3100.
3. Licence OCR: **no auto-start**.

Future: extend orchestrator or second service on e.g. `127.0.0.1:8020`.

## Production

- Run **UAE Licence API** as separate internal service (container or systemd).
- Node **never** bundles Python; only HTTP client.
- **Do not** rely on `npm start` spawning OCR in production unless explicitly approved (Passport pattern: production `npm start` does **not** spawn Python).

## Licensing (AUDIT 36)

From `ocr_final_english_v1.json`:

- Tesseract: approved for pilot internal use.
- RapidOCR / PP-OCRv5 models: **LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION**.

Technical integration can proceed; **installer/redistribution** is a separate legal gate.

## OS portability

| Component | Windows | Linux |
|-----------|---------|-------|
| Tesseract | Dev validated | Needs tessdata path |
| RapidOCR ONNX | Bundled in release | Verify arch |
| PP-OCRv5 worker venv | `Scripts/python.exe` | Requires `bin/python` layout |

**DEPLOYMENT_OS_COMPATIBILITY_AUDIT_REQUIRED** before production Linux cutover.
