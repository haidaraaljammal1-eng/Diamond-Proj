from __future__ import annotations

from src.validators.date_strict import validate_date_text
from src.validators.english_fields import validate_field


def test_accept_slash_and_hyphen_preserve_shape():
    assert validate_date_text("21/09/2022") == ("ACCEPT", "valid_calendar")
    assert validate_date_text("20-09-2024") == ("ACCEPT", "valid_calendar")
    assert validate_field("expiry_date", "20-09-2024") == "ACCEPT"
    assert validate_field("issue_date", "21/09/2022") == "ACCEPT"


def test_reject_mixed_separators():
    assert validate_date_text("21-09/2022")[0] != "ACCEPT"
    assert validate_field("issue_date", "21-09/2022") == "REJECT"
