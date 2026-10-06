from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CalibratedThresholds:
    rapid_min_confidence: float
    tesseract_min_confidence: float
    rapid_median_correct: float
    tesseract_median_correct: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "rapid_min_confidence": self.rapid_min_confidence,
            "tesseract_min_confidence": self.tesseract_min_confidence,
            "rapid_median_correct": self.rapid_median_correct,
            "tesseract_median_correct": self.tesseract_median_correct,
        }


def calibrate_from_train_samples(samples: list[dict[str, Any]]) -> CalibratedThresholds:
    """Train-fold only: use labeled correctness to set conservative confidence floors."""
    rapid_ok = [
        s["confidence"]
        for s in samples
        if s.get("engine") == "rapidocr_en"
        and s.get("confidence") is not None
        and s.get("train_correct")
    ]
    rapid_all = [
        s["confidence"]
        for s in samples
        if s.get("engine") == "rapidocr_en" and s.get("confidence") is not None
    ]
    tess_ok = [
        s["confidence"]
        for s in samples
        if s.get("engine") == "tesseract"
        and s.get("confidence") is not None
        and s.get("train_correct")
    ]
    tess_all = [
        s["confidence"]
        for s in samples
        if s.get("engine") == "tesseract" and s.get("confidence") is not None
    ]

    def floor(ok: list[float], all_vals: list[float], default: float) -> float:
        if ok:
            sorted_ok = sorted(ok)
            p25 = sorted_ok[max(0, int(0.25 * (len(sorted_ok) - 1)))]
            return max(0.35, p25 * 0.9)
        if all_vals:
            return max(0.45, min(all_vals))
        return default

    def median(vals: list[float], default: float) -> float:
        if not vals:
            return default
        s = sorted(vals)
        return s[len(s) // 2]

    return CalibratedThresholds(
        rapid_min_confidence=floor(rapid_ok, rapid_all, 0.55),
        tesseract_min_confidence=floor(tess_ok, tess_all, 0.45),
        rapid_median_correct=median(rapid_ok, 0.75),
        tesseract_median_correct=median(tess_ok, 0.65),
    )
