"""Final English OCR inference pipeline (OCR_ENGLISH_V1)."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Optional

from src.inference.confidence_calib import CalibratedThresholds
from src.inference.date_fallback import DateCandidate, select_date_output
from src.inference.license_policy import recognize_license
from src.inference.nationality_policy import recognize_nationality
from src.inference.place_policy import recognize_place
from src.preprocess.english_variants import materialize_variant
from src.scoring.normalize import normalize_for_field
from src.validators.date_strict import validate_date_text
from src.validators.english_fields import validate_field
from src.workers.ppocrv5_client import Ppocrv5WorkerClient

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_CONFIG_PATH = _PROJECT_ROOT / "config" / "ocr_final_english_v1.json"
_DATE_FIELDS = frozenset({"date_of_birth", "issue_date", "expiry_date"})
_LICENSE_WL = "0123456789"
_ENGLISH_FIELDS = frozenset(
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
_NAME_CROP_FILES = {
    "license_number": "01_license_number.png",
    "name_en": "03_name_en.png",
    "nationality": "04_nationality.png",
    "date_of_birth": "05_date_of_birth.png",
    "issue_date": "06_issue_date.png",
    "expiry_date": "07_expiry_date.png",
    "place_of_issue": "08_place_of_issue.png",
}


def load_final_config() -> dict[str, Any]:
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def _map_status(internal: str) -> str:
    if internal in ("ACCEPT", "ACCEPTED"):
        return "ACCEPT"
    if internal == "REJECT":
        return "REJECT"
    return "FLAG_UNCERTAIN"


class EnglishOcrPipeline:
    """Production-style router: field_name + crop path only (no document ids)."""

    def __init__(
        self,
        config: Optional[dict[str, Any]] = None,
        cache_dir: Optional[Path] = None,
    ) -> None:
        self.config = config or load_final_config()
        self.cache_dir = cache_dir or (_PROJECT_ROOT / "output" / "ocr_english_v1_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        from src.engines.rapidocr_english import RapidOcrEnglishEngine
        from src.engines.tesseract_english import TesseractEnglishEngine

        self._tess = TesseractEnglishEngine()
        self._rapid = RapidOcrEnglishEngine()
        self._tess.cold_init()
        self._rapid.cold_init()
        cal = self.config["date_calibration_frozen"]
        self._date_calib = CalibratedThresholds(
            rapid_min_confidence=cal["rapid_min_confidence"],
            tesseract_min_confidence=cal["tesseract_min_confidence"],
            rapid_median_correct=cal["rapid_median_correct"],
            tesseract_median_correct=cal["tesseract_median_correct"],
        )
        self._v5_width = int(self.config["field_routing"]["name_en"]["rec_width"])
        runtime_cfg = self.config.get("runtime", {})
        worker_on = runtime_cfg.get("ppocrv5_worker", {}).get("enabled", True)
        self._v5_client = Ppocrv5WorkerClient(enabled=worker_on)

    def _preprocess(
        self, crop_path: Path, variant: str, cache_key: Optional[str] = None
    ) -> Path:
        key = cache_key or hashlib_hex(crop_path)
        return materialize_variant(crop_path, variant, self.cache_dir, key)

    def _tesseract(
        self,
        image_path: Path,
        psm: int,
        whitelist: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._tess.recognize_with_config(str(image_path), psm, whitelist)

    def _rapid_en(self, image_path: Path) -> dict[str, Any]:
        return self._rapid.recognize(str(image_path), "name_en")

    def _ppocrv5(self, image_path: Path) -> dict[str, Any]:
        resp = self._v5_client.recognize(str(image_path), "name_en")
        if resp.get("status") == "ENGINE_ERROR":
            return {
                "raw_text": "",
                "confidence": None,
                "runtime_ms": resp.get("runtime_ms", 0.0),
                "engine": "rapidocr_ppocrv5_en",
                "error": resp.get("error"),
            }
        return {
            "raw_text": resp.get("raw_text", ""),
            "confidence": resp.get("confidence"),
            "runtime_ms": resp.get("runtime_ms", 0.0),
            "engine": "rapidocr_ppocrv5_en",
        }

    def close(self) -> None:
        self._v5_client.close()

    def recognize_field(self, field_name: str, crop_path: str | Path) -> dict[str, Any]:
        if field_name not in _ENGLISH_FIELDS:
            raise ValueError(f"Unsupported field: {field_name}")
        crop_path = Path(crop_path)
        t0 = time.perf_counter()
        cache_key = hashlib_hex(crop_path)

        if field_name == "license_number":
            lic_cfg = self.config.get("field_routing", {}).get("license_number", {})
            trigger = float(lic_cfg.get("min_conf_trigger", 0.25))

            def _lic_preprocess(cpath: Path, variant: str, key: str) -> Path:
                return self._preprocess(cpath, variant, key)

            best, _cands, decision = recognize_license(
                crop_path,
                cache_key,
                _lic_preprocess,
                self._tesseract,
                min_conf_trigger=trigger,
            )
            raw = best.text
            vstat = validate_field(field_name, raw)
            if vstat == "ACCEPT":
                status = "ACCEPT"
            elif raw:
                status = "FLAG_UNCERTAIN"
            else:
                status = "REJECT"
            return self._result(
                field_name,
                raw,
                best.confidence,
                vstat,
                "tesseract",
                "tessdata/eng.traineddata",
                best.preprocessing,
                (time.perf_counter() - t0) * 1000.0,
                status,
                {
                    "psm": best.psm,
                    "whitelist": _LICENSE_WL,
                    "license_decision": decision,
                    "ocr_raw": best.raw_text,
                },
            )

        if field_name in _DATE_FIELDS:
            return self._recognize_date(field_name, crop_path, cache_key, t0)

        if field_name == "name_en":
            img = self._preprocess(crop_path, "P0_RAW", cache_key)
            o = self._ppocrv5(img)
            raw = o.get("raw_text", "").strip()
            vstat = validate_field(field_name, raw)
            if not raw:
                status = "FLAG_UNCERTAIN"
            elif vstat == "REJECT":
                status = "REJECT"
            elif vstat == "ACCEPT":
                status = "ACCEPT"
            else:
                status = "FLAG_UNCERTAIN"
            return self._result(
                field_name,
                raw,
                o.get("confidence"),
                vstat,
                "rapidocr_ppocrv5_en",
                "en_PP-OCRv5_rec_mobile.onnx",
                "P0_RAW",
                (time.perf_counter() - t0) * 1000.0,
                status,
                {"rec_width": self._v5_width, "recognition_only": True},
            )

        if field_name == "nationality":
            nat_cfg = self.config.get("field_routing", {}).get("nationality", {})
            trigger = float(nat_cfg.get("min_conf_trigger", 0.35))

            def _nat_preprocess(cpath: Path, variant: str, key: str) -> Path:
                return self._preprocess(cpath, variant, key)

            best, _cands, decision = recognize_nationality(
                crop_path,
                cache_key,
                _nat_preprocess,
                self._tesseract,
                min_conf_trigger=trigger,
            )
            if best.quality < 0 or not best.text:
                img = self._preprocess(crop_path, "P3_UP2_GRAY_PAD", f"{cache_key}_rapid_fb")
                rapid_o = self._rapid_en(img)
                from src.inference.nationality_policy import (
                    extract_nationality_text,
                    nationality_quality,
                )

                rapid_text = extract_nationality_text(rapid_o.get("raw_text", ""))
                rapid_q = nationality_quality(
                    rapid_text,
                    rapid_o.get("confidence"),
                    "P3_UP2_GRAY_PAD",
                    [c.text for c in _cands if c.text],
                )
                if rapid_q > best.quality:
                    best = type(best)(
                        "rapid_fb",
                        "P3_UP2_GRAY_PAD",
                        0,
                        rapid_o.get("raw_text", ""),
                        rapid_text,
                        rapid_o.get("confidence"),
                        rapid_q,
                    )
                    decision = "rapid_fallback"
            raw = normalize_for_field(field_name, best.text)
            vstat = validate_field(field_name, raw)
            status = "ACCEPT" if vstat == "ACCEPT" else "FLAG_UNCERTAIN"
            if vstat == "ACCEPT" and best.quality < 15.0:
                status = "FLAG_UNCERTAIN"
            return self._result(
                field_name,
                raw,
                best.confidence,
                vstat,
                "tesseract",
                "tessdata/eng.traineddata",
                best.preprocessing,
                (time.perf_counter() - t0) * 1000.0,
                status,
                {
                    "psm": best.psm,
                    "nationality_decision": decision,
                    "ocr_raw": best.raw_text,
                },
            )

        if field_name == "place_of_issue":
            place_cfg = self.config.get("field_routing", {}).get("place_of_issue", {})
            trigger = float(place_cfg.get("min_conf_trigger", 0.3))

            def _place_preprocess(cpath: Path, variant: str, key: str) -> Path:
                return self._preprocess(cpath, variant, key)

            best, _cands, decision = recognize_place(
                crop_path,
                cache_key,
                _place_preprocess,
                self._tesseract,
                self._rapid_en,
                min_conf_trigger=trigger,
            )
            raw = normalize_for_field(field_name, best.text)
            vstat = validate_field(field_name, raw)
            status = "ACCEPT" if vstat == "ACCEPT" else "FLAG_UNCERTAIN"
            engine = best.engine
            model = (
                "tessdata/eng.traineddata"
                if engine == "tesseract"
                else "en_PP-OCRv4_rec_infer.onnx"
            )
            return self._result(
                field_name,
                raw,
                best.confidence,
                vstat,
                engine,
                model,
                best.preprocessing,
                (time.perf_counter() - t0) * 1000.0,
                status,
                {
                    "psm": best.psm,
                    "place_decision": decision,
                    "ocr_raw": best.raw_text,
                },
            )

        raise ValueError(field_name)

    def _recognize_date(
        self,
        field_name: str,
        crop_path: Path,
        cache_key: str,
        t0: float,
    ) -> dict[str, Any]:
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
            raw = normalize_for_field(field_name, primary.raw_text.strip())
            vstat = validate_field(field_name, raw)
            return self._result(
                field_name,
                raw,
                p.get("confidence"),
                vstat,
                "date_policy",
                "en_PP-OCRv4_rec_infer.onnx",
                "P0_RAW",
                (time.perf_counter() - t0) * 1000.0,
                "ACCEPT",
                {
                    "decision": "primary_accept",
                    "selected_candidate": "date_primary",
                    "fallback_skipped": True,
                },
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
        raw = normalize_for_field(field_name, sel.get("final_text", ""))
        vstat = validate_field(field_name, raw) if raw else "REJECT"
        status = _map_status(sel.get("status", "FLAG_UNCERTAIN"))
        if status == "ACCEPT" and vstat != "ACCEPT":
            status = "FLAG_UNCERTAIN"
        if not raw:
            status = "FLAG_UNCERTAIN"
        return self._result(
            field_name,
            raw,
            p.get("confidence"),
            vstat,
            "date_policy",
            "en_PP-OCRv4_rec_infer.onnx + fallbacks",
            "P0_RAW",
            (time.perf_counter() - t0) * 1000.0,
            status,
            {"decision": sel.get("decision"), "selected_candidate": sel.get("selected_candidate")},
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
            "normalized_text": normalize_for_field(field_name, raw_text),
            "confidence": confidence,
            "validator_status": validator_status,
            "engine": engine,
            "model": model,
            "preprocessing": preprocessing,
            "runtime_ms": runtime_ms,
            **extra,
        }

    def recognize_license_english(self, crop_directory: str | Path) -> dict[str, Any]:
        crop_directory = Path(crop_directory)
        fields_out: dict[str, Any] = {}
        total_ms = 0.0
        for fname, crop_file in _NAME_CROP_FILES.items():
            path = crop_directory / crop_file
            if not path.is_file():
                fields_out[fname] = {
                    "field_name": fname,
                    "status": "REJECT",
                    "raw_text": "",
                    "error": f"missing crop: {crop_file}",
                }
                continue
            rec = self.recognize_field(fname, path)
            fields_out[fname] = rec
            total_ms += rec.get("runtime_ms", 0.0)
        return {
            "crop_directory": str(crop_directory),
            "fields": fields_out,
            "name_ar": {"field_name": "name_ar", "status": "NOT_OCR_PROCESSED"},
            "total_runtime_ms": total_ms,
        }


def hashlib_hex(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()
