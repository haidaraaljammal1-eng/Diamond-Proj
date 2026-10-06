from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ExtractSuccessResponse(BaseModel):
    passport_number: str
    status: Literal["VALID"] = "VALID"


class ExtractReviewResponse(BaseModel):
    passport_number: None = None
    status: Literal["REVIEW"] = "REVIEW"


class ErrorResponse(BaseModel):
    error: str = Field(..., examples=["INVALID_IMAGE"])
    message: str


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "passport-number-api"
    engine: str = "passport_number_frozen"
