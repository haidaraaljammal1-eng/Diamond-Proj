"""V1.3.1 licence number: PP-OCRv5 primary + Rapid consensus fallback on PP_NO_DIGITS."""

from __future__ import annotations

import re
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional, Protocol

import cv2
import numpy as np

from src.inference.license_policy import _DIGITS_WL, extract_license_digits
from src.validators.english_fields import validate_field

_DIGITS_ONLY = re.compile(r"^[0-9]+$")
_UPSCALE_FACTOR = 2
_PAD_PX = 8
# Ignore single-digit PP noise when deciding if PP digit strings truly conflict.
_MIN_PP_SUBSTANTIAL_DIGITS = 4

PP_VARIANTS = (
    ("PP_RAW", "raw"),
    ("PP_CLAHE", "clahe"),
    ("PP_OTSU", "otsu"),
)

RAPID_FALLBACK_VARIANTS = (
    ("RAPID_RAW", "raw"),
    ("RAPID_CLAHE", "clahe"),
    ("RAPID_OTSU", "otsu"),
)


class PpocrClient(Protocol):
    def recognize(self, crop_path: str, field_name: str = "license_number") -> dict[str, Any]: ...


@dataclass
class PpVariantRead:
    variant_id: str
    preprocess: str
    raw_text: str
    digits: str
    confidence: Optional[float]
    runtime_ms: float
    image_path: str


@dataclass
class RapidVariantRead:
    variant_id: str
    preprocess: str
    raw_text: str
    digits: str
    confidence: Optional[float]
    runtime_ms: float
    image_path: str


@dataclass
class LicenseNumberRecognitionResult:
    status: str
    digits: str
    confidence: Optional[float]
    reject_reason: Optional[str]
    stable_pp_digits: Optional[str]
    pp_variants: list[PpVariantRead] = field(default_factory=list)
    rapid_variants: list[RapidVariantRead] = field(default_factory=list)
    veto_tesseract: Optional[str] = None
    veto_rapidocr: Optional[str] = None
    runtime_ms: float = 0.0
    preprocessing: str = "PP_V1_3_UP2_LANCZOS"
    metadata: dict[str, Any] = field(default_factory=dict)


def _pad_white(bgr: np.ndarray, pad: int = _PAD_PX) -> np.ndarray:
    return cv2.copyMakeBorder(
        bgr, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255)
    )


def _upscale_lanczos(bgr: np.ndarray, factor: int) -> np.ndarray:
    h, w = bgr.shape[:2]
    return cv2.resize(bgr, (w * factor, h * factor), interpolation=cv2.INTER_LANCZOS4)


def _materialize_pp_variant(bgr: np.ndarray, preprocess: str) -> np.ndarray:
    up = _upscale_lanczos(bgr, _UPSCALE_FACTOR)
    gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
    if preprocess == "raw":
        out = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    elif preprocess == "clahe":
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        out = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    elif preprocess == "otsu":
        _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        out = cv2.cvtColor(th, cv2.COLOR_GRAY2BGR)
    else:
        raise ValueError(f"unknown preprocess: {preprocess}")
    return _pad_white(out)


def _valid_digits(text: str) -> bool:
    return bool(text) and _DIGITS_ONLY.match(text) is not None


def native_digits_only(raw: str) -> str:
    """Strict digits-only from engine output (no O→0 or letter fixes)."""
    text = (raw or "").strip()
    return text if _valid_digits(text) else ""


def select_stable_pp_digits(variant_digits: list[str]) -> Optional[str]:
    """At least two variants must agree exactly on digits-only value."""
    valid = [d for d in variant_digits if _valid_digits(d)]
    if len(valid) < 2:
        return None
    counts = Counter(valid)
    best, n = counts.most_common(1)[0]
    if n >= 2:
        return best
    return None


def _substantial_pp_digit_values(variant_reads: list[PpVariantRead]) -> set[str]:
    return {
        r.digits
        for r in variant_reads
        if r.digits and len(r.digits) >= _MIN_PP_SUBSTANTIAL_DIGITS
    }


def _substantial_pp_digits_conflict(substantial: set[str]) -> bool:
    """True when two substantial PP reads disagree beyond a suffix skew (e.g. 62490527 vs 2490527)."""
    values = sorted(substantial, key=len)
    if len(values) <= 1:
        return False
    for i, left in enumerate(values):
        for right in values[i + 1 :]:
            if not (left.endswith(right) or right.endswith(left)):
                return True
    return False


def should_activate_rapid_fallback(
    reject_reason: Optional[str],
    variant_reads: list[PpVariantRead],
) -> bool:
    """Narrow Rapid fallback: PP no digits, or PP unstable without substantial digit conflict."""
    if reject_reason == "LICENSE_NUMBER_PP_NO_DIGITS":
        return True
    if reject_reason != "LICENSE_NUMBER_PP_UNSTABLE":
        return False
    substantial = _substantial_pp_digit_values(variant_reads)
    if len(substantial) <= 1:
        return True
    if not _substantial_pp_digits_conflict(substantial):
        return True
    return False


def resolve_pp_stability(
    variant_reads: list[PpVariantRead],
) -> tuple[Optional[str], Optional[str]]:
    digits_list = [r.digits for r in variant_reads]
    stable = select_stable_pp_digits(digits_list)
    if stable:
        return stable, None
    if not any(r.digits for r in variant_reads):
        return None, "LICENSE_NUMBER_PP_NO_DIGITS"
    return None, "LICENSE_NUMBER_PP_UNSTABLE"


def independent_veto(
    stable_pp: str,
    tesseract_digits: str,
    rapid_digits: str,
) -> Optional[str]:
    if not (_valid_digits(tesseract_digits) and _valid_digits(rapid_digits)):
        return None
    if tesseract_digits == rapid_digits and tesseract_digits != stable_pp:
        return "LICENSE_NUMBER_INDEPENDENT_VETO"
    return None


class LicenseNumberRecognizer:
    def __init__(
        self,
        pp_client: PpocrClient,
        tesseract: Callable[..., dict[str, Any]],
        rapid: Callable[[Path], dict[str, Any]],
        cache_dir: Path,
    ) -> None:
        self._pp = pp_client
        self._tesseract = tesseract
        self._rapid = rapid
        self._cache_dir = cache_dir
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def _write_variant(self, bgr: np.ndarray, key: str) -> Path:
        path = self._cache_dir / f"{key}.png"
        cv2.imwrite(str(path), bgr)
        return path

    def _read_pp(self, path: Path, variant_id: str, preprocess: str) -> PpVariantRead:
        t0 = time.perf_counter()
        resp = self._pp.recognize(str(path), field_name="license_number")
        ms = (time.perf_counter() - t0) * 1000.0
        if resp.get("status") == "ENGINE_ERROR":
            return PpVariantRead(
                variant_id=variant_id,
                preprocess=preprocess,
                raw_text="",
                digits="",
                confidence=None,
                runtime_ms=ms,
                image_path=str(path),
            )
        raw = (resp.get("raw_text") or "").strip()
        digits = native_digits_only(raw)
        return PpVariantRead(
            variant_id=variant_id,
            preprocess=preprocess,
            raw_text=raw,
            digits=digits,
            confidence=resp.get("confidence"),
            runtime_ms=resp.get("runtime_ms") or ms,
            image_path=str(path),
        )

    def _read_rapid(self, path: Path, variant_id: str, preprocess: str) -> RapidVariantRead:
        t0 = time.perf_counter()
        resp = self._rapid(path)
        ms = (time.perf_counter() - t0) * 1000.0
        raw = (resp.get("raw_text") or "").strip()
        digits = native_digits_only(raw)
        return RapidVariantRead(
            variant_id=variant_id,
            preprocess=preprocess,
            raw_text=raw,
            digits=digits,
            confidence=resp.get("confidence"),
            runtime_ms=ms,
            image_path=str(path),
        )

    def _try_rapid_fallback(
        self,
        bgr: np.ndarray,
        cache_key: str,
        pp_variants: list[PpVariantRead],
        tess_path: Path,
        t0: float,
    ) -> LicenseNumberRecognitionResult:
        rapid_reads: list[RapidVariantRead] = []
        for variant_id, preprocess in RAPID_FALLBACK_VARIANTS:
            img = _materialize_pp_variant(bgr, preprocess)
            path = self._write_variant(img, f"{cache_key}_{variant_id}")
            rapid_reads.append(self._read_rapid(path, variant_id, preprocess))

        stable_rapid = select_stable_pp_digits([r.digits for r in rapid_reads])
        accept_path = "rapid_fallback"
        if not stable_rapid:
            pp_raw = next(
                (r.digits for r in pp_variants if r.variant_id == "PP_RAW" and _valid_digits(r.digits)),
                "",
            )
            rapid_raw = next(
                (
                    r.digits
                    for r in rapid_reads
                    if r.variant_id == "RAPID_RAW" and _valid_digits(r.digits)
                ),
                "",
            )
            if pp_raw and pp_raw == rapid_raw:
                stable_rapid = pp_raw
                accept_path = "rapid_pp_raw_corroboration"
            else:
                return LicenseNumberRecognitionResult(
                    status="REJECT",
                    digits="",
                    confidence=None,
                    reject_reason="LICENSE_NUMBER_RAPID_UNSTABLE",
                    stable_pp_digits=None,
                    pp_variants=pp_variants,
                    rapid_variants=rapid_reads,
                    runtime_ms=(time.perf_counter() - t0) * 1000.0,
                    metadata={
                        "pp_stability": "failed",
                        "primaryEngine": "PP-OCRv5",
                        "primaryResult": "NO_DIGITS",
                        "fallbackEngine": "RapidOCR",
                        "fallbackConsensus": False,
                    },
                )

        tess_out = self._tesseract(tess_path, 8, _DIGITS_WL)
        tess_digits = extract_license_digits(tess_out.get("raw_text", ""))
        if _valid_digits(tess_digits) and tess_digits != stable_rapid:
            return LicenseNumberRecognitionResult(
                status="REJECT",
                digits="",
                confidence=None,
                reject_reason="LICENSE_NUMBER_RAPID_TESS_CONFLICT",
                stable_pp_digits=None,
                pp_variants=pp_variants,
                rapid_variants=rapid_reads,
                veto_tesseract=tess_digits,
                veto_rapidocr=stable_rapid,
                runtime_ms=(time.perf_counter() - t0) * 1000.0,
                metadata={
                    "primaryEngine": "PP-OCRv5",
                    "primaryResult": "NO_DIGITS",
                    "fallbackEngine": "RapidOCR",
                    "fallbackConsensus": True,
                    "selectedValue": stable_rapid,
                },
            )

        if validate_field("license_number", stable_rapid) != "ACCEPT":
            return LicenseNumberRecognitionResult(
                status="REJECT",
                digits="",
                confidence=None,
                reject_reason="LICENSE_NUMBER_VALIDATION_FAILED",
                stable_pp_digits=None,
                pp_variants=pp_variants,
                rapid_variants=rapid_reads,
                runtime_ms=(time.perf_counter() - t0) * 1000.0,
            )

        confs = [
            r.confidence for r in rapid_reads if r.digits == stable_rapid and r.confidence is not None
        ]
        conf = sum(confs) / len(confs) if confs else None

        return LicenseNumberRecognitionResult(
            status="ACCEPT",
            digits=stable_rapid,
            confidence=conf,
            reject_reason="LICENSE_NUMBER_RAPID_FALLBACK_ACCEPT",
            stable_pp_digits=None,
            pp_variants=pp_variants,
            rapid_variants=rapid_reads,
            veto_tesseract=tess_digits or None,
            veto_rapidocr=stable_rapid,
            runtime_ms=(time.perf_counter() - t0) * 1000.0,
            preprocessing="RAPID_V1_3_1_FALLBACK",
            metadata={
                "primaryEngine": "PP-OCRv5",
                "primaryResult": "NO_DIGITS",
                "fallbackEngine": "RapidOCR",
                "fallbackConsensus": True,
                "selectedValue": stable_rapid,
                "accept_path": accept_path,
            },
        )

    def recognize(self, crop_path: Path, cache_key: str) -> LicenseNumberRecognitionResult:
        t0 = time.perf_counter()
        bgr = cv2.imread(str(crop_path), cv2.IMREAD_COLOR)
        if bgr is None:
            return LicenseNumberRecognitionResult(
                status="REJECT",
                digits="",
                confidence=None,
                reject_reason="LICENSE_NUMBER_READ_FAILED",
                stable_pp_digits=None,
                runtime_ms=(time.perf_counter() - t0) * 1000.0,
            )

        variant_reads: list[PpVariantRead] = []
        primary_path: Optional[Path] = None
        for variant_id, preprocess in PP_VARIANTS:
            img = _materialize_pp_variant(bgr, preprocess)
            path = self._write_variant(img, f"{cache_key}_{variant_id}")
            if preprocess == "raw":
                primary_path = path
            variant_reads.append(self._read_pp(path, variant_id, preprocess))

        stable, reject = resolve_pp_stability(variant_reads)
        if not stable:
            if should_activate_rapid_fallback(reject, variant_reads):
                veto_path = primary_path or Path(variant_reads[0].image_path)
                return self._try_rapid_fallback(bgr, cache_key, variant_reads, veto_path, t0)
            return LicenseNumberRecognitionResult(
                status="REJECT",
                digits="",
                confidence=None,
                reject_reason=reject,
                stable_pp_digits=None,
                pp_variants=variant_reads,
                runtime_ms=(time.perf_counter() - t0) * 1000.0,
                metadata={"pp_stability": "failed"},
            )

        veto_path = primary_path or Path(variant_reads[0].image_path)
        t_v0 = time.perf_counter()
        tess_out = self._tesseract(veto_path, 8, _DIGITS_WL)
        tess_digits = extract_license_digits(tess_out.get("raw_text", ""))
        rapid_out = self._rapid(veto_path)
        rapid_digits = extract_license_digits(rapid_out.get("raw_text", ""))
        veto_ms = (time.perf_counter() - t_v0) * 1000.0

        veto_reason = independent_veto(stable, tess_digits, rapid_digits)
        if veto_reason:
            return LicenseNumberRecognitionResult(
                status="REJECT",
                digits="",
                confidence=None,
                reject_reason=veto_reason,
                stable_pp_digits=stable,
                pp_variants=variant_reads,
                veto_tesseract=tess_digits or None,
                veto_rapidocr=rapid_digits or None,
                runtime_ms=(time.perf_counter() - t0) * 1000.0,
                metadata={"veto_ms": veto_ms},
            )

        if validate_field("license_number", stable) != "ACCEPT":
            return LicenseNumberRecognitionResult(
                status="REJECT",
                digits="",
                confidence=None,
                reject_reason="LICENSE_NUMBER_VALIDATION_FAILED",
                stable_pp_digits=stable,
                pp_variants=variant_reads,
                runtime_ms=(time.perf_counter() - t0) * 1000.0,
            )

        confs = [r.confidence for r in variant_reads if r.digits == stable and r.confidence is not None]
        conf = sum(confs) / len(confs) if confs else None

        return LicenseNumberRecognitionResult(
            status="ACCEPT",
            digits=stable,
            confidence=conf,
            reject_reason=None,
            stable_pp_digits=stable,
            pp_variants=variant_reads,
            veto_tesseract=tess_digits or None,
            veto_rapidocr=rapid_digits or None,
            runtime_ms=(time.perf_counter() - t0) * 1000.0,
            metadata={"veto_ms": veto_ms, "pp_stability": "ok"},
        )
