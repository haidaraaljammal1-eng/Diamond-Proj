from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

import pytesseract
from PIL import Image

from src.engines.tesseract_engine import TesseractEngine


@dataclass(frozen=True)
class TessRunConfig:
    psm: int = 7
    whitelist: Optional[str] = None
    whitelist_label: str = "none"


class TesseractEnglishEngine(TesseractEngine):
    def recognize_with_config(
        self,
        image_path: str,
        psm: int,
        whitelist: Optional[str] = None,
    ) -> dict:
        if not self._initialized:
            self.cold_init()
        t0 = time.perf_counter()
        img = Image.open(image_path)
        config = f"--tessdata-dir {self._tessdata} --psm {psm}"
        if whitelist:
            config += f" -c tessedit_char_whitelist={whitelist}"
        lang = "eng"
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
        return {
            "raw_text": raw.strip(),
            "confidence": confidence,
            "runtime_ms": runtime_ms,
            "engine": "tesseract",
            "engine_version": self._version,
            "model": "tessdata/eng.traineddata",
            "language": "eng",
            "psm": psm,
            "whitelist": whitelist,
        }
