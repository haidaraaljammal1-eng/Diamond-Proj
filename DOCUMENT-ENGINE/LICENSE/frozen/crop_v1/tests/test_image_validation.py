from __future__ import annotations

import numpy as np

from src.image_validation import InputStatus, validate_image
from tests.conftest import make_synthetic_licence


def test_valid_synthetic(config):
    img = make_synthetic_licence()
    result = validate_image(img, config)
    assert result.status == InputStatus.INPUT_VALID


def test_too_small(config):
    img = make_synthetic_licence(width=200, height=150)
    result = validate_image(img, config)
    assert result.status == InputStatus.INPUT_TOO_SMALL


def test_invalid_aspect(config):
    img = make_synthetic_licence(width=900, height=800)
    result = validate_image(img, config)
    assert result.status == InputStatus.INPUT_INVALID_ASPECT


def test_blank(config):
    img = np.full((600, 900, 3), 200, dtype=np.uint8)
    result = validate_image(img, config)
    assert result.status == InputStatus.INPUT_INVALID_ASPECT
