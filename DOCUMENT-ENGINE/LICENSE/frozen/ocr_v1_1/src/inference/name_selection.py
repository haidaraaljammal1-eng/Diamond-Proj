from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any, Optional

from src.inference.confidence_calib import CalibratedThresholds
from src.scoring.normalize import normalize_for_field
from src.validators.name_en_strict import validate_name_en_text


@dataclass
class NameCandidate:
    candidate_id: str
    engine: str
    variant: str
    raw_text: str
    confidence: Optional[float]
    stability_score: float
    validator: str = ""
    validator_reason: str = ""


@dataclass
class NamePolicyParams:
    min_exact_agreement: int = 2
    min_stability_primary: float = 0.55
    require_cross_engine_for_singleton: bool = False
    use_calibrated_confidence: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "min_exact_agreement": self.min_exact_agreement,
            "min_stability_primary": self.min_stability_primary,
            "require_cross_engine_for_singleton": self.require_cross_engine_for_singleton,
            "use_calibrated_confidence": self.use_calibrated_confidence,
        }


def agreement_features(candidates: list[NameCandidate]) -> dict[str, Any]:
    texts = [c.raw_text.strip() for c in candidates if c.raw_text.strip()]
    norm = [normalize_for_field("name_en", t) for t in texts]
    fold = [t.casefold() for t in norm]
    exact_counts = Counter(texts)
    fold_counts = Counter(fold)
    word_sets = [set(t.split()) for t in norm]
    pairwise_ld = []
    for i in range(len(norm)):
        for j in range(i + 1, len(norm)):
            pairwise_ld.append(_levenshtein(norm[i], norm[j]) / max(len(norm[j]), 1))
    return {
        "candidate_count": len(candidates),
        "exact_agreement_max": max(exact_counts.values()) if exact_counts else 0,
        "casefold_agreement_max": max(fold_counts.values()) if fold_counts else 0,
        "unique_exact": len(exact_counts),
        "unique_casefold": len(fold_counts),
        "mean_pairwise_cer": sum(pairwise_ld) / len(pairwise_ld) if pairwise_ld else 0.0,
        "word_count_mode": Counter(len(t.split()) for t in norm).most_common(1)[0][0]
        if norm
        else 0,
    }


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _engine_conf_ok(c: NameCandidate, calib: CalibratedThresholds, params: NamePolicyParams) -> bool:
    if c.confidence is None:
        return False
    if not params.use_calibrated_confidence:
        return c.confidence >= 0.7
    if c.engine == "rapidocr_en":
        return c.confidence >= calib.rapid_min_confidence
    return c.confidence >= calib.tesseract_min_confidence


def select_name_output(
    candidates: list[NameCandidate],
    calib: CalibratedThresholds,
    params: NamePolicyParams,
) -> dict[str, Any]:
    enriched: list[NameCandidate] = []
    for c in candidates:
        v, r = validate_name_en_text(c.raw_text)
        enriched.append(
            NameCandidate(
                c.candidate_id,
                c.engine,
                c.variant,
                c.raw_text.strip(),
                c.confidence,
                c.stability_score,
                v,
                r,
            )
        )
    primary = enriched[0] if enriched else None
    feats = agreement_features(enriched)

    # CASE A: exact agreement
    text_counts = Counter(c.raw_text for c in enriched if c.raw_text)
    for text, cnt in text_counts.items():
        if cnt >= params.min_exact_agreement:
            v, _ = validate_name_en_text(text)
            if v == "ACCEPT":
                cid = next(c.candidate_id for c in enriched if c.raw_text == text)
                return _pack(text, "exact_agreement", "ACCEPTED", cid, feats, enriched)

    # CASE B: RapidOCR case-insensitive consensus
    rapid = [c for c in enriched if c.engine == "rapidocr_en"]
    rapid_fold = Counter(normalize_for_field("name_en", c.raw_text).casefold() for c in rapid)
    if rapid_fold and rapid_fold.most_common(1)[0][1] >= max(2, params.min_exact_agreement):
        winner_fold = rapid_fold.most_common(1)[0][0]
        winners = [
            c
            for c in rapid
            if normalize_for_field("name_en", c.raw_text).casefold() == winner_fold
        ]
        text = winners[0].raw_text
        if validate_name_en_text(text)[0] == "ACCEPT":
            return _pack(
                text,
                "rapid_consensus",
                "ACCEPTED",
                winners[0].candidate_id,
                feats,
                enriched,
            )

    # CASE C: cross-engine case-insensitive agreement
    fold_groups: dict[str, list[NameCandidate]] = {}
    for c in enriched:
        k = normalize_for_field("name_en", c.raw_text).casefold()
        fold_groups.setdefault(k, []).append(c)
    for key, group in fold_groups.items():
        engines = {c.engine for c in group}
        if len(group) >= 2 and len(engines) >= 2:
            text = group[0].raw_text
            if validate_name_en_text(text)[0] == "ACCEPT":
                return _pack(
                    text,
                    "cross_engine_agreement",
                    "ACCEPTED",
                    group[0].candidate_id,
                    feats,
                    enriched,
                )

    # Cross-engine disagreement guard (no ground truth): do not auto-accept lone RapidOCR.
    if primary and primary.validator == "ACCEPT" and primary.engine == "rapidocr_en":
        tess_vals = [c for c in enriched if c.engine == "tesseract" and c.raw_text.strip()]
        if tess_vals:
            pf = normalize_for_field("name_en", primary.raw_text).casefold()
            if not any(
                normalize_for_field("name_en", t.raw_text).casefold() == pf for t in tess_vals
            ):
                if feats["exact_agreement_max"] < 2 and feats["casefold_agreement_max"] < 2:
                    return _pack(
                        "",
                        "cross_engine_disagreement",
                        "FLAG_UNCERTAIN",
                        None,
                        feats,
                        enriched,
                    )

    # CASE D: primary high confidence + validator + stability
    if primary and primary.validator == "ACCEPT":
        if (
            primary.stability_score >= params.min_stability_primary
            and _engine_conf_ok(primary, calib, params)
        ):
            return _pack(
                primary.raw_text,
                "primary_confident",
                "ACCEPTED",
                primary.candidate_id,
                feats,
                enriched,
            )

    # CASE E: uncertain — pick none
    best_valid = [c for c in enriched if c.validator == "ACCEPT"]
    if len(best_valid) == 1 and best_valid[0].stability_score >= params.min_stability_primary:
        c = best_valid[0]
        return _pack(c.raw_text, "singleton_valid", "ACCEPTED", c.candidate_id, feats, enriched)

    return _pack(
        primary.raw_text if primary else "",
        "disagreement_or_weak_evidence",
        "FLAG_UNCERTAIN",
        primary.candidate_id if primary else None,
        feats,
        enriched,
    )


def _pack(
    text: str,
    decision: str,
    status: str,
    cid: Optional[str],
    feats: dict[str, Any],
    candidates: list[NameCandidate],
) -> dict[str, Any]:
    return {
        "final_text": text,
        "decision": decision,
        "status": status,
        "selected_candidate": cid,
        "agreement_features": feats,
        "candidates": [
            {
                "candidate_id": c.candidate_id,
                "engine": c.engine,
                "variant": c.variant,
                "raw_text": c.raw_text,
                "confidence": c.confidence,
                "stability_score": c.stability_score,
                "validator": c.validator,
            }
            for c in candidates
        ],
    }


def tune_name_params_on_train(
    train_rows: list[dict[str, Any]],
    calib: CalibratedThresholds,
) -> NamePolicyParams:
    """Select policy hyperparameters using train-fold labels (not used at inference)."""
    grid = [
        NamePolicyParams(2, 0.5, False, True),
        NamePolicyParams(2, 0.55, False, True),
        NamePolicyParams(2, 0.6, True, True),
        NamePolicyParams(3, 0.55, False, True),
    ]
    best = grid[0]
    best_score = (-1, -1.0)
    for params in grid:
        correct = 0
        false_accept = 0
        for row in train_rows:
            out = select_name_output(row["candidates"], calib, params)
            ref = row["reference_value"]
            pred = out["final_text"]
            if out["status"] == "FLAG_UNCERTAIN":
                continue
            if normalize_for_field("name_en", pred).casefold() == normalize_for_field(
                "name_en", ref
            ).casefold():
                correct += 1
            else:
                false_accept += 1
        score = (correct, -false_accept)
        if score > best_score:
            best_score = score
            best = params
    return best
