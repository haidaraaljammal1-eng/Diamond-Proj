from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from src.inference.confidence_calib import CalibratedThresholds
from src.validators.date_strict import validate_date_text


@dataclass
class DateCandidate:
    candidate_id: str
    engine: str
    variant: str
    raw_text: str
    confidence: Optional[float]
    validator: str
    validator_reason: str


def _norm_conf(c: DateCandidate, calib: CalibratedThresholds) -> float:
    if c.confidence is None:
        return 0.0
    if c.engine == "rapidocr_en":
        base = calib.rapid_median_correct or 0.75
        return min(1.0, c.confidence / max(base, 0.01))
    base = calib.tesseract_median_correct or 0.65
    return min(1.0, c.confidence / max(base, 0.01))


def select_date_output(
    primary: DateCandidate,
    fallbacks: list[DateCandidate],
    calib: CalibratedThresholds,
) -> dict[str, Any]:
    pv, pr = validate_date_text(primary.raw_text)
    primary = DateCandidate(
        primary.candidate_id,
        primary.engine,
        primary.variant,
        primary.raw_text.strip(),
        primary.confidence,
        pv,
        pr,
    )
    if pv == "ACCEPT":
        return {
            "final_text": primary.raw_text,
            "decision": "primary_accept",
            "status": "ACCEPTED",
            "selected_candidate": primary.candidate_id,
            "validator": pv,
        }

    pool = [primary] + fallbacks
    enriched: list[DateCandidate] = []
    for c in pool:
        v, r = validate_date_text(c.raw_text.strip())
        enriched.append(
            DateCandidate(
                c.candidate_id, c.engine, c.variant, c.raw_text.strip(), c.confidence, v, r
            )
        )

    valid = [c for c in enriched if c.validator == "ACCEPT"]
    if len(valid) == 1:
        return {
            "final_text": valid[0].raw_text,
            "decision": "fallback_unique_valid",
            "status": "ACCEPTED",
            "selected_candidate": valid[0].candidate_id,
            "validator": "ACCEPT",
        }
    if len(valid) > 1:
        groups: dict[str, list[DateCandidate]] = {}
        for c in valid:
            groups.setdefault(c.raw_text, []).append(c)
        if len(groups) == 1:
            best = valid[0]
            return {
                "final_text": best.raw_text,
                "decision": "fallback_agreement",
                "status": "ACCEPTED",
                "selected_candidate": best.candidate_id,
                "validator": "ACCEPT",
            }
        scored = sorted(
            valid,
            key=lambda c: (_norm_conf(c, calib), c.confidence or 0.0),
            reverse=True,
        )
        top, second = scored[0], scored[1]
        if top.raw_text != second.raw_text and _norm_conf(top, calib) - _norm_conf(
            second, calib
        ) < 0.05:
            return {
                "final_text": "",
                "decision": "conflict_valid_candidates",
                "status": "FLAG_UNCERTAIN",
                "selected_candidate": None,
                "validator": "FLAG_UNCERTAIN",
            }
        return {
            "final_text": top.raw_text,
            "decision": "fallback_confidence_winner",
            "status": "ACCEPTED",
            "selected_candidate": top.candidate_id,
            "validator": "ACCEPT",
        }

    uncertain = [c for c in enriched if c.validator == "FLAG_UNCERTAIN"]
    if uncertain and not valid:
        return {
            "final_text": primary.raw_text,
            "decision": "no_valid_candidate",
            "status": "FLAG_UNCERTAIN",
            "selected_candidate": primary.candidate_id,
            "validator": "FLAG_UNCERTAIN",
        }

    return {
        "final_text": primary.raw_text,
        "decision": "reject_all",
        "status": "FLAG_UNCERTAIN",
        "selected_candidate": primary.candidate_id,
        "validator": pv,
    }
