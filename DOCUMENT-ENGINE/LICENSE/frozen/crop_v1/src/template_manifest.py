"""Frozen template manifest verification (inference loads only)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, List, Tuple

SKIP_TEMPLATE_FILES = frozenset(
    {
        "label_templates_debug.png",
        "label_templates_ink_bbox_debug.png",
        "english_label_purity_debug.png",
        "english_templates_before_after.png",
    }
)


def hash_template_dir(template_dir: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for path in sorted(template_dir.glob("*.png")):
        if path.name in SKIP_TEMPLATE_FILES:
            continue
        rel = f"label_templates/{path.name}"
        out[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
    return out


def build_template_manifest(template_dir: Path) -> Dict[str, object]:
    entries: List[Dict[str, object]] = []
    for path in sorted(template_dir.glob("*.png")):
        if path.name in SKIP_TEMPLATE_FILES:
            continue
        img = __import__("cv2").imread(str(path), __import__("cv2").IMREAD_UNCHANGED)
        h, w = (img.shape[:2] if img is not None else (0, 0))
        entries.append(
            {
                "filename": path.name,
                "relative_path": f"label_templates/{path.name}",
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "width": int(w),
                "height": int(h),
            }
        )
    return {
        "templates": entries,
        "aggregate_sha256": hashlib.sha256(
            json.dumps(entries, sort_keys=True).encode("utf-8")
        ).hexdigest(),
    }


def verify_template_manifest(
    template_dir: Path,
    manifest_path: Path,
    strict: bool = True,
) -> Tuple[bool, str]:
    if not manifest_path.is_file():
        if strict:
            return False, f"Missing template manifest: {manifest_path}"
        return True, "manifest_not_configured"

    expected = json.loads(manifest_path.read_text(encoding="utf-8"))
    current = {e["relative_path"]: e["sha256"] for e in expected.get("templates", [])}
    live = hash_template_dir(template_dir)
    diffs = []
    for rel, exp_hash in current.items():
        name = rel.split("/")[-1]
        live_hash = live.get(rel)
        if live_hash is None:
            diffs.append(f"missing:{name}")
        elif live_hash != exp_hash:
            diffs.append(f"changed:{name}")
    if diffs:
        return False, ";".join(diffs)
    return True, "ok"
