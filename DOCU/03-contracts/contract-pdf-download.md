# Staff contract PDF download

## API

- `GET /contracts/:id/pdf?download=1` — staff JWT + `contracts.read` (functional: `diamond.fn.contracts.view_page`).
- Regenerates on every request from current DB state (draft official view or signed snapshot + live Car-Out/Car-In overlay).
- No PDF bytes are stored in PostgreSQL, attachments, or disk.

## Rendering

- Backend loads the same official contract view as staff UI (`buildOfficialContractView` / `liveContractView`).
- Playwright opens the frontend export page `/[locale]/internal/contract-pdf` with an in-memory bootstrap payload (signatures as data URLs).
- Requires `CONTRACT_PDF_FRONTEND_BASE_URL` (default `http://127.0.0.1:3100`) and Playwright Chromium on the host running the API.

## UI

- Contracts table: PDF icon on every lifecycle status; one active download per row.
