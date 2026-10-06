# Document Engine (internal)

Diamond document OCR runs in `DOCUMENT-ENGINE/` at the repository root. Only `APP/backend` calls these HTTP APIs; the browser never talks to them directly.

## Layout

| Path | Role |
|------|------|
| `DOCUMENT-ENGINE/PASSPORT/` | Frozen passport-number engine + FastAPI (`POST /extract-passport-number`, field `image`) |
| `DOCUMENT-ENGINE/LICENSE/` | Reserved — not implemented |

## Backend configuration

In `APP/backend/.env`:

- `PASSPORT_NUMBER_API_URL` — e.g. `http://127.0.0.1:8010` in development
- `PASSPORT_NUMBER_API_TIMEOUT_MS` — default `60000`

Client: `APP/backend/src/modules/document-engine/passport-number-api.client.ts`

Public rental passport upload (`POST /contracts/rental/:token/passport`) sends the **original full-page image** to the Passport API and maps:

- `VALID` + `passport_number` → `PassportExtraction` `READY`
- `REVIEW` → `NOT_RECOGNIZED` (customer may re-upload without limit)

Driving-license OCR is not wired until the License engine exists; uploads fail closed with `PROVIDER_UNAVAILABLE` unless DEV simulation routes are used.

## Local Passport API

**Normal development:** from `APP/backend`, `npm run dev` starts the Passport API automatically when `PASSPORT_NUMBER_API_URL` points at `http://127.0.0.1:8010` (or `localhost`), waits for `GET /health`, then starts the Fastify server. Python stdout/stderr are inherited. Stopping `npm run dev` stops the child Passport process unless it was already healthy (reused instance). Set `PASSPORT_NUMBER_API_ORCHESTRATE=false` to run uvicorn yourself. Production `npm start` does not spawn Python.

Manual uvicorn (optional), from `DOCUMENT-ENGINE/PASSPORT` with `.venv`:

```powershell
python -m uvicorn services.passport_number_api.main:app --host 127.0.0.1 --port 8010
```

Future production: run the Passport API as a separate internal service/container; do not embed Python in the Node process.

See `DOCUMENT-ENGINE/PASSPORT/services/passport_number_api/README.md` for details.
