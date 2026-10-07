# Diamond Document Engine Installation Specification

**THIS FILE IS THE AUTHORITATIVE INSTALLATION SPECIFICATION FOR THE DIAMOND LICENSE AND PASSPORT DOCUMENT ENGINES.**

A coding Agent preparing a new development machine **MUST read this document completely** before changing the environment.

Do not substitute package versions.  
Do not install “latest” versions.  
Do not omit required environments.  
Do not reuse undocumented dependencies.  
Do not change engine/API behavior.  
Do not commit local environments, models, caches, or document data.

---

## 1. System requirements

| Item | Requirement |
|------|-------------|
| OS | Windows 10/11 x64 |
| Python | **3.12.x** only (verified baseline **3.12.10**) |
| Rejected | Python 3.13+ unless the project is re-validated |
| Network | Required for `pip`, LICENSE model downloads, Passport Paddle model fetch |
| Shell | PowerShell 5.1+ (examples below use PowerShell) |

### Python installation

**Inspect first** (do not reinstall if already 3.12.x):

```powershell
py -3.12 -c "import sys; print(sys.version); print(sys.executable)"
# or
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -c "import sys; print(sys.version)"
```

**Preferred (winget):**

```powershell
winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
```

**Approved fallback (no winget):** official installer only:

- URL: `https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe`
- Silent per-user example: `/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1`

Set `PY312` to your resolved `python.exe` for the commands in this document.

---

## 2. Microsoft VC++ runtime

Native wheels (OpenCV, ONNX Runtime, Paddle) require **Microsoft Visual C++ 2015–2022 Redistributable (x64)**.

**Package id (winget):** `Microsoft.VCRedist.2015+.x64`

**Check (registry):**

```powershell
Test-Path "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"
```

**Install if missing:**

```powershell
winget install --id Microsoft.VCRedist.2015+.x64 -e --accept-package-agreements --accept-source-agreements
```

**Official fallback:** `https://aka.ms/vs/17/release/vc_redist.x64.exe` (silent: `/install /quiet /norestart`)

**Verify:** after creating venvs, `import cv2`, `import onnxruntime`, and `import paddle` must succeed in their respective environments (see sections 5–7).

---

## 3. Tesseract

- **LICENSE** requires Tesseract **5.x** for English OCR paths.
- **PASSPORT** production OCR does **not** use Tesseract.

| Item | Value |
|------|--------|
| Known working baseline | **5.5.3.20260724** (host example) |
| Default executable | `C:\Program Files\Tesseract-OCR\tesseract.exe` |
| Override | `LICENSE_TESSERACT_CMD` → full path to `tesseract.exe` |
| Tessdata (LICENSE) | `LICENSE/frozen/ocr_v1_1/vendor/tessdata/` (see section 8) |

**Install (preferred):**

```powershell
winget install --id UB-Mannheim.TesseractOCR -e --accept-package-agreements --accept-source-agreements
```

**Trusted Windows distribution:** [UB Mannheim Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki)

**Approved fallback installer:**  
`https://github.com/UB-Mannheim/tesseract/releases/download/v5.4.0.20240606/tesseract-ocr-w64-setup-5.4.0.20240606.exe`

Do not bundle Tesseract in Git.

```powershell
& "C:\Program Files\Tesseract-OCR\tesseract.exe" --version
```

---

## 4. Project directory structure

```
DOCUMENT-ENGINE/
  LICENSE/     UAE driving licence engine (Crop + OCR + HTTP API)
  PASSPORT/    Passport number engine (MRZ + Paddle + HTTP API)
  INSTALLATION.md   (this file)
```

| Engine | HTTP entry | Port | Diamond env URL |
|--------|------------|------|-----------------|
| LICENSE | `LICENSE/services/uae_license_api/main.py` | **8020** | `UAE_DRIVING_LICENSE_API_URL` |
| PASSPORT | `PASSPORT/services/passport_number_api/main.py` | **8010** | `PASSPORT_NUMBER_API_URL` |

Engines are independent Python trees. **APP/backend** integrates over HTTP only (`APP/backend/scripts/dev-with-document-engines.ts`).

---

## 5. LICENSE main Python environment

**Path:** `DOCUMENT-ENGINE/LICENSE/.venv`

From repository root (`DIAMOND-SYSTEM`):

```powershell
$PY312 = py -3.12 -c "import sys; print(sys.executable)"  # adjust if needed
& $PY312 -m venv DOCUMENT-ENGINE/LICENSE/.venv
$LIC = "DOCUMENT-ENGINE/LICENSE/.venv/Scripts/python.exe"
& $LIC -m pip install --upgrade pip
& $LIC -m pip install -r DOCUMENT-ENGINE/LICENSE/requirements.txt
& $LIC -m pip install -r DOCUMENT-ENGINE/LICENSE/requirements-api.txt
```

**Canonical manifests:** `LICENSE/requirements.txt`, `LICENSE/requirements-api.txt`

**Critical pins (do not change without re-validation):**

- `opencv-python==4.14.0.94` (OpenCV 5.x breaks Crop deskew)
- `numpy==2.5.3`, `onnxruntime==1.30.0`, `rapidocr-onnxruntime==1.4.4`
- `pytesseract==0.3.13`, `pillow==12.3.0`, `PyYAML==6.0.3`
- FastAPI/Uvicorn stack from `requirements-api.txt`

**Verify imports:**

```powershell
& $LIC -c "import cv2, numpy, onnxruntime, rapidocr_onnxruntime, pytesseract; print('license_main_ok')"
```

---

## 6. LICENSE PP-OCRv5 worker environment

**Path:** `DOCUMENT-ENGINE/LICENSE/.venv_ppocrv5` (**separate** from main — subprocess worker)

```powershell
& $PY312 -m venv DOCUMENT-ENGINE/LICENSE/.venv_ppocrv5
$PPW = "DOCUMENT-ENGINE/LICENSE/.venv_ppocrv5/Scripts/python.exe"
& $PPW -m pip install --upgrade pip
& $PPW -m pip install -r DOCUMENT-ENGINE/LICENSE/requirements-ppocrv5.txt
```

**Verified direct runtime:**

- `rapidocr==3.9.2`
- `onnxruntime==1.30.0`

Do **not** merge this environment into `.venv`.  
Default worker interpreter: `LICENSE/.venv_ppocrv5/Scripts/python.exe` via `LICENSE_PPOCRV5_PYTHON` (set automatically in `runtime_paths.py`).

**Verify worker env:**

```powershell
& $PPW -c "import rapidocr; import onnxruntime; print('pp_worker_ok')"
```

**Verify worker binding (after models + main env ready):**

```powershell
& $LIC DOCUMENT-ENGINE/LICENSE/scripts/verification/verify_pp_worker_env.py
```

---

## 7. PASSPORT Python environment

**Path:** `DOCUMENT-ENGINE/PASSPORT/.venv`

```powershell
& $PY312 -m venv DOCUMENT-ENGINE/PASSPORT/.venv
$PP = "DOCUMENT-ENGINE/PASSPORT/.venv/Scripts/python.exe"
& $PP -m pip install --upgrade pip
& $PP -m pip install -r DOCUMENT-ENGINE/PASSPORT/requirements.txt
& $PP -m pip install -r DOCUMENT-ENGINE/PASSPORT/requirements-api.txt
```

**Critical pins:**

- `opencv-python-headless==5.0.0.93`
- `paddleocr==3.7.0`
- `paddlepaddle==3.3.1`

Paddle/PaddleX pulls a large transitive stack — **do not manually prune** transitive packages on teammate machines.

```powershell
& $PP -c "import cv2, paddle, paddleocr; print('passport_ok')"
```

---

## 8. LICENSE OCR model assets

**Redistribution:** `LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION` — weights are **not** in Git.

**Vendor root:** `DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/vendor/`

Download from trusted upstream only. After download, verify SHA-256 (section 9).

| Asset | Component | Trusted upstream | Download URL | Destination (under `vendor/`) | SHA-256 (full) | ~Size | Git |
|-------|-----------|------------------|--------------|----------------------------------|----------------|-------|-----|
| `eng.traineddata` | Tesseract EN | tessdata_fast | `https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata` | `tessdata/eng.traineddata` | `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2` | 3.9 MB | ignore |
| RapidOCR EN rec | PP-OCRv4 | RapidAI/RapidOCR ModelScope **v3.9.2** | `https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv4/rec/en_PP-OCRv4_rec_mobile.onnx` | `rapidocr_en/en_PP-OCRv4_rec_infer.onnx` | `e8770c967605983d1570cdf5352041dfb68fa0c21664f49f47b155abd3e0e318` | 7.3 MB | ignore |
| RapidOCR EN dict | PP-OCRv4 | RapidAI/RapidOCR ModelScope **v3.9.2** | `https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/paddle/PP-OCRv4/rec/en_PP-OCRv4_rec_mobile/en_dict.txt` | `rapidocr_en/en_dict.txt` | `5662df9d2d03f0e8ca0d3b0649d6acbab904b6a14b3d3521463c71c37c668ce3` | 190 B | ignore |
| PP-OCRv5 EN rec | PP-OCRv5 worker | RapidAI/RapidOCR ModelScope **v3.9.2** | `https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv5/rec/en_PP-OCRv5_rec_mobile.onnx` | `ppocrv5_en/en_PP-OCRv5_rec_mobile.onnx` | `c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8` | 7.5 MB | ignore |
| PP-OCRv5 EN dict | PP-OCRv5 worker | RapidAI/RapidOCR ModelScope **v3.9.2** | `https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/paddle/PP-OCRv5/rec/en_PP-OCRv5_rec_mobile/ppocrv5_en_dict.txt` | `ppocrv5_en/ppocrv5_en_dict.txt` | `e025a66d31f327ba0c232e03f407ae8d105e1e709e7ccb3f408aa778c24e70d6` | 1.4 KB | ignore |

**Note:** The RapidOCR URL filename is `en_PP-OCRv4_rec_mobile.onnx`; runtime expects it on disk as `en_PP-OCRv4_rec_infer.onnx` (same bytes/hash as upstream mobile ONNX).

**Example download (one file):**

```powershell
$dest = "DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/vendor/tessdata/eng.traineddata"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata" -OutFile $dest
```

Repeat for each row using the URL and destination in the table.

Supplementary reference (not authoritative over this table): `LICENSE/docs/MODELS.md`.

---

## 9. Model hash verification

```powershell
(Get-FileHash -Algorithm SHA256 -Path "DOCUMENT-ENGINE/LICENSE/frozen/ocr_v1_1/vendor/tessdata/eng.traineddata").Hash.ToLower()
```

Compare the **full** 64-character hash to section 8.  
On mismatch: delete the file and re-download from the documented URL. Do not run OCR with corrupted weights.

---

## 10. Passport Paddle model

| Item | Value |
|------|--------|
| Model name | `en_PP-OCRv4_mobile_rec` |
| Upstream identity | PaddlePaddle / PaddleX official models (`PaddlePaddle/en_PP-OCRv4_mobile_rec`) |
| Repo-local cache root | `DOCUMENT-ENGINE/PASSPORT/.paddle-home/` |
| Expected model directory | `PASSPORT/.paddle-home/.paddlex/official_models/en_PP-OCRv4_mobile_rec/` |

**Reproducibility:** `PASSPORT/services/passport_number_api/runtime_paths.py` sets `PASSPORT_PADDLE_HOME` (default `PASSPORT/.paddle-home`) and redirects `USERPROFILE` / `HOME` to that directory **before** any Paddle import so models do not land in the developer’s global `%USERPROFILE%\.paddlex`.

**First download / warm-up (no setup script)** — from `DOCUMENT-ENGINE/PASSPORT`:

```powershell
$PP = ".venv/Scripts/python.exe"
& $PP -c @"
import sys
from pathlib import Path
sys.path.insert(0, str(Path('.').resolve()))
from services.passport_number_api.runtime_paths import apply_passport_runtime_environment
apply_passport_runtime_environment()
from paddleocr import TextRecognition
import numpy as np
TextRecognition(model_name='en_PP-OCRv4_mobile_rec').predict(np.zeros((48,320,3),dtype=np.uint8), batch_size=1)
print('paddle_warm_ok')
"@
```

**Functional verification (synthetic blank image, no PII):**

```powershell
& $PP scripts/verification/verify_passport_functional.py
```

Requires exit code `0` and non-zero `model_files_count` in JSON output.

---

## 11. Environment variables

| Variable | Engine | Required | Default / behavior | Example | Secret? | Where set |
|----------|--------|----------|-------------------|---------|---------|-----------|
| `LICENSE_TESSERACT_CMD` | LICENSE | Optional | `C:\Program Files\Tesseract-OCR\tesseract.exe` if present | `C:\Program Files\Tesseract-OCR\tesseract.exe` | No | OS install / `.env` / shell |
| `LICENSE_TESSDATA_DIR` | LICENSE | Optional | `LICENSE/frozen/ocr_v1_1/vendor/tessdata` | (default) | No | `runtime_paths.py` |
| `LICENSE_PPOCRV5_PYTHON` | LICENSE | Optional | `.venv_ppocrv5/Scripts/python.exe` | (default) | No | `runtime_paths.py` |
| `LICENSE_ENGINE_ROOT` | LICENSE | Optional | `DOCUMENT-ENGINE/LICENSE` | (default) | No | `runtime_paths.py` |
| `LICENSE_JOBS_ROOT` | LICENSE | Optional | `LICENSE/jobs` | Custom jobs dir | No | shell / `.env` |
| `PASSPORT_PADDLE_HOME` | PASSPORT | Optional | `PASSPORT/.paddle-home` | Repo-local cache | No | `runtime_paths.py` |
| `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK` | PASSPORT | Set by runtime | `True` when API starts | — | No | `runtime_paths.py` |
| `UAE_DRIVING_LICENSE_API_URL` | Diamond | Dev integration | — | `http://127.0.0.1:8020` | No | `APP/backend/.env` |
| `UAE_DRIVING_LICENSE_API_TIMEOUT_MS` | Diamond | Optional | `120000` in example | — | No | `APP/backend/.env` |
| `UAE_DRIVING_LICENSE_API_ORCHESTRATE` | Diamond | Optional | orchestrate when URL is localhost | `false` to disable | No | `APP/backend/.env` |
| `PASSPORT_NUMBER_API_URL` | Diamond | Dev integration | — | `http://127.0.0.1:8010` | No | `APP/backend/.env` |
| `PASSPORT_NUMBER_API_TIMEOUT_MS` | Diamond | Optional | `60000` in example | — | No | `APP/backend/.env` |
| `PASSPORT_NUMBER_API_ORCHESTRATE` | Diamond | Optional | orchestrate when URL is localhost | `false` to disable | No | `APP/backend/.env` |

Do not commit secrets. Use `APP/backend/.env` (gitignored) from `.env.example`.

---

## 12. Start LICENSE engine

Working directory: `DOCUMENT-ENGINE/LICENSE`

```powershell
cd DOCUMENT-ENGINE/LICENSE
.\.venv\Scripts\python.exe -m uvicorn services.uae_license_api.main:app --host 127.0.0.1 --port 8020
```

---

## 13. Start PASSPORT engine

Working directory: `DOCUMENT-ENGINE/PASSPORT`

```powershell
cd DOCUMENT-ENGINE/PASSPORT
.\.venv\Scripts\python.exe -m uvicorn services.passport_number_api.main:app --host 127.0.0.1 --port 8010
```

---

## 14. Health verification

### LICENSE

```powershell
Invoke-RestMethod http://127.0.0.1:8020/health
```

**Expected:**

- `status`: `READY`
- `engine`: `OCR_ENGLISH_V1_3_1_TWO_FIELD`
- `components`: `crop_v1`, `tesseract`, `rapidocr_v4`, `ppocrv5_worker`, `model_integrity` all `ok: true`

**Offline (no HTTP):**

```powershell
& $LIC DOCUMENT-ENGINE/LICENSE/scripts/verification/verify_license_ready.py
```

### PASSPORT

```powershell
Invoke-RestMethod http://127.0.0.1:8010/health
```

**Expected:** `status: ok`, `engine: passport_number_frozen`

Health alone is shallow — also run `scripts/verification/verify_passport_functional.py` (section 10).

---

## 15. Diamond integration

- Launcher: `APP/backend/scripts/dev-with-document-engines.ts`
- Interpreters: `DOCUMENT-ENGINE/LICENSE/.venv/Scripts/python.exe`, `DOCUMENT-ENGINE/PASSPORT/.venv/Scripts/python.exe`
- Ports: **8020** (LICENSE), **8010** (PASSPORT)
- Configure `UAE_DRIVING_LICENSE_API_URL` and `PASSPORT_NUMBER_API_URL` in `APP/backend/.env` (see `.env.example`)

Do not change backend OCR contracts for installation.

---

## 16. Normal daily development

```powershell
cd APP/backend
npm run dev
```

When local URLs point at `127.0.0.1`, the dev script starts engines if not already healthy. Installation steps are only needed on first setup or after dependency/model changes.

---

## 17. Agent Installation Protocol

1. Read this entire file before taking actions.  
2. Inspect existing machine state (Python, VC++, Tesseract, ports 8010/8020).  
3. **Do not** reinstall a prerequisite that already satisfies the documented version.  
4. Install missing Windows prerequisites (sections 1–3).  
5. Create **three** environments: `LICENSE/.venv`, `LICENSE/.venv_ppocrv5`, `PASSPORT/.venv`.  
6. Install dependencies **only** from repository requirement manifests (sections 5–7).  
7. Download missing LICENSE OCR assets (section 8).  
8. Verify **every** model SHA-256 (section 9).  
9. Warm Passport Paddle cache in repo-local `.paddle-home` (section 10).  
10. Start and verify LICENSE (sections 12, 14).  
11. Start and verify PASSPORT (sections 13–14).  
12. Verify Diamond connectivity (`npm run dev` + health URLs).  
13. Return the final environment report (section 18).

**Prohibited:**

- Using “latest” package versions  
- Merging `.venv` and `.venv_ppocrv5`  
- Undocumented model mirrors  
- Copying another developer’s venv or `site-packages`  
- Copying private document fixtures  
- Changing OCR business logic to make setup pass  

---

## 18. Agent final report format

Return:

- Python version/path  
- VC++ runtime status  
- Tesseract version/path  
- LICENSE main env: READY/FAIL  
- PP worker env: READY/FAIL  
- PASSPORT env: READY/FAIL  
- LICENSE models: all hashes valid / list failures  
- Passport Paddle model: READY/FAIL  
- LICENSE `:8020`: READY/FAIL  
- PASSPORT `:8010`: READY/FAIL  
- Diamond connectivity: PASS/FAIL  
- Manual action remaining: NONE / exact blocker  

---

## 19. Troubleshooting

| Symptom | Checks |
|---------|--------|
| Wrong Python | `py -3.12 --version`; must be 3.12.x |
| Tesseract missing | `LICENSE_TESSERACT_CMD`, `tesseract --version` |
| `eng.traineddata` missing | File under `vendor/tessdata/`; hash section 8 |
| Rapid / PP ONNX missing | Paths under `vendor/rapidocr_en`, `vendor/ppocrv5_en` |
| Hash mismatch | Re-download; never patch binaries |
| Paddle download failure | Network; HF/PaddleX; retry warm-up (section 10) |
| VC++ errors on import | Install VC++ section 2 |
| `pip` failure | Use venv interpreter; upgrade pip once |
| Port in use | `netstat -ano \| findstr 8010` / `8020` |
| Wrong Paddle cache | Confirm `PASSPORT/.paddle-home` populated, not only user profile |
| PP worker wrong Python | `verify_pp_worker_env.py`; must use `.venv_ppocrv5` |

Do not change OCR source code as first-line troubleshooting.

---

## Requirement manifests (authoritative)

| File | Purpose |
|------|---------|
| `LICENSE/requirements.txt` | Main LICENSE/Crop/OCR runtime |
| `LICENSE/requirements-api.txt` | LICENSE FastAPI stack |
| `LICENSE/requirements-ppocrv5.txt` | PP-OCRv5 worker only |
| `PASSPORT/requirements.txt` | Passport Paddle/MRZ runtime |
| `PASSPORT/requirements-api.txt` | Passport FastAPI stack |
