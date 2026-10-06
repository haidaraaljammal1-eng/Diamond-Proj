"""Internal HTTP API — UAE driving licence Crop V1 + OCR V1.1 (isolated from Passport)."""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from services.uae_license_api.image_decode import (
    ALLOWED_KINDS,
    MAX_UPLOAD_BYTES,
    extension_for_kind,
    sniff_image_kind,
)
from services.uae_license_api.orchestrator import EngineProcessingError, process_driver_license
from services.uae_license_api.runtime_paths import apply_runtime_environment
from services.uae_license_api.schemas import ErrorResponse, HealthResponse

apply_runtime_environment()

from services.uae_license_api.health import build_health  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uae_license_api")

_pipeline: Any = None
_process_lock = asyncio.Lock()
KEEP_JOB_ARTIFACTS = os.environ.get("KEEP_JOB_ARTIFACTS", "true").lower() in (
    "1",
    "true",
    "yes",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _pipeline
    from services.uae_license_api.two_field.ocr_pipeline import TwoFieldOcrPipeline

    cache = Path(__file__).resolve().parents[2] / "output" / "ocr_two_field_cache"
    _pipeline = TwoFieldOcrPipeline(cache_dir=cache)
    logger.info("TwoFieldOcrPipeline V1.3 initialized (persistent)")
    yield
    if _pipeline is not None:
        _pipeline.close()
        _pipeline = None


app = FastAPI(
    title="DIAMOND UAE Driving Licence API",
    description="Internal service: crop + English OCR for UAE driving licence images.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    if _pipeline is None:
        return HealthResponse(status="NOT_READY", components={"pipeline": "not_initialized"})
    body = build_health(_pipeline)
    return HealthResponse(**body)


@app.post(
    "/extract-driving-license",
    responses={
        200: {"description": "Extraction result"},
        400: {"model": ErrorResponse},
        415: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def extract_driving_license(
    image: Annotated[UploadFile | None, File(description="UAE driving licence image")] = None,
) -> JSONResponse:
    if _pipeline is None:
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_OCR_ERROR", "message": "OCR pipeline not initialized."},
        )

    if image is None:
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_IMAGE", "message": "Multipart field 'image' is required."},
        )

    try:
        raw = await image.read()
    except Exception:
        logger.exception("read upload failed")
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_IMAGE", "message": "Could not read uploaded file."},
        ) from None

    if not raw:
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_IMAGE", "message": "Uploaded file is empty."},
        )
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail={"error": "FILE_TOO_LARGE", "message": "Image exceeds 5 MiB limit."},
        )

    kind = sniff_image_kind(raw)
    if kind is None or kind not in ALLOWED_KINDS:
        raise HTTPException(
            status_code=415,
            detail={"error": "UNSUPPORTED_FORMAT", "message": "Supported formats: JPEG, PNG."},
        )

    job_id = str(uuid.uuid4())
    logger.info("extract request job_id=%s bytes=%d", job_id, len(raw))

    async with _process_lock:
        suffix = extension_for_kind(kind)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(raw)
            tmp_path = Path(tmp.name)
        try:
            body = await asyncio.to_thread(
                process_driver_license,
                tmp_path,
                _pipeline,
                job_id,
                KEEP_JOB_ARTIFACTS,
            )
        except EngineProcessingError as exc:
            logger.warning("job_id=%s engine_error=%s", job_id, exc.code)
            status = 422 if exc.code in {
                "CROP_FAILED",
                "TABLE_NOT_FOUND",
                "GEOMETRY_REJECTED",
                "OCR_REJECT",
            } else 500
            raise HTTPException(
                status_code=status,
                detail={"error": exc.code, "message": exc.message},
            ) from None
        except Exception:
            logger.exception("job_id=%s internal failure", job_id)
            raise HTTPException(
                status_code=500,
                detail={"error": "INTERNAL_OCR_ERROR", "message": "Licence extraction failed."},
            ) from None
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass

    logger.info(
        "extract complete job_id=%s document_status=%s total_ms=%s",
        job_id,
        body.get("document_status"),
        body.get("runtime_ms", {}).get("total"),
    )
    return JSONResponse(content=body)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "REQUEST_ERROR", "message": str(exc.detail)},
    )
