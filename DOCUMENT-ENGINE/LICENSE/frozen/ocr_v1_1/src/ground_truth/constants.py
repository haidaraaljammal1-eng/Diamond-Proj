from __future__ import annotations

FIELD_NAMES = [
    "license_number",
    "name_ar",
    "name_en",
    "nationality",
    "date_of_birth",
    "issue_date",
    "expiry_date",
    "place_of_issue",
]

DATE_FIELDS = frozenset({"date_of_birth", "issue_date", "expiry_date"})

VALUE_CROP_BY_FIELD = {
    "license_number": "01_license_number.png",
    "name_ar": "02_name_ar.png",
    "name_en": "03_name_en.png",
    "nationality": "04_nationality.png",
    "date_of_birth": "05_date_of_birth.png",
    "issue_date": "06_issue_date.png",
    "expiry_date": "07_expiry_date.png",
    "place_of_issue": "08_place_of_issue.png",
}

ROW_CROP_BY_FIELD = {
    "license_number": "01_license_number_row.png",
    "name_ar": "02_name_ar_row.png",
    "name_en": "03_name_en_row.png",
    "nationality": "04_nationality_row.png",
    "date_of_birth": "05_date_of_birth_row.png",
    "issue_date": "06_issue_date_row.png",
    "expiry_date": "07_expiry_date_row.png",
    "place_of_issue": "08_place_of_issue_row.png",
}

TRUTH_TERMINAL_STATUSES = frozenset(
    {"VERIFIED", "EMPTY", "UNREADABLE", "UNCERTAIN"}
)
