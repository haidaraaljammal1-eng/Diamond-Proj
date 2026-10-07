# DIAMOND — UAE Driving Licence Document Engine

Isolated from `DOCUMENT-ENGINE/PASSPORT/` (separate Python env, HTTP port, jobs, models).

## Layout

| Path | Role |
|------|------|
| `frozen/crop_v1/` | Vendored **DYNAMIC_CROP_V1** |
| `frozen/ocr_v1_1/` | Vendored **OCR_ENGLISH_V1_1_RUNTIME** |
| `services/uae_license_api/` | FastAPI HTTP service |
| `.venv/` | Main OCR + Crop + API |
| `.venv_ppocrv5/` | PP-OCRv5 persistent worker only |
| `jobs/<uuid>/` | Per-request artifacts (gitignored) |

## Models (local, not redistributed)

ONNX / tessdata live under `frozen/ocr_v1_1/vendor/` (gitignored). Copy from your licensed source or run the install steps in `docs/MODELS.md`. **LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION** for RapidOCR / PP-OCR weights.

## Setup (Windows)

Follow **[`../INSTALLATION.md`](../INSTALLATION.md)** (authoritative). Creates `.venv`, `.venv_ppocrv5`, installs pinned requirements, downloads vendor models (see `docs/MODELS.md`), and verifies readiness.

Install Tesseract on the host if not at the default path:

```powershell
$env:LICENSE_TESSERACT_CMD = "C:\Program Files\Tesseract-OCR\tesseract.exe"
```

## Start HTTP service

```powershell
cd DOCUMENT-ENGINE\LICENSE
.\.venv\Scripts\python.exe -m uvicorn services.uae_license_api.main:app --host 127.0.0.1 --port 8020
```

Port: `UAE_LICENSE_API_PORT` (default **8020**). Passport uses **8010** — do not share.

## Endpoints

- `GET /health` — READY when Crop templates, Tesseract, RapidOCR v4, PP-OCRv5 worker, and models are usable.
- `POST /extract-driving-license` — multipart field `image` (JPEG/PNG, max 5 MiB).

## Regression

```powershell
.\.venv\Scripts\python.exe tests\run_vendored_ocr_regression.py
```

Expect `OUTPUT_DIFFERENCE_COUNT = 0` (26/26 exact vs frozen baseline).

## Privacy

Logs include `job_id`, timings, and error codes only — not licence numbers, names, or image bytes.
