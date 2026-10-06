# 07 — Python integration architecture

## External pipeline (read-only evidence)

### Crop V1 (`UAE_LICENSE_CROP_V2`)

- CLI: `python -m src.run_crop_pipeline --input <image> [--output <dir>]`
- Default output: `output/<input_stem>/` — **collision risk** if two jobs share stem concurrently (see § concurrency).
- Per job: `clean_job_output(output_dir)` before run (`output_hygiene.py`).
- Produces `value_crops/01_license_number.png` … `08_place_of_issue.png`, `ocr_handoff.json`, `pipeline_report.json`.
- Eligibility: `is_field_ocr_eligible(field)` — must read handoff JSON, not PNG alone.

### OCR V1.1 (`UAE_LICENSE_OCR_V1`)

- `EnglishOcrPipeline.recognize_license_english(crop_directory)` expects crops at directory root with names matching `_NAME_CROP_FILES` (same numbering as crop export).
- Engines: Tesseract + RapidOCR (main venv) + **persistent** `Ppocrv5WorkerClient` for `name_en`.
- Field statuses: `ACCEPT`, `REJECT`, `FLAG_UNCERTAIN`; dates DD/MM/YYYY internally then validators.
- `name_ar`: `NOT_OCR_PROCESSED` in pipeline output.

### Combined orchestrator

**COMBINED_ORCHESTRATOR_MISSING** inside Diamond monorepo.

Externally: sequential **Crop CLI → OCR `recognize_license_english(value_crops_dir)`** is the minimal orchestration; no single shipped FastAPI entry was verified in-repo (Diamond). Future Diamond service should wrap both in **one long-lived process**.

## Architecture options

| Option | Summary |
|--------|---------|
| A — spawn Python per request | **Reject** — cold start + new PP-OCRv5 worker per request |
| B — long-lived HTTP microservice | **Recommended** — mirror Passport (`document-engine` HTTP, private bind) |
| C — persistent worker managed by Node | Possible but duplicates B |
| D — separate container/service | Production target; same as B with Docker |
| E — embed in Fastify | **Reject** — violates Document Engine separation |

## Recommendation: **Option B**

**Why:**

1. **Precedent:** `PASSPORT_NUMBER_API_URL` + `passport-number-api.client.ts` + `dev-with-passport-api.ts`.
2. **PP-OCRv5 lifecycle:** `EnglishOcrPipeline` + `Ppocrv5WorkerClient` assume **reuse** within one Python process (`ppocrv5_client.py` subprocess worker).
3. **Crash isolation:** OCR crash does not take down Node; health check can fail closed.
4. **Windows dev:** Same as Passport (127.0.0.1, orchestrated dev start).
5. **Linux prod:** Separate service/container without Node spawning interpreters per upload.

## Worker lifecycle (AUDIT 15)

- **Outer process:** One Python API process holds one `EnglishOcrPipeline` instance (warm Tesseract/RapidOCR + v5 worker).
- **Per request:** Run crop in **unique job dir** → OCR on that dir → return JSON → delete job dir.
- **Do not** call `new EnglishOcrPipeline()` per HTTP request without measuring; constructor runs `cold_init()` on engines.

## Concurrency (AUDIT 17)

| Layer | Assessment |
|-------|------------|
| Fastify | Concurrent requests default |
| Python service | **SERIAL_QUEUE** or **BOUNDED_CONCURRENCY (1–2)** recommended initially |
| PP-OCRv5 worker | Single client with lock in `Ppocrv5WorkerClient` — parallel requests serialize at worker |
| Crop output | **CONCURRENT_OUTPUT_COLLISION_RISK = YES** if default `output/<stem>` used without unique `job_id` |

**Safest initial:** one OCR request at a time per Python process (queue), office-scale adequate.

## Temp directory (AUDIT 18)

Recommended:

```
<job_root>/<uuid>/
  input/original.jpg
  crop/          # crop pipeline output_dir
  result.json
```

Crop `clean_job_output` + unique `output_dir` per request mitigates stale files (AUDIT 19).

## Stale output (AUDIT 19)

Crop V1: `clean_job_output` removes prior artifacts in job folder before run. Diamond must pass **fresh output_dir** each time and map results to **that** request only.

## Performance (AUDIT 16)

| Metric | Source |
|--------|--------|
| PP-OCRv5 worker cold start | **MEASURED** in client as `_cold_start_ms` (per worker spawn) — not copied into this doc |
| Per-field `runtime_ms` | **MEASURED** in OCR pipeline result objects |
| End-to-end Diamond latency | **ESTIMATED** upload + crop (CPU) + OCR (warm) + JSON; typically multi-second |

No OCR-11B artifact file was read in audit; config references frozen calibration in `ocr_final_english_v1.json`.

## Health endpoint (AUDIT 32) — proposed contract

`GET /health` → `{ status, service, engine, tesseract, rapidocr, ppocrv5_worker, crop_templates_ok, model_integrity }`  
Mirror Passport minimalism; extend only as needed.
