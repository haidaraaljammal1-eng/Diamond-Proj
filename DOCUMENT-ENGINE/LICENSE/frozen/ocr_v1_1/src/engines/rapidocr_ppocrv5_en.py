"""PP-OCRv5 English recognition-only engine (use with venv_ppocrv5 + rapidocr>=3)."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Optional

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_V5_REC = _PROJECT_ROOT / "vendor" / "ppocrv5_en" / "en_PP-OCRv5_rec_mobile.onnx"
_V5_DICT = _PROJECT_ROOT / "vendor" / "ppocrv5_en" / "ppocrv5_en_dict.txt"


class RapidOcrPpocrv5EnEngine:
    def __init__(self, rec_width: int = 320) -> None:
        self._rec_width = rec_width
        self._ocr: Any = None
        self._version = "unknown"

    def cold_init(self) -> float:
        from rapidocr import RapidOCR

        if not _V5_REC.is_file() or not _V5_DICT.is_file():
            raise FileNotFoundError(f"PP-OCRv5 EN assets missing under {_V5_REC.parent}")
        t0 = time.perf_counter()
        self._ocr = RapidOCR(
            params={
                "Rec.model_path": str(_V5_REC),
                "Rec.rec_keys_path": str(_V5_DICT),
                "Rec.rec_img_shape": [3, 48, self._rec_width],
                "Global.use_det": False,
                "Global.use_cls": False,
                "Global.use_rec": True,
            }
        )
        try:
            import importlib.metadata as md

            self._version = md.version("rapidocr")
        except Exception:
            self._version = "unknown"
        return (time.perf_counter() - t0) * 1000.0

    def recognize(self, image_path: str) -> dict[str, Any]:
        if self._ocr is None:
            self.cold_init()
        t0 = time.perf_counter()
        out = self._ocr(
            image_path,
            use_det=False,
            use_cls=False,
            use_rec=True,
        )
        runtime_ms = (time.perf_counter() - t0) * 1000.0
        texts = list(out.txts or ())
        scores = list(out.scores or ())
        raw_text = " ".join(texts).strip()
        confidence: Optional[float] = None
        if scores:
            confidence = sum(float(s) for s in scores) / len(scores)
        return {
            "raw_text": raw_text,
            "confidence": confidence,
            "runtime_ms": runtime_ms,
            "engine": "rapidocr_ppocrv5_en",
            "engine_version": self._version,
            "model": "en_PP-OCRv5_rec_mobile.onnx",
            "rec_width": self._rec_width,
            "recognition_only": True,
        }

    def metadata(self) -> dict[str, Any]:
        return {
            "engine": "rapidocr_ppocrv5_en",
            "rec_model_path": str(_V5_REC),
            "rec_keys_path": str(_V5_DICT),
            "rec_width": self._rec_width,
            "use_det": False,
            "use_cls": False,
            "use_rec": True,
        }
