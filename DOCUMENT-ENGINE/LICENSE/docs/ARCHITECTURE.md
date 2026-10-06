# Architecture

```
HTTP (8020)  services.uae_license_api
       │
       ├─ jobs/<uuid>/input/original.*
       ├─ frozen/crop_v1  → value_crops + ocr_handoff.json
       └─ frozen/ocr_v1_1 EnglishOcrPipeline (one per process)
              └─ .venv_ppocrv5 PP-OCRv5 worker (persistent PID)
```

- **Serial queue**: one full extraction at a time per API instance (`asyncio.Lock`).
- **No Passport imports**, shared venv, port, or job directories.
- **Business rules** (expiry, contract eligibility) are out of scope for this engine.
