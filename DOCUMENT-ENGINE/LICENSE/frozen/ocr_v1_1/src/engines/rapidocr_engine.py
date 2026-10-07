from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Optional

from rapidocr_onnxruntime import RapidOCR

from src.engines.base import OcrEngine, OcrResult

try:
    import rapidocr_onnxruntime as _rapid_pkg
except ImportError:  # pragma: no cover
    _rapid_pkg = None


class RapidOcrEngine(OcrEngine):
    """Recognition-oriented RapidOCR wrapper (det/cls disabled when supported)."""

    def __init__(self) -> None:
        self._ocr: Optional[RapidOCR] = None
        self._version = ""
        self._init_ms = 0.0

    def cold_init(self) -> float:
        t0 = time.perf_counter()
        self._ocr = RapidOCR()
        self._version = getattr(_rapid_pkg, "__version__", "unknown")
        self._init_ms = (time.perf_counter() - t0) * 1000.0
        return self._init_ms

    def recognize(self, image_path: str, field_name: str, language: str) -> OcrResult:
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
                # Full pipeline: [box, text, score]
                if len(item) >= 3 and isinstance(item[0], (list, tuple)):
                    texts.append(str(item[1]))
                    try:
                        confs.append(float(item[2]))
                    except (TypeError, ValueError):
                        pass
                # Rec-only: [text, score]
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
        lang_label = language or ("ara" if field_name == "name_ar" else "latin")
        return OcrResult(
            raw_text=raw_text,
            confidence=confidence,
            runtime_ms=runtime_ms,
            engine="rapidocr",
            engine_version=self._version,
            model="rapidocr_onnxruntime_default",
            language=lang_label,
        )

    def metadata(self) -> dict[str, Any]:
        return {
            "engine": "rapidocr",
            "package": "rapidocr_onnxruntime",
            "engine_version": self._version,
            "use_det": False,
            "use_cls": False,
            "use_rec": True,
            "licensing_status": "APPROVED_FOR_INTERNAL_BENCHMARK",
            "licence_note": "LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION",
        }

    @staticmethod
    def discover_onnx_models() -> list[Path]:
        """Best-effort inventory of local ONNX files under site-packages."""
        roots: list[Path] = []
        if _rapid_pkg is not None:
            roots.append(Path(_rapid_pkg.__file__).resolve().parent)
        found: list[Path] = []
        for root in roots:
            if root.is_dir():
                found.extend(root.rglob("*.onnx"))
        return sorted(set(found))
