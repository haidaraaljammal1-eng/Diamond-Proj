"""OCR_ENGLISH_V1_3_1_TWO_FIELD — PP primary + Rapid consensus fallback on PP_NO_DIGITS."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Optional

from services.uae_license_api.two_field.license_number_recognizer import LicenseNumberRecognizer
from services.uae_license_api.two_field.ocr_pipeline_v1_2 import TwoFieldOcrPipelineV12, hashlib_hex
from src.workers.ppocrv5_client import Ppocrv5WorkerClient

RELEASE_ID = "OCR_ENGLISH_V1_3_1_TWO_FIELD"


class TwoFieldOcrPipeline(TwoFieldOcrPipelineV12):
    """V1.3.1: PP-primary licence number; Rapid fallback on PP_NO_DIGITS; expiry V1.2."""

    def __init__(self, cache_dir: Optional[Path] = None) -> None:
        super().__init__(cache_dir=cache_dir)
        self._pp_client = Ppocrv5WorkerClient(enabled=True)
        lic_cache = self.cache_dir / "license_number_v1_3"
        self._license_recognizer = LicenseNumberRecognizer(
            pp_client=self._pp_client,
            tesseract=self._tesseract,
            rapid=self._rapid_en,
            cache_dir=lic_cache,
        )

    def close(self) -> None:
        self._pp_client.close()
        super().close()

    @property
    def ppocrv5_client(self) -> Ppocrv5WorkerClient:
        return self._pp_client

    def recognize_field(self, field_name: str, crop_path: str | Path) -> dict[str, Any]:
        if field_name == "license_number":
            return self._recognize_license_number_v13(Path(crop_path))
        return super().recognize_field(field_name, crop_path)

    def _recognize_license_number_v13(self, crop_path: Path) -> dict[str, Any]:
        t0 = time.perf_counter()
        cache_key = hashlib_hex(crop_path)
        rec = self._license_recognizer.recognize(crop_path, cache_key)
        extra = {
            "license_recognition": "v1_3_1_pp_stability_rapid_fallback",
            "reject_reason": rec.reject_reason,
            "stable_pp_digits": rec.stable_pp_digits,
            "pp_variants": [
                {
                    "variant_id": v.variant_id,
                    "preprocess": v.preprocess,
                    "digits": v.digits,
                    "confidence": v.confidence,
                    "runtime_ms": v.runtime_ms,
                }
                for v in rec.pp_variants
            ],
            "rapid_variants": [
                {
                    "variant_id": v.variant_id,
                    "preprocess": v.preprocess,
                    "digits": v.digits,
                    "confidence": v.confidence,
                    "runtime_ms": v.runtime_ms,
                }
                for v in rec.rapid_variants
            ],
            "veto_tesseract": rec.veto_tesseract,
            "veto_rapidocr": rec.veto_rapidocr,
            **rec.metadata,
        }
        via_rapid = rec.metadata.get("accept_path") in (
            "rapid_fallback",
            "rapid_pp_raw_corroboration",
        )
        engine = "rapid_en_v1_3_1_consensus" if via_rapid else "ppocrv5_en_stability"
        model = "rapidocr_en" if via_rapid else "en_PP-OCRv5_rec_mobile.onnx"
        if rec.status != "ACCEPT":
            return self._result(
                "license_number",
                "",
                rec.confidence,
                "REJECT",
                engine if not via_rapid else "ppocrv5_en_stability",
                "en_PP-OCRv5_rec_mobile.onnx",
                rec.preprocessing,
                rec.runtime_ms or (time.perf_counter() - t0) * 1000.0,
                "REJECT",
                extra,
            )
        return self._result(
            "license_number",
            rec.digits,
            rec.confidence,
            "ACCEPT",
            engine,
            model,
            rec.preprocessing,
            rec.runtime_ms or (time.perf_counter() - t0) * 1000.0,
            "ACCEPT",
            extra,
        )
