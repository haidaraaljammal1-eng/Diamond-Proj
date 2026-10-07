from __future__ import annotations

import imghdr
from typing import Final

ALLOWED_KINDS: Final[frozenset[str]] = frozenset({"jpeg", "png"})
MAX_UPLOAD_BYTES: Final[int] = 5 * 1024 * 1024


def sniff_image_kind(data: bytes) -> str | None:
    if len(data) < 12:
        return None
    kind = imghdr.what(None, h=data[:32])
    if kind == "jpeg":
        return "jpeg"
    if kind == "png":
        return "png"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    return None


def extension_for_kind(kind: str) -> str:
    return ".jpg" if kind == "jpeg" else ".png"
