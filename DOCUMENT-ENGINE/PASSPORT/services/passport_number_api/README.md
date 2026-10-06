# DIAMOND Passport Number — Internal HTTP API

Stateless internal service wrapping the **frozen** Passport Number Engine in `scripts/passport_number/`. Expects a **full passport biodata page** image (not MRZ-only crops).

## Endpoints

### `GET /health`

No OCR. Returns service liveness.

```json
{"status": "ok", "service": "passport-number-api", "engine": "passport_number_frozen"}
```

### `POST /extract-passport-number`

**Content-Type:** `multipart/form-data`  
**Field:** `image` — full passport-page file (JPEG, PNG, WEBP)

**VALID (HTTP 200):**

```json
{"passport_number": "B5000479", "status": "VALID"}
```

**REVIEW (HTTP 200):**

```json
{"passport_number": null, "status": "REVIEW"}
```

**Errors (HTTP 4xx/5xx):**

```json
{"error": "INVALID_IMAGE", "message": "The uploaded file is not a valid image."}
```

Codes: `MISSING_IMAGE`, `INVALID_IMAGE`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`

Interactive docs (when running): `/docs`

## Install API dependencies

From repository root (venv active):

```powershell
pip install -r requirements-api.txt
```

Does not modify OCR weights or `requirements.txt` engine stack.

## Start locally (internal binding)

Default: **127.0.0.1:8010** (not public internet).

```powershell
cd "C:\Users\Rw\DIAMOND MRZ"
$env:PASSPORT_NUMBER_API_HOST = "127.0.0.1"
$env:PASSPORT_NUMBER_API_PORT = "8010"
.\.venv\Scripts\python.exe -m uvicorn services.passport_number_api.main:app --host $env:PASSPORT_NUMBER_API_HOST --port $env:PASSPORT_NUMBER_API_PORT
```

Or:

```powershell
.\.venv\Scripts\python.exe -m uvicorn services.passport_number_api.main:app --host 127.0.0.1 --port 8010
```

## Test with curl

Health:

```powershell
curl http://127.0.0.1:8010/health
```

Extract (full-page specimen):

```powershell
curl -X POST "http://127.0.0.1:8010/extract-passport-number" -F "image=@results/mrz_a2/20260930T134456Z/01_original_reference.png"
```

## Diamond Backend access

- **Local dev:** `http://127.0.0.1:8010` from the backend process on the same host.
- **Docker:** run this service on an internal network; backend uses `http://passport-number-api:8010` (service name example). Do not publish the port publicly unless required for dev.
- **Private server:** bind to a private interface or reverse-proxy on an internal VLAN only.

Environment variables (optional):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PASSPORT_NUMBER_API_HOST` | `127.0.0.1` | Bind address |
| `PASSPORT_NUMBER_API_PORT` | `8010` | Listen port |

## Engine entry point

The API calls `passport_number.extract_passport_number.extract_passport_number_from_image(bgr)` only. No duplicate OCR pipeline.

## Parity tests

```powershell
.\.venv\Scripts\python.exe services\passport_number_api\test_api_parity.py
```

## Regression (standalone engine)

```powershell
.\.venv\Scripts\python.exe scripts\passport_number\run_regression.py
```

API layer must not change regression metrics.

## Concurrency

Inference is serialized with a process-level lock because Paddle OCR instances are created per call in the existing engine and are not assumed thread-safe.

## Logging

Logs request lifecycle and duration; does not log passport numbers or image bytes.
