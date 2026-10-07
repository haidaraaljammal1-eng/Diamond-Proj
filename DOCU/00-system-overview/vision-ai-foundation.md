# Vision AI (legacy — not used for rental document OCR)

**Rental passport and driving-license capture** use the internal **Document Engine** instead.
See `DOCU/00-system-overview/document-engine.md`.

The `vision-ai` module below remains in the tree for dev scripts (`npm run test:gemini*`) and
future non-rental use; it is **not** called from `contracts.service` upload paths.

---

# Vision AI (Gemini identity extraction)

Server-only Gemini extraction behind `VisionAIProvider`. Public rental and contracts must not
call `@google/genai` or `GeminiVisionProvider` from business modules except through the
approved analysis entry points documented here.

## Module

- `APP/backend/src/modules/vision-ai/`
- Factory: `createVisionAIProvider()`
- Analysis entry: `analyzeIdentityDocument("PASSPORT" | "DRIVER_LICENSE", file)`
- DEV simulation: `createSimulationVisionAIProvider()` (guarded routes only)

## Environment

| Variable | Purpose |
|----------|---------|
| `AI_VISION_PROVIDER` | `unconfigured` (default) or `gemini` |
| `GEMINI_API_KEY` | Server-only |
| `GEMINI_MODEL` | Default `gemini-3.8-flash` |
| `DOCUMENT_OCR_MIN_CONFIDENCE` | Legacy threshold name for licence field review (unchanged) |

## Diagnostics

```bash
npm run test:gemini
npm run test:gemini-document -- --type passport --file "PATH"
npm run test:gemini-document -- --type licence --file "PATH"
```

Structured JSON via Gemini `responseMimeType: application/json` + Zod validation.
Passport TD3 MRZ checksums (passport number, DOB, expiry) are validated locally;
visual vs MRZ mismatches become `REVIEW_REQUIRED`.

Driving licence dates: Gemini returns printed dates (often `DD/MM/YYYY`); backend
`normalizePrintedDate()` converts to ISO deterministically (UAE/GCC context uses
day-first when day/month are ambiguous). Ambiguous dates become `REVIEW_REQUIRED`.
If pass-1 omits dates, a targeted second Gemini call requests only DOB / issue / expiry.

## Removed

The legacy `document-ocr` module and `DOCUMENT_OCR_PROVIDER` env selector are removed.
Rental production OCR is Document Engine only; Gemini is diagnostic/legacy.

## Not implemented (Phase 2 scope boundary)

- `compareVehicleImages`
- Frontend / contract autofill changes beyond existing public upload → analysis path
