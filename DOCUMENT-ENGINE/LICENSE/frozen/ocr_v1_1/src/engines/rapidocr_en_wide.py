from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Optional

from rapidocr_onnxruntime import RapidOCR

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_EN_REC = _PROJECT_ROOT / "vendor" / "rapidocr_en" / "en_PP-OCRv4_rec_infer.onnx"
_EN_DICT = _PROJECT_ROOT / "vendor" / "rapidocr_en" / "en_dict.txt"


class RapidOcrEnWideEngine:
    """Same EN PP-OCRv4 weights with wider recognition canvas for long lines."""

    def __init__(self, rec_width: int = 640) -> None:
        self._rec_width = rec_width
        self._ocr: Optional[RapidOCR] = None
        self._version = ""

    def cold_init(self) -> float:
        t0 = time.perf_counter()
        self._ocr = RapidOCR(
            rec_model_path=str(_EN_REC),
            rec_keys_path=str(_EN_DICT),
            rec_img_shape=[3, 48, self._rec_width],
        )
        try:
            import importlib.metadata as md

            self._version = md.version("rapidocr-onnxruntime")
        except Exception:
            self._version = "unknown"
        return (time.perf_counter() - t0) * 1000.0

    def recognize(self, image_path: str) -> dict[str, Any]:
        if self._ocr is None:
            self.cold_init()
        t0 = time.perf_counter()
        result, _ = self._ocr(image_path, use_det=False, use_cls=False, use_rec=True)
        texts, confs = [], []
        if result:
            for item in result:
                if not item:
                    continue
                if len(item) >= 3 and isinstance(item[0], (list, tuple)):
                    texts.append(str(item[1]))
                    try:
                        confs.append(float(item[2]))
                    except (TypeError, ValueError):
                        pass
                elif len(item) >= 2 and isinstance(item[0], str):
                    texts.append(str(item[0]))
                    try:
                        confs.append(float(item[1]))
                    except (TypeError, ValueError):
                        pass
        raw = " ".join(texts).strip()
        conf = sum(confs) / len(confs) if confs else None
        return {
            "raw_text": raw,
            "confidence": conf,
            "runtime_ms": (time.perf_counter() - t0) * 1000.0,
            "engine": "rapidocr_en_wide",
            "engine_version": self._version,
            "model": f"en_PP-OCRv4_rec_infer.onnx@w{self._rec_width}",
            "language": "eng",
        }
