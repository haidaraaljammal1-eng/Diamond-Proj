"""Internal HTTP API — wraps the frozen Passport Number Engine without altering it."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from services.passport_number_api.runtime_paths import apply_passport_runtime_environment

apply_passport_runtime_environment()

from services.passport_number_api.engine_adapter import run_engine_on_bgr, to_public_http_body
from services.passport_number_api.image_decode import (
    ALLOWED_EXTENSIONS,
    decode_upload_to_bgr,
    sniff_image_kind,
)
from services.passport_number_api.schemas import ErrorResponse, HealthResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("passport_number_api")

app = FastAPI(
    title="DIAMOND Passport Number API",
    description=(
        "Internal service: extract passport number from a **full passport biodata page** image. "
        "OCR scope is lower MRZ line cells 0–9 only (existing frozen engine). "
        "MRZ-only crops are not supported."
    ),
    version="1.0.0",
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@app.post(
    "/extract-passport-number",
    responses={
        200: {
            "description": "VALID or REVIEW business result",
            "content": {
                "application/json": {
                    "examples": {
                        "valid": {
                            "value": {"passport_number": "B5000479", "status": "VALID"}
                        },
                        "review": {
                            "value": {"passport_number": None, "status": "REVIEW"}
                        },
                    }
                }
            },
        },
        400: {"model": ErrorResponse},
        415: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def extract_passport_number(
    image: Annotated[UploadFile | None, File(description="Full passport-page image")] = None,
) -> JSONResponse:
    started = time.perf_counter()
    logger.info("extract-passport-number request received")

    if image is None or not image.filename:
        raise HTTPException(
            status_code=400,
            detail={"error": "MISSING_IMAGE", "message": "Multipart field 'image' is required."},
        )

    ext = os.path.splitext(image.filename or "")[1].lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail={
                "error": "UNSUPPORTED_MEDIA_TYPE",
                "message": "Supported formats: JPEG, PNG, WEBP.",
            },
        )

    content_type = (image.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail={
                "error": "UNSUPPORTED_MEDIA_TYPE",
                "message": "Uploaded file must be an image.",
            },
        )

    try:
        raw = await image.read()
    except Exception:
        logger.exception("failed to read upload")
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_IMAGE", "message": "Could not read uploaded file."},
        ) from None

    if not raw:
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_IMAGE", "message": "Uploaded file is empty."},
        )

    kind = sniff_image_kind(raw)
    if kind is None:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_IMAGE",
                "message": "The uploaded file is not a valid image.",
            },
        )

    bgr = decode_upload_to_bgr(raw)
    if bgr is None:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_IMAGE",
                "message": "The uploaded file is not a valid or readable image.",
            },
        )

    logger.info("processing started")
    try:
        internal = await asyncio.to_thread(run_engine_on_bgr, bgr)
        body = to_public_http_body(internal)
    except Exception:
        logger.exception("engine failure")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "Passport number extraction failed.",
            },
        ) from None

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info("processing completed status=%s duration_ms=%d", body.get("status"), elapsed_ms)
    return JSONResponse(content=body)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "REQUEST_ERROR", "message": str(exc.detail)},
    )
