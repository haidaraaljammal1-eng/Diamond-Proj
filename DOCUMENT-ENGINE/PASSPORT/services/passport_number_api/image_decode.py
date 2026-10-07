from __future__ import annotations

import imghdr
from typing import Final

import cv2
import numpy as np

ALLOWED_EXTENSIONS: Final[frozenset[str]] = frozenset(
    {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
)
ALLOWED_MIME_PREFIXES: Final[tuple[str, ...]] = ("image/jpeg", "image/png", "image/webp")


def sniff_image_kind(data: bytes) -> str | None:
    if len(data) < 12:
        return None
    kind = imghdr.what(None, h=data[:32])
    if kind == "jpeg":
        return "jpeg"
    if kind in {"png", "webp", "gif", "bmp", "tiff"}:
        return kind
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[8:12] == b"WEBP":
        return "webp"
    return kind


def decode_upload_to_bgr(data: bytes) -> np.ndarray | None:
    """Decode image bytes to BGR without writing a persistent file."""
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        return None
    return img
