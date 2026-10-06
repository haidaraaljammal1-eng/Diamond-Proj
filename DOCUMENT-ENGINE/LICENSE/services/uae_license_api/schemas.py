from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["READY", "DEGRADED", "NOT_READY"]
    service: str = "uae-license-api"
    engine: str = "OCR_ENGLISH_V1_3_1_TWO_FIELD"
    components: dict[str, Any] = Field(default_factory=dict)


class FieldResult(BaseModel):
    value: Optional[str] = None
    status: str
    crop_status: Optional[str] = None
    ocr_eligible: bool = False
    confidence: Optional[float] = None
    engine: Optional[str] = None


class ExtractResponse(BaseModel):
    job_id: str
    document_status: Literal["ACCEPT", "REVIEW_REQUIRED", "REJECT"]
    fields: dict[str, FieldResult]
    runtime_ms: dict[str, int]


class ErrorResponse(BaseModel):
    error: str
    message: str
