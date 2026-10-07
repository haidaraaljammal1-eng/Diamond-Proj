from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional, TypedDict


class OcrResult(TypedDict):
    raw_text: str
    confidence: Optional[float]
    runtime_ms: float
    engine: str
    engine_version: str
    model: str
    language: str


class OcrEngine(ABC):
    @abstractmethod
    def cold_init(self) -> float:
        """Load models; return cold init time in ms."""

    @abstractmethod
    def recognize(self, image_path: str, field_name: str, language: str) -> OcrResult:
        ...

    @abstractmethod
    def metadata(self) -> dict[str, Any]:
        ...
