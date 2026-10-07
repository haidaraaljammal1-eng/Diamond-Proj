"""OCR_ENGLISH_V1_2_TWO_FIELD — licence number + expiry date only."""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Optional

from services.uae_license_api.runtime_paths import LICENSE_ROOT, OCR_ENGINES_ROOT

_V12_ROOT = LICENSE_ROOT / "frozen" / "ocr_v1_2"
_V11_ROOT = OCR_ENGINES_ROOT
if str(_V11_ROOT) not in sys.path:
    sys.path.insert(0, str(_V11_ROOT))

from src.inference.confidence_calib import CalibratedThresholds  # noqa: E402
from src.inference.date_fallback import DateCandidate, select_date_output  # noqa: E402
from src.inference.license_policy import recognize_license  # noqa: E402
from src.preprocess.english_variants import materialize_variant  # noqa: E402
from src.scoring.normalize import normalize_for_field  # noqa: E402
from src.validators.date_strict import validate_date_text  # noqa: E402
from src.validators.english_fields import validate_field  # noqa: E402

_DIGITS_ONLY = re.compile(r"^[0-9]+$")


def load_two_field_config() -> dict[str, Any]:
    path = _V12_ROOT / "config" / "two_field_label_zones.json"
    return json.loads(path.read_text(encoding="utf-8"))


def hashlib_hex(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


class TwoFieldOcrPipelineV12:
    """V1.2 baseline (preserved): Tesseract-primary licence number + expiry date."""

    def __init__(self, cache_dir: Optional[Path] = None) -> None:
        self.config = load_two_field_config()
        self.cache_dir = cache_dir or (_V12_ROOT / "output" / "ocr_two_field_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        from src.engines.rapidocr_english import RapidOcrEnglishEngine
        from src.engines.tesseract_english import TesseractEnglishEngine

        self._tess = TesseractEnglishEngine()
        self._rapid = RapidOcrEnglishEngine()
        self._tess.cold_init()
        self._rapid.cold_init()
        ocr_cfg_path = _V11_ROOT / "config" / "ocr_final_english_v1.json"
        ocr_cfg = json.loads(ocr_cfg_path.read_text(encoding="utf-8"))
        cal = ocr_cfg["date_calibration_frozen"]
        self._date_calib = CalibratedThresholds(
            rapid_min_confidence=cal["rapid_min_confidence"],
            tesseract_min_confidence=cal["tesseract_min_confidence"],
            rapid_median_correct=cal["rapid_median_correct"],
            tesseract_median_correct=cal["tesseract_median_correct"],
        )

    def close(self) -> None:
        return

    def _preprocess(self, crop_path: Path, variant: str, cache_key: str) -> Path:
        return materialize_variant(crop_path, variant, self.cache_dir, cache_key)

    def _tesseract(self, image_path: Path, psm: int, whitelist: Optional[str]) -> dict[str, Any]:
        return self._tess.recognize_with_config(str(image_path), psm, whitelist)

    def _rapid_en(self, image_path: Path) -> dict[str, Any]:
        return self._rapid.recognize(str(image_path), "name_en")

    def recognize_field(self, field_name: str, crop_path: str | Path) -> dict[str, Any]:
        if field_name not in ("license_number", "expiry_date"):
            raise ValueError(f"V1.2 unsupported field: {field_name}")
        crop_path = Path(crop_path)
        t0 = time.perf_counter()
        cache_key = hashlib_hex(crop_path)
        if field_name == "license_number":
            return self._recognize_license_number(crop_path, cache_key, t0)
        return self._recognize_expiry(crop_path, cache_key, t0)

    def _recognize_license_number(self, crop_path: Path, cache_key: str, t0: float) -> dict[str, Any]:
        trigger = 0.35

        def _pre(cpath: Path, variant: str, key: str) -> Path:
            return self._preprocess(cpath, variant, key)

        best, _cands, decision = recognize_license(
            crop_path,
            cache_key,
            _pre,
            self._tesseract,
            min_conf_trigger=trigger,
        )
        raw_stripped = (best.raw_text or "").strip()
        text = (best.text or "").strip()
        if re.search(r"[A-Za-z]", raw_stripped):
            return self._result(
                "license_number",
                "",
                best.confidence,
                "REJECT",
                "tesseract",
                "tessdata/eng.traineddata",
                best.preprocessing,
                (time.perf_counter() - t0) * 1000.0,
                "REJECT",
                {"license_decision": decision, "reject_reason": "LICENSE_NUMBER_READ_FAILED"},
            )
        if not text or not _DIGITS_ONLY.match(text):
            return self._result(
                "license_number",
                "",
                best.confidence,
                "REJECT",
                "tesseract",
                "tessdata/eng.traineddata",
                best.preprocessing,
                (time.perf_counter() - t0) * 1000.0,
                "REJECT",
                {"license_decision": decision, "reject_reason": "LICENSE_NUMBER_READ_FAILED"},
            )
        vstat = validate_field("license_number", text)
        status = "ACCEPT" if vstat == "ACCEPT" else "REJECT"
        return self._result(
            "license_number",
            text,
            best.confidence,
            vstat,
            "tesseract",
            "tessdata/eng.traineddata",
            best.preprocessing,
            (time.perf_counter() - t0) * 1000.0,
            status,
            {"psm": best.psm, "license_decision": decision, "ocr_raw": best.raw_text},
        )

    def _recognize_expiry(self, crop_path: Path, cache_key: str, t0: float) -> dict[str, Any]:
        img0 = self._preprocess(crop_path, "P0_RAW", cache_key)
        p = self._rapid_en(img0)
        pv, _ = validate_date_text(p["raw_text"])
        primary = DateCandidate(
            "date_primary",
            "rapidocr_en",
            "P0_RAW",
            p["raw_text"],
            p.get("confidence"),
            pv,
            "",
        )
        if pv == "ACCEPT":
            raw = normalize_for_field("expiry_date", primary.raw_text.strip())
            vstat = validate_field("expiry_date", raw)
            if vstat == "ACCEPT":
                return self._result(
                    "expiry_date",
                    raw,
                    p.get("confidence"),
                    vstat,
                    "date_policy",
                    "en_PP-OCRv4_rec_infer.onnx",
                    "P0_RAW",
                    (time.perf_counter() - t0) * 1000.0,
                    "ACCEPT",
                    {"decision": "primary_accept"},
                )
        fallbacks = []
        for cid, eng, var, psm, wl in (
            ("date_fb_A", "tesseract", "P0_RAW", 7, "0123456789/-"),
            ("date_fb_B", "tesseract", "P0_RAW", 13, "0123456789/-"),
            ("date_fb_C", "rapidocr_en", "P1_PAD", None, None),
            ("date_fb_D", "rapidocr_en", "P3_UP2_GRAY_PAD", None, None),
        ):
            img = self._preprocess(crop_path, var, f"{cache_key}_{var}")
            if eng == "tesseract":
                o = self._tesseract(img, psm or 7, wl)
            else:
                o = self._rapid_en(img)
            fallbacks.append(
                DateCandidate(cid, eng, var, o["raw_text"], o.get("confidence"), "", "")
            )
        sel = select_date_output(primary, fallbacks, self._date_calib)
        raw = normalize_for_field("expiry_date", sel.get("final_text", ""))
        vstat = validate_field("expiry_date", raw) if raw else "REJECT"
        if vstat != "ACCEPT" or sel.get("status") not in ("ACCEPT", "ACCEPTED"):
            return self._result(
                "expiry_date",
                "",
                p.get("confidence"),
                "REJECT",
                "date_policy",
                "en_PP-OCRv4_rec_infer.onnx + fallbacks",
                "P0_RAW",
                (time.perf_counter() - t0) * 1000.0,
                "REJECT",
                {"decision": sel.get("decision"), "reject_reason": "incomplete_or_invalid_date"},
            )
        return self._result(
            "expiry_date",
            raw,
            p.get("confidence"),
            vstat,
            "date_policy",
            "en_PP-OCRv4_rec_infer.onnx + fallbacks",
            "P0_RAW",
            (time.perf_counter() - t0) * 1000.0,
            "ACCEPT",
            {"decision": sel.get("decision")},
        )

    def _result(
        self,
        field_name: str,
        raw_text: str,
        confidence: Optional[float],
        validator_status: str,
        engine: str,
        model: str,
        preprocessing: str,
        runtime_ms: float,
        status: str,
        extra: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "field_name": field_name,
            "status": status,
            "raw_text": raw_text,
            "normalized_text": normalize_for_field(field_name, raw_text) if raw_text else "",
            "confidence": confidence,
            "validator_status": validator_status,
            "engine": engine,
            "model": model,
            "preprocessing": preprocessing,
            "runtime_ms": runtime_ms,
            **extra,
        }
