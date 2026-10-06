"""Strict acceptance for 10-cell OCR + optional cell-level consensus."""

from __future__ import annotations

from collections import Counter

from passport_number.checksum_resolve import PassportNumberResult, resolve_from_sequence_10
from passport_number.focused_ocr import normalize_mrz_token, ocr_image_bgr, _prepare_ocr_input
from passport_number.ten_cell_variants import split_ten_cells
from icao_td3 import verify_check_digit, compute_check_digit


def accept_checksum_consensus(
    readings: list[dict], *, min_votes: int = 2
) -> PassportNumberResult | None:
    """Accept only when one doc9 has enough independent variant votes and no close competitor."""
    votes: dict[str, list[float | None]] = {}
    for r in readings:
        norm = normalize_mrz_token(r.get("normalized") or "")
        if len(norm) < 10:
            continue
        if verify_check_digit(norm[:9], norm[9]) is not True:
            continue
        votes.setdefault(norm[:9], []).append(r.get("confidence"))

    if not votes:
        return None

    ranked = sorted(
        votes.items(),
        key=lambda kv: (len(kv[1]), max((c or 0) for c in kv[1])),
        reverse=True,
    )
    best_doc9, best_confs = ranked[0]
    if len(best_confs) < min_votes:
        return None
    if len(ranked) > 1 and len(ranked[1][1]) >= min_votes:
        return PassportNumberResult(
            passport_number=None,
            status="REVIEW",
            check_digit=None,
            sequence_10=None,
            checksum_pass=False,
            failure_stage="G_unresolved_ambiguity",
            details={"competing_checksum_doc9": [d for d, _ in ranked[:3]]},
        )
    cd = str(compute_check_digit(best_doc9))
    return resolve_from_sequence_10(best_doc9 + cd, max(best_confs))


def try_cell_level_consensus(crop10_bgr) -> PassportNumberResult | None:
    """Per-cell OCR; accept only if all 10 cells resolved and one checksum-valid sequence with no ambiguity."""
    cells = split_ten_cells(crop10_bgr)
    chosen: list[str] = []
    confs: list[float] = []
    ambiguous_positions = 0

    for cell in cells:
        hyps: list[tuple[str, float | None]] = []
        inputs = [cell]
        if cell.shape[0] < 20:
            inputs.append(_prepare_ocr_input(cell))
        for img in inputs:
            raw, conf = ocr_image_bgr(img)
            norm = normalize_mrz_token(raw)
            if norm:
                hyps.append((norm[0], conf))
        if not hyps:
            return None
        counts: Counter[str] = Counter()
        conf_map: dict[str, float] = {}
        for ch, c in hyps:
            counts[ch] += 1
            conf_map[ch] = max(conf_map.get(ch, 0), c or 0)
        top = counts.most_common(2)
        if len(top) > 1 and top[0][1] == top[1][1]:
            ambiguous_positions += 1
        ch = top[0][0]
        if ch == "?" or ch not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<":
            return None
        chosen.append(ch)
        confs.append(conf_map[ch])

    if ambiguous_positions > 0 or len(chosen) != 10:
        return None

    seq = "".join(chosen)
    if len(seq) != 10:
        return None
    if verify_check_digit(seq[:9], seq[9]) is not True:
        return None

    avg_conf = sum(confs) / len(confs)
    return resolve_from_sequence_10(seq, avg_conf)
