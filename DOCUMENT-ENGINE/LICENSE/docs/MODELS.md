# Licence engine — model assets

**Redistribution:** `LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION` — weights are **not** stored in Git.

**Installation:** see [`../../INSTALLATION.md`](../../INSTALLATION.md) section 8 (URLs, destinations, full SHA-256).

Runtime expects files under `frozen/ocr_v1_1/vendor/` (gitignored).

| Asset | Destination (under `vendor/`) | Upstream | SHA-256 |
|-------|-------------------------------|----------|---------|
| Tesseract `eng.traineddata` | `tessdata/eng.traineddata` | [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) `eng.traineddata` | `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2` |
| RapidOCR PP-OCRv4 EN rec | `rapidocr_en/en_PP-OCRv4_rec_infer.onnx` | [RapidAI/RapidOCR](https://www.modelscope.cn/models/RapidAI/RapidOCR) v3.9.2 `en_PP-OCRv4_rec_mobile.onnx` | `e8770c967605983d1570cdf5352041dfb68fa0c21664f49f47b155abd3e0e318` |
| RapidOCR EN dict | `rapidocr_en/en_dict.txt` | Same bundle (paddle dict path) | `5662df9d2d03f0e8ca0d3b0649d6acbab904b6a14b3d3521463c71c37c668ce3` |
| PP-OCRv5 EN rec mobile | `ppocrv5_en/en_PP-OCRv5_rec_mobile.onnx` | RapidOCR ModelScope v3.9.2 | `c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8` |
| PP-OCRv5 EN dict | `ppocrv5_en/ppocrv5_en_dict.txt` | RapidOCR ModelScope v3.9.2 | `e025a66d31f327ba0c232e03f407ae8d105e1e709e7ccb3f408aa778c24e70d6` |

**Host Tesseract:** not bundled. Install [UB Mannheim Tesseract 5.x](https://github.com/UB-Mannheim/tesseract/wiki) for Windows. Default executable: `C:\Program Files\Tesseract-OCR\tesseract.exe`.

## Environment overrides

- `LICENSE_TESSERACT_CMD` — path to `tesseract.exe`
- `LICENSE_TESSDATA_DIR` — defaults to `vendor/tessdata`
- `LICENSE_PPOCRV5_PYTHON` — PP worker interpreter (default `LICENSE/.venv_ppocrv5/Scripts/python.exe`)
- `LICENSE_ENGINE_ROOT` — repo `DOCUMENT-ENGINE/LICENSE`
