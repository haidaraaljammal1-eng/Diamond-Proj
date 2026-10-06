from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Optional

from rapidocr_onnxruntime import RapidOCR

from src.engines.rapidocr_engine import RapidOcrEngine

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_EN_REC = _PROJECT_ROOT / "vendor" / "rapidocr_en" / "en_PP-OCRv4_rec_infer.onnx"
_EN_DICT = _PROJECT_ROOT / "vendor" / "rapidocr_en" / "en_dict.txt"


class RapidOcrEnglishEngine(RapidOcrEngine):
    def cold_init(self) -> float:
        t0 = time.perf_counter()
        if not _EN_REC.is_file() or not _EN_DICT.is_file():
            raise FileNotFoundError(
                f"English RapidOCR assets missing under {_EN_REC.parent}"
            )
        self._ocr = RapidOCR(
            rec_model_path=str(_EN_REC),
            rec_keys_path=str(_EN_DICT),
        )
        try:
            import importlib.metadata as md

            self._version = md.version("rapidocr-onnxruntime")
        except Exception:
            self._version = "unknown"
        self._init_ms = (time.perf_counter() - t0) * 1000.0
        return self._init_ms

    def recognize(self, image_path: str, field_name: str, language: str = "eng") -> dict[str, Any]:
        if self._ocr is None:
            self.cold_init()
        assert self._ocr is not None
        t0 = time.perf_counter()
        result, _ = self._ocr(
            image_path,
            use_det=False,
            use_cls=False,
            use_rec=True,
        )
        runtime_ms = (time.perf_counter() - t0) * 1000.0
        texts: list[str] = []
        confs: list[float] = []
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
        raw_text = " ".join(texts).strip()
        confidence: Optional[float] = None
        if confs:
            confidence = sum(confs) / len(confs)
        return {
            "raw_text": raw_text,
            "confidence": confidence,
            "runtime_ms": runtime_ms,
            "engine": "rapidocr_en",
            "engine_version": self._version,
            "model": "en_PP-OCRv4_rec_infer.onnx",
            "language": "eng",
        }

    def metadata(self) -> dict[str, Any]:
        return {
            "engine": "rapidocr_en",
            "rec_model_path": str(_EN_REC),
            "rec_keys_path": str(_EN_DICT),
            "use_det": False,
            "use_cls": False,
            "use_rec": True,
        }
