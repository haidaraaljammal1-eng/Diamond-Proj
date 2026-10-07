"""Primary-first MRZ detection with conservative fallback (MRZ-A11)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from mrz_detect_td3 import TD3DetectionResult, detect_td3_mrz_pair, load_params
from mrz_detect_td3_fallback import FallbackDiagnostics, detect_td3_mrz_fallback, load_fallback_params


@dataclass
class OrchestratedDetection:
    detector_path: str  # PRIMARY | FALLBACK | NONE
    primary: TD3DetectionResult
    fallback: TD3DetectionResult | None
    fallback_diagnostics: FallbackDiagnostics | None
    detection: TD3DetectionResult
    fallback_invoked: bool
    coordinate_mapping: dict[str, Any] = field(default_factory=dict)


def detect_mrz_orchestrated(
    image_bgr: np.ndarray,
    params: dict | None = None,
    fallback_params: dict | None = None,
) -> OrchestratedDetection:
    params = params or load_params()
    fallback_params = fallback_params or load_fallback_params()

    primary = detect_td3_mrz_pair(image_bgr, params)
    if primary.status == "MRZ_FOUND":
        return OrchestratedDetection(
            detector_path="PRIMARY",
            primary=primary,
            fallback=None,
            fallback_diagnostics=None,
            detection=primary,
            fallback_invoked=False,
            coordinate_mapping={"scale": 1.0, "source": "primary"},
        )

    fb, fb_diag = detect_td3_mrz_fallback(image_bgr, params, fallback_params)
    mapping = {
        "working_scale": fb_diag.working_scale,
        "working_wh": fb_diag.working_wh,
        "original_wh": fb_diag.original_wh,
        "crops_from_deskewed_original_resolution": True,
        "ocr_source": "deskewed_original_bgr_not_working_copy",
    }
    if fb.status == "MRZ_FOUND":
        return OrchestratedDetection(
            detector_path="FALLBACK",
            primary=primary,
            fallback=fb,
            fallback_diagnostics=fb_diag,
            detection=fb,
            fallback_invoked=True,
            coordinate_mapping=mapping,
        )

    return OrchestratedDetection(
        detector_path="NONE",
        primary=primary,
        fallback=fb,
        fallback_diagnostics=fb_diag,
        detection=primary,
        fallback_invoked=True,
        coordinate_mapping=mapping,
    )
