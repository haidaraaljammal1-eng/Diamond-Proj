# Document Engine

Internal document-processing services for Diamond. The browser and staff clients never call these APIs directly; only `APP/backend` integrates over HTTP on a private network.

## Installation

**Authoritative specification:** [`INSTALLATION.md`](INSTALLATION.md)

A developer or coding Agent must read `INSTALLATION.md` completely, then install prerequisites, create the three Python environments, download OCR models, and verify health. There is **no** bootstrap script.

**Daily dev** (Passport + Licence + backend):

```powershell
cd APP/backend
npm run dev
```

`dev-with-document-engines.ts` starts local engines when `PASSPORT_NUMBER_API_URL` and `UAE_DRIVING_LICENSE_API_URL` point at `127.0.0.1` (see `APP/backend/.env.example`).

**Health**

| Service | URL | Ready when |
|---------|-----|------------|
| Passport | http://127.0.0.1:8010/health | `status: ok`, `engine: passport_number_frozen` |
| Licence | http://127.0.0.1:8020/health | `status: READY`, release `OCR_ENGLISH_V1_3_1_TWO_FIELD` |

## Layout

| Path | Role |
|------|------|
| `INSTALLATION.md` | Authoritative Windows installation spec |
| `PASSPORT/` | Passport Number Engine + FastAPI (`POST /extract-passport-number`, port **8010**) |
| `LICENSE/` | UAE Driving Licence engine + FastAPI (`POST /extract-driving-license`, port **8020**) |
| `git-manifest-excludes.txt` | Paths omitted from proposed Git delivery (research corpora, diagnostics) |

## Licence runtime

- **Frozen:** `LICENSE/frozen/crop_v1` (DYNAMIC_CROP_V1), `LICENSE/frozen/ocr_v1_1`, `LICENSE/frozen/ocr_v1_2` (two-field config)
- **Release:** `OCR_ENGLISH_V1_3_1_TWO_FIELD` (PP-primary licence number + Rapid fallback)
- **PP worker:** separate `.venv_ppocrv5` subprocess

## Passport runtime

- **Engine:** `PASSPORT/scripts/passport_number/` + MRZ detection modules under `PASSPORT/scripts/`
- **Paddle model:** `en_PP-OCRv4_mobile_rec` under repo-local `PASSPORT/.paddle-home/.paddlex/official_models/`

## Git delivery scope

```powershell
powershell -ExecutionPolicy Bypass -File DOCUMENT-ENGINE/scripts/list-git-candidate-manifest.ps1 -ScanProhibited
```

Do not commit `.venv`, `site-packages`, vendor ONNX/tessdata, real document images, or `PASSPORT/results/`.

## Diamond backend

Configure `PASSPORT_NUMBER_API_URL` and `UAE_DRIVING_LICENSE_API_URL` in `APP/backend/.env`. See `DOCU/00-system-overview/document-engine.md`.
