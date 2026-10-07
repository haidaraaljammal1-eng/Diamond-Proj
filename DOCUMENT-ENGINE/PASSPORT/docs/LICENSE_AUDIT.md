# MRZ-A1 License Audit

**Audit date:** 2026-09-30  
**Workspace:** `C:\Users\Rw\DIAMOND MRZ`  
**Purpose:** Diamond proprietary deployment — local inference only, no paid API, no AGPL/GPL stack for this pipeline.

## Components under review

| Component | Role in MRZ-A1 | First-party / official source |
|-----------|----------------|-------------------------------|
| OpenCV (`opencv-python-headless`) | MRZ region detection, geometry, line crops | https://opencv.org/license/ , https://github.com/opencv/opencv |
| PaddleOCR (Python package) | PP-OCR **recognition** inference wrapper | https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE |
| PaddlePaddle (CPU) | Runtime for PP-OCR rec model | https://github.com/PaddlePaddle/Paddle/blob/develop/LICENSE |
| `en_PP-OCRv4_mobile_rec` weights | Single official English PP-OCRv4 mobile recognizer | https://huggingface.co/PaddlePaddle/en_PP-OCRv4_mobile_rec |
| ONNX Runtime | Transitive / optional (Paddle may use MKL; ONNX not primary) | https://github.com/microsoft/onnxruntime/blob/main/LICENSE |
| ICAO TD3 parser | **Our code** — no external MRZ SDK | N/A (Diamond-owned implementation) |

## Code licenses

### OpenCV (≥ 4.5.0 via PyPI wheels)

- **License:** Apache License 2.0  
- **Commercial use:** Permitted (including proprietary products) with notice/attribution requirements per Apache 2.0.  
- **API key / subscription:** None.  
- **Local inference:** Yes (library runs locally).

### PaddleOCR (repository + PyPI package)

- **License:** Apache License 2.0 (project default).  
- **Commercial use:** Permitted under Apache 2.0 for the core OCR stack used here (PP-OCR recognition).  
- **Excluded from scope:** LayoutLM / VQA / Doc-VQA paths under CC BY-NC-SA 4.0 — **not installed or used** in MRZ-A1.  
- **API key / subscription:** None for local inference.  
- **Local inference:** Yes.

### PaddlePaddle (CPU wheel)

- **License:** Apache License 2.0.  
- **Commercial use:** Permitted under Apache 2.0.  
- **CUDA:** Not used in MRZ-A1 (CPU-only).

### ONNX Runtime

- **License:** MIT License.  
- **Commercial use:** Permitted in proprietary applications with copyright notice preservation.  
- **Note:** Installed only if pulled as a dependency; MRZ-A1 does not require a separate ONNX-based OCR path.

## Model / weights license

### `en_PP-OCRv4_mobile_rec`

- **Source:** Official PaddlePaddle Hugging Face repo — https://huggingface.co/PaddlePaddle/en_PP-OCRv4_mobile_rec  
- **Metadata license:** `apache-2.0` (model card front matter).  
- **Provenance:** Official PaddleOCR team release (PP-OCRv4 English mobile recognition).  
- **Commercial / proprietary deployment:** Treated as Apache-2.0-aligned official release; suitable for proprietary app embedding with license notices.  
- **Subscription / API key:** None — weights download for local use.  
- **Character dictionary:** `ppocr/utils/en_dict.txt` — includes `A–Z`, `0–9`, and **`<`** (MRZ filler).

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| 100% local inference | **YES** (OpenCV + Paddle CPU + local weights) |
| No paid API | **YES** |
| No production license key | **YES** |
| Suitable for proprietary Diamond deployment | **YES** (Apache 2.0 / MIT stack only; no AGPL/GPL OCR) |
| No cloud OCR | **YES** |
| No unclear community weights | **YES** (official PaddlePaddle HF model only) |
| No external MRZ SDK | **YES** (parser is our code) |

## Redistribution

- Apache 2.0 (OpenCV, PaddleOCR, PaddlePaddle, official PP-OCR weights): retain copyright and license notices in distributions that include these components.  
- MIT (ONNX Runtime if present): retain copyright notice.

## Gate decision

**CLEAR**

MRZ-A1 may proceed with installation of OpenCV, PaddlePaddle (CPU), PaddleOCR, and the single official `en_PP-OCRv4_mobile_rec` recognition model.
