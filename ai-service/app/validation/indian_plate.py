"""
Indian license plate validation and normalization.

Supported format examples:
  GJ01AB1234   - Standard private vehicle
  GJ05CD5678   - Standard
  GJ18XY9012   - Standard
  DL1CAB1234   - Older Delhi format
  MH12DE1433   - Maharashtra

Normalization:
  1. Strip all spaces, hyphens, dots
  2. Uppercase everything
  3. Match against known Indian plate patterns

Validation statuses:
  VALID_FORMAT     - Matches a known Indian plate regex
  POSSIBLE_FORMAT  - Partial match or close but not exact
  INVALID_FORMAT   - Clearly not a valid Indian plate
  UNCERTAIN        - OCR output too short or ambiguous to classify
"""

import re
from typing import Dict, Tuple

# ---------------------------------------------------------------------------
# Regex Patterns
# ---------------------------------------------------------------------------

# Standard BH (Bharat) series: 23BH1234AA
BH_PATTERN = re.compile(r"^\d{2}BH\d{4}[A-HJ-NP-Z]{1,2}$")

# Standard state-coded format: GJ01AB1234 (state 2 chars, district 2 digits,
# series 1-3 alpha, number 1-4 digits)
STANDARD_PATTERN = re.compile(
    r"^[A-Z]{2}\d{2}[A-Z]{1,3}\d{1,4}$"
)

# Old-style: MH12 E 1234 → after normalization → MH12E1234
OLD_STYLE_PATTERN = re.compile(
    r"^[A-Z]{2}\d{1,2}[A-Z]{1}\d{4}$"
)

# Electric vehicle suffix pattern: GJ01AB1234E
EV_PATTERN = re.compile(
    r"^[A-Z]{2}\d{2}[A-Z]{1,3}\d{1,4}E$"
)

KNOWN_STATE_CODES = {
    "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN",
    "GA", "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD",
    "MH", "ML", "MN", "MP", "MZ", "NL", "OD", "OR", "PB", "PY",
    "RJ", "SK", "TN", "TR", "TS", "UK", "UP", "WB",
}


def normalize_plate_text(raw: str) -> str:
    """
    Normalize raw OCR output:
    - Remove spaces, hyphens, dots, underscores
    - Uppercase
    - Fix common OCR confusions (O/Q/D→0 in digit positions, I/L→1 in digit positions, etc.)
    """
    if not raw:
        return ""
    # Strip unwanted characters
    cleaned = re.sub(r"[\s\-\.\_\,\:]", "", raw)
    cleaned = cleaned.upper()

    # Remove non-alphanumeric characters
    cleaned = re.sub(r"[^A-Z0-9]", "", cleaned)

    # Smart Indian license plate canonical character correction
    # Format: [2 State Letters][1-2 District Digits][1-3 Series Letters][1-4 Number Digits]
    if 8 <= len(cleaned) <= 11:
        chars = list(cleaned)
        # Position 0 & 1 must be state letters
        for i in (0, 1):
            if chars[i] == "0":
                chars[i] = "O"
            elif chars[i] == "1":
                chars[i] = "I"
            elif chars[i] == "8":
                chars[i] = "B"

        # Position 2 & 3 must be district digits (e.g. 01, 12)
        for i in (2, 3):
            if chars[i] in ("O", "Q", "D"):
                chars[i] = "0"
            elif chars[i] in ("I", "L"):
                chars[i] = "1"
            elif chars[i] == "Z":
                chars[i] = "2"
            elif chars[i] == "B":
                chars[i] = "8"
            elif chars[i] == "S":
                chars[i] = "5"

        # Last digits (usually last 4 characters)
        num_end_digits = min(4, len(chars) - 5)
        for i in range(len(chars) - num_end_digits, len(chars)):
            if chars[i] in ("O", "Q", "D"):
                chars[i] = "0"
            elif chars[i] in ("I", "L"):
                chars[i] = "1"
            elif chars[i] == "Z":
                chars[i] = "2"
            elif chars[i] == "B":
                chars[i] = "8"
            elif chars[i] == "S":
                chars[i] = "5"

        return "".join(chars)

    return cleaned


def validate_indian_plate(normalized: str) -> Tuple[str, str]:
    """
    Validate a normalized plate string against Indian plate formats.

    Returns
    -------
    (status, note)
        status: VALID_FORMAT | POSSIBLE_FORMAT | INVALID_FORMAT | UNCERTAIN
        note  : Human-readable explanation
    """
    if not normalized or len(normalized) < 5:
        return "UNCERTAIN", "Too short to classify"

    if len(normalized) > 13:
        return "INVALID_FORMAT", "Too long for an Indian plate"

    # Check BH series
    if BH_PATTERN.match(normalized):
        return "VALID_FORMAT", "BH (Bharat) series plate"

    # Check EV plates
    if EV_PATTERN.match(normalized):
        return "VALID_FORMAT", "Electric vehicle plate"

    # Check standard format
    if STANDARD_PATTERN.match(normalized):
        state = normalized[:2]
        if state in KNOWN_STATE_CODES:
            return "VALID_FORMAT", f"Standard plate, state: {state}"
        else:
            return "POSSIBLE_FORMAT", "Standard format but unknown state code"

    # Check old-style
    if OLD_STYLE_PATTERN.match(normalized):
        state = normalized[:2]
        if state in KNOWN_STATE_CODES:
            return "VALID_FORMAT", "Old-style plate format"
        return "POSSIBLE_FORMAT", "Old-style format, unknown state"

    # Partial match: starts with valid state code + digits
    if len(normalized) >= 4:
        state = normalized[:2]
        if state in KNOWN_STATE_CODES and normalized[2:4].isdigit():
            return "POSSIBLE_FORMAT", "Partial Indian plate pattern detected"

    return "INVALID_FORMAT", "Does not match any known Indian plate format"


def process_ocr_result(raw_ocr: str) -> Dict:
    """
    Full post-processing of raw OCR text for an Indian license plate.

    Returns:
    {
        "raw_ocr": str,
        "normalized_plate": str,
        "validation_status": str,
        "validation_note": str
    }
    """
    normalized = normalize_plate_text(raw_ocr)
    status, note = validate_indian_plate(normalized)

    return {
        "raw_ocr": raw_ocr,
        "normalized_plate": normalized,
        "validation_status": status,
        "validation_note": note,
    }
