from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from src.dynamic.features import CropFeatures

FIELD_GROUP = {
    "license_number": "LICENSE_NUMBER",
    "name_en": "NAME_EN",
    "nationality": "NATIONALITY",
    "date_of_birth": "DATES",
    "issue_date": "DATES",
    "expiry_date": "DATES",
    "place_of_issue": "PLACE_OF_ISSUE",
}

# Maps to src.preprocess.english_variants.VARIANTS keys
VARIANT_RAW = "P0_RAW"
VARIANT_PAD = "P1_PAD"
VARIANT_GRAY_PAD = "P2_GRAY_PAD"
VARIANT_UP2 = "P3_UP2_GRAY_PAD"
VARIANT_UP3 = "P4_UP3_GRAY_PAD"
VARIANT_CLAHE_UP2 = "P5_CLAHE_UP2_PAD"
VARIANT_SHARP_UP2 = "P6_SHARP_UP2_PAD"
VARIANT_OTSU_UP2 = "P7_OTSU_UP2_PAD"


@dataclass(frozen=True)
class DynamicThresholds:
    border_clearance_pad: float = 5.0
    edge_ink_pad: float = 0.08
    text_height_up3: float = 11.0
    text_height_up2: float = 17.0
    contrast_clahe: float = 32.0
    allow_otsu: bool = False


@dataclass(frozen=True)
class EngineRoute:
    engine: str  # tesseract | rapidocr_en
    psm: Optional[int] = None
    whitelist: Optional[str] = None
    whitelist_label: str = "none"


@dataclass(frozen=True)
class Policy:
    policy_id: str
    field_group: str
    engine: EngineRoute
    preprocess_mode: str  # fixed | dynamic
    fixed_variant: str = VARIANT_RAW

    def to_dict(self) -> dict[str, Any]:
        return {
            "policy_id": self.policy_id,
            "field_group": self.field_group,
            "engine": self.engine.engine,
            "psm": self.engine.psm,
            "whitelist_label": self.engine.whitelist_label,
            "preprocess_mode": self.preprocess_mode,
            "fixed_variant": self.fixed_variant,
        }


def choose_variant(
    field_group: str,
    features: CropFeatures,
    mode: str,
    fixed: str,
    thresholds: DynamicThresholds,
) -> str:
    if mode == "fixed":
        return fixed
    if field_group == "DATES" and fixed == VARIANT_RAW:
        return VARIANT_RAW

    need_pad = (
        features.min_border_clearance < thresholds.border_clearance_pad
        or max(
            features.edge_ink_left,
            features.edge_ink_right,
            features.edge_ink_top,
            features.edge_ink_bottom,
        )
        > thresholds.edge_ink_pad
    )
    need_up3 = features.estimated_text_height < thresholds.text_height_up3
    need_up2 = features.estimated_text_height < thresholds.text_height_up2
    need_clahe = features.contrast_std < thresholds.contrast_clahe

    if field_group == "NAME_EN":
        if need_up3:
            variant = VARIANT_UP3
        elif need_up2:
            variant = VARIANT_CLAHE_UP2 if need_clahe else VARIANT_UP2
        elif need_clahe:
            variant = VARIANT_CLAHE_UP2
        elif need_pad:
            variant = VARIANT_PAD
        else:
            variant = VARIANT_RAW
        if need_pad and variant == VARIANT_RAW:
            variant = VARIANT_PAD
        return variant

    if field_group == "PLACE_OF_ISSUE":
        return VARIANT_PAD if need_pad else VARIANT_RAW

    if field_group == "LICENSE_NUMBER":
        if need_up2:
            return VARIANT_UP2
        return VARIANT_RAW

    if field_group == "NATIONALITY":
        return VARIANT_PAD if need_pad else VARIANT_RAW

    if field_group == "DATES":
        return VARIANT_RAW

    if thresholds.allow_otsu and need_clahe and need_up2:
        return VARIANT_OTSU_UP2
    if need_up2 and need_clahe:
        return VARIANT_CLAHE_UP2
    if need_up2:
        return VARIANT_UP2
    if need_pad:
        return VARIANT_PAD
    return VARIANT_RAW


def ocr5_policies() -> dict[str, Policy]:
    wl_digits = "0123456789"
    return {
        "LICENSE_NUMBER": Policy(
            "ocr5_license",
            "LICENSE_NUMBER",
            EngineRoute("tesseract", 7, wl_digits, "digits"),
            "fixed",
            VARIANT_RAW,
        ),
        "DATES": Policy(
            "ocr5_dates",
            "DATES",
            EngineRoute("rapidocr_en", None, None, "none"),
            "fixed",
            VARIANT_RAW,
        ),
        "NAME_EN": Policy(
            "ocr5_name_en",
            "NAME_EN",
            EngineRoute("rapidocr_en", None, None, "none"),
            "fixed",
            VARIANT_RAW,
        ),
        "NATIONALITY": Policy(
            "ocr5_nationality",
            "NATIONALITY",
            EngineRoute("tesseract", 13, None, "none"),
            "fixed",
            VARIANT_RAW,
        ),
        "PLACE_OF_ISSUE": Policy(
            "ocr5_place",
            "PLACE_OF_ISSUE",
            EngineRoute("rapidocr_en", None, None, "none"),
            "fixed",
            VARIANT_PAD,
        ),
    }


def candidate_policies(field_group: str) -> list[tuple[Policy, DynamicThresholds]]:
    wl_alnum = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    wl_digits = "0123456789"
    wl_date = "0123456789/"
    base = ocr5_policies().get(field_group)
    out: list[tuple[Policy, DynamicThresholds]] = []
    if base:
        out.append((base, DynamicThresholds()))

    if field_group == "LICENSE_NUMBER":
        for psm in (7, 13):
            for wl, label in ((wl_alnum, "alnum"), (wl_digits, "digits"), (None, "none")):
                out.append(
                    (
                        Policy(
                            f"tess_psm{psm}_{label}_dyn",
                            field_group,
                            EngineRoute("tesseract", psm, wl, label),
                            "dynamic",
                            VARIANT_RAW,
                        ),
                        DynamicThresholds(),
                    )
                )
    elif field_group == "DATES":
        out.append(
            (
                Policy(
                    "rapid_raw_fixed",
                    field_group,
                    EngineRoute("rapidocr_en", None, None, "none"),
                    "fixed",
                    VARIANT_RAW,
                ),
                DynamicThresholds(),
            )
        )
        out.append(
            (
                Policy(
                    f"tess_psm7_date_dyn",
                    field_group,
                    EngineRoute("tesseract", 7, wl_date, "date"),
                    "dynamic",
                    VARIANT_RAW,
                ),
                DynamicThresholds(),
            )
        )
    elif field_group == "NAME_EN":
        for eng, psm in (("rapidocr_en", None), ("tesseract", 7), ("tesseract", 13)):
            out.append(
                (
                    Policy(
                        f"{eng}_psm{psm or 0}_dyn",
                        field_group,
                        EngineRoute(eng, psm, None, "none"),
                        "dynamic",
                        VARIANT_RAW,
                    ),
                    DynamicThresholds(),
                )
            )
        out.append(
            (
                Policy(
                    "rapid_pad_fixed",
                    field_group,
                    EngineRoute("rapidocr_en", None, None, "none"),
                    "fixed",
                    VARIANT_PAD,
                ),
                DynamicThresholds(),
            )
        )
        out.append(
            (
                Policy(
                    "rapid_up2_fixed",
                    field_group,
                    EngineRoute("rapidocr_en", None, None, "none"),
                    "fixed",
                    VARIANT_UP2,
                ),
                DynamicThresholds(),
            )
        )
    elif field_group == "NATIONALITY":
        for psm in (7, 13):
            out.append(
                (
                    Policy(
                        f"tess_psm{psm}_dyn",
                        field_group,
                        EngineRoute("tesseract", psm, None, "none"),
                        "dynamic",
                        VARIANT_RAW,
                    ),
                    DynamicThresholds(),
                )
            )
    elif field_group == "PLACE_OF_ISSUE":
        for variant in (VARIANT_RAW, VARIANT_PAD, VARIANT_UP2):
            out.append(
                (
                    Policy(
                        f"rapid_{variant}",
                        field_group,
                        EngineRoute("rapidocr_en", None, None, "none"),
                        "fixed",
                        variant,
                    ),
                    DynamicThresholds(),
                )
            )

    # threshold variants for dynamic policies (train-tuned)
    grid: list[DynamicThresholds] = [
        DynamicThresholds(5, 0.08, 11, 17, 32, False),
        DynamicThresholds(3, 0.06, 10, 15, 28, False),
        DynamicThresholds(8, 0.10, 12, 19, 38, False),
    ]
    dynamic_only = [p for p in out if p[0].preprocess_mode == "dynamic"]
    out = [p for p in out if p[0].preprocess_mode == "fixed"]
    for pol, _ in dynamic_only:
        for th in grid:
            out.append((pol, th))
    return out
