from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Optional

import pytesseract
from PIL import Image

from src.engines.base import OcrEngine, OcrResult

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_CONFIG_PATH = _PROJECT_ROOT / "config" / "tesseract.json"

_LATIN_FIELDS = frozenset(
    {
        "license_number",
        "name_en",
        "nationality",
        "date_of_birth",
        "issue_date",
        "expiry_date",
        "place_of_issue",
    }
)


def _load_config() -> dict[str, Any]:
    import os

    with _CONFIG_PATH.open(encoding="utf-8") as f:
        cfg = json.load(f)
    cmd = os.environ.get("LICENSE_TESSERACT_CMD") or cfg.get("tesseract_cmd")
    tessdata = os.environ.get("LICENSE_TESSDATA_DIR") or cfg.get("tessdata_dir")
    tessdata_path = Path(tessdata)
    if not tessdata_path.is_absolute():
        tessdata_path = (_PROJECT_ROOT / tessdata_path).resolve()
    cfg["tesseract_cmd"] = cmd
    cfg["tessdata_dir"] = str(tessdata_path)
    return cfg


def language_for_field(field_name: str, explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit
    if field_name == "name_ar":
        return "ara"
    if field_name in _LATIN_FIELDS:
        return "eng"
    return "eng"


class TesseractEngine(OcrEngine):
    def __init__(self) -> None:
        self._cfg = _load_config()
        self._version = ""
        self._initialized = False

    def _apply_config(self) -> None:
        pytesseract.pytesseract.tesseract_cmd = self._cfg["tesseract_cmd"]
        self._tessdata = self._cfg["tessdata_dir"]
        self._psm = int(self._cfg.get("default_psm", 7))

    def cold_init(self) -> float:
        t0 = time.perf_counter()
        self._apply_config()
        self._version = str(pytesseract.get_tesseract_version())
        self._initialized = True
        return (time.perf_counter() - t0) * 1000.0

    def recognize(self, image_path: str, field_name: str, language: str) -> OcrResult:
        if not self._initialized:
            self.cold_init()
        lang = language_for_field(field_name, language or None)
        t0 = time.perf_counter()
        img = Image.open(image_path)
        config = f"--tessdata-dir {self._tessdata} --psm {self._psm}"
        raw = pytesseract.image_to_string(img, lang=lang, config=config)
        data = pytesseract.image_to_data(
            img, lang=lang, config=config, output_type=pytesseract.Output.DICT
        )
        confs = [
            float(c)
            for c, txt in zip(data["conf"], data["text"])
            if txt and str(c) != "-1"
        ]
        confidence: Optional[float] = None
        if confs:
            confidence = sum(confs) / len(confs) / 100.0
        runtime_ms = (time.perf_counter() - t0) * 1000.0
        return OcrResult(
            raw_text=raw.strip(),
            confidence=confidence,
            runtime_ms=runtime_ms,
            engine="tesseract",
            engine_version=self._version,
            model=f"tessdata/{lang}.traineddata",
            language=lang,
        )

    def metadata(self) -> dict[str, Any]:
        return {
            "engine": "tesseract",
            "tesseract_cmd": self._cfg["tesseract_cmd"],
            "tessdata_dir": self._cfg["tessdata_dir"],
            "default_psm": self._cfg.get("default_psm", 7),
            "engine_version": self._version,
        }
