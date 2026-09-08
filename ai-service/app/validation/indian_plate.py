"""
Indian license plate validation and normalization.

Supported format examples:
  GJ01AB1234   - Standard private vehicle
  DL1CAB1234   - Older Delhi format
  MH12DE1433   - Maharashtra
  23BH1234AA   - Bharat Series (BH)
  DL12TEMP1234 - Temporary registration plate
  GJ01AB1234E  - Electric Vehicle

Provides:
  1. clean_ocr_text: strips spaces, punctuation, IND badges
  2. repair_indian_plate: conservative positional character repairs gated on confidence
  3. validate_indian_plate: regex and state code validation
  4. process_ocr_result: unified processing with raw, normalized, and corrected values
"""

import re
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Regex Patterns
# ---------------------------------------------------------------------------

# Standard BH (Bharat) series: 23BH1234AA
BH_PATTERN = re.compile(r"^\d{2}BH\d{4}[A-HJ-NP-Z]{1,2}$")

# Standard state-coded format: GJ01AB1234 or DL1CA0001 (state 2 chars, district 1-2 digits,
# series 1-3 alpha, number 1-4 digits)
STANDARD_PATTERN = re.compile(
    r"^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$"
)

# Temporary registration plate format: DL12TEMP1234, MH01TR1234, etc.
TEMP_PATTERN = re.compile(
    r"^[A-Z]{2}\d{1,2}(?:TEMP|TR|TMP)\d{1,4}$"
)

# Old-style: MH12 E 1234 -> MH12E1234
OLD_STYLE_PATTERN = re.compile(
    r"^[A-Z]{2}\d{1,2}[A-Z]{1}\d{4}$"
)

# Electric vehicle suffix pattern: GJ01AB1234E
EV_PATTERN = re.compile(
    r"^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}E$"
)

KNOWN_STATE_CODES = {
    "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN",
    "GA", "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD",
    "MH", "ML", "MN", "MP", "MZ", "NL", "OD", "OR", "PB", "PY",
    "RJ", "SK", "TN", "TR", "TS", "UK", "UP", "WB",
}

# Common OCR confusion maps
LETTER_TO_DIGIT = {
    "O": "0", "Q": "0", "D": "0",
    "I": "1", "L": "1",
    "Z": "2",
    "E": "3",
    "A": "4",
    "S": "5",
    "G": "6",
    "B": "8",
}

DIGIT_TO_LETTER = {
    "0": "O",
    "1": "I",
    "2": "Z",
    "4": "A",
    "5": "S",
    "6": "G",
    "8": "B",
}


def clean_ocr_text(raw: str) -> str:
    """
    Clean raw OCR string without speculative character substitutions:
    - Strip whitespace, punctuation, hyphens, and non-alphanumeric chars
    - Uppercase
    - Strip embossed IND / INDIA badge artifacts if prefixed
    """
    if not raw:
        return ""

    cleaned = re.sub(r"[\s\-\.\_\,\:\;\|\/\\`'\"]", "", raw).upper()
    cleaned = re.sub(r"[^A-Z0-9]", "", cleaned)

    # Strip embossed 'IND' badge text if present at beginning of plate
    for badge in ("IND", "INT", "1ND", "IN0", "LND", "TND", "INO", "JND", "INDIA"):
        if cleaned.startswith(badge):
            rem = cleaned[len(badge):]
            if len(rem) >= 6 and (rem[:2] in KNOWN_STATE_CODES or any(rem[i:i+2] in KNOWN_STATE_CODES for i in range(2))):
                cleaned = rem
                break
            elif len(cleaned) >= 11:
                cleaned = rem
                break

    # Strip junk if prefix is 3 chars and chars 3:5 is a known state code
    if len(cleaned) >= 8 and cleaned[:2] not in KNOWN_STATE_CODES and cleaned[3:5] in KNOWN_STATE_CODES:
        cleaned = cleaned[3:]

    return cleaned


def repair_indian_plate(text: str, ocr_confidence: float = 1.0) -> Tuple[str, List[str]]:
    """
    Conservative character repair for Indian license plates.
    Guarded strictly: only runs if OCR confidence >= 0.60 and plate has realistic length (8-11).
    Position-aware:
      - Positions 0-1: State letters
      - Positions 2-3: District digits
      - Tail (last 1-4 chars): Registration number digits
    """
    repairs: List[str] = []
    if not text or len(text) < 7 or len(text) > 12:
        return text, repairs

    if ocr_confidence < 0.60:
        # Avoid hallucinating on low-confidence OCR
        return text, repairs

    chars = list(text)
    n = len(chars)

    # BH Series check (e.g. 22BH1234AA)
    if chars[2:4] == ["B", "H"] and chars[0].isdigit() and chars[1].isdigit():
        # BH plate: chars 4..7 should be digits
        for idx in range(4, min(8, n)):
            if chars[idx] in LETTER_TO_DIGIT:
                old = chars[idx]
                chars[idx] = LETTER_TO_DIGIT[old]
                repairs.append(f"BH pos {idx}: {old}->{chars[idx]}")
        return "".join(chars), repairs

    # Check if plate begins with or can safely form a known state code
    candidate_state = "".join([DIGIT_TO_LETTER.get(c, c) for c in chars[:2]])
    has_valid_state = candidate_state in KNOWN_STATE_CODES

    if not has_valid_state:
        # Do not mutate if not a plausible Indian state format
        return text, repairs

    # Position 0 & 1 must be state letters
    for i in (0, 1):
        if chars[i] in DIGIT_TO_LETTER:
            old = chars[i]
            chars[i] = DIGIT_TO_LETTER[old]
            repairs.append(f"State pos {i}: {old}->{chars[i]}")

    # Position 2 & 3 must be district digits (or pos 2 digit, pos 3 series letter for 1-digit districts)
    # Check pos 2
    if chars[2] in LETTER_TO_DIGIT:
        old = chars[2]
        chars[2] = LETTER_TO_DIGIT[old]
        repairs.append(f"District pos 2: {old}->{chars[2]}")

    # If position 3 is followed by letters (e.g. MH01AB1234), pos 3 is a digit
    if n >= 9 and chars[3] in LETTER_TO_DIGIT and (chars[4].isalpha() or chars[4] in DIGIT_TO_LETTER):
        old = chars[3]
        chars[3] = LETTER_TO_DIGIT[old]
        repairs.append(f"District pos 3: {old}->{chars[3]}")

    # Tail registration digits: the final 4 characters in a standard plate are digits
    num_tail_digits = 4 if n >= 9 else max(1, n - 5)
    start_tail = n - num_tail_digits
    for i in range(start_tail, n):
        # Ignore EV plate trailing 'E'
        if i == n - 1 and chars[i] == "E" and n >= 10:
            continue
        if chars[i] in LETTER_TO_DIGIT:
            old = chars[i]
            chars[i] = LETTER_TO_DIGIT[old]
            repairs.append(f"Tail pos {i}: {old}->{chars[i]}")

    return "".join(chars), repairs


def normalize_plate_text(raw: str, ocr_confidence: float = 1.0, allow_repair: bool = True) -> str:
    """
    Clean and optionally repair raw OCR plate text.
    Maintains backward compatibility with callers expecting normalize_plate_text(raw).
    """
    cleaned = clean_ocr_text(raw)
    if allow_repair and ocr_confidence >= 0.60:
        repaired, _ = repair_indian_plate(cleaned, ocr_confidence=ocr_confidence)
        return repaired
    return cleaned


def validate_indian_plate(normalized: str) -> Tuple[str, str]:
    """
    Validate a plate string against Indian plate formats.

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

    # Check temporary registration plates
    if TEMP_PATTERN.match(normalized):
        state = normalized[:2]
        return "VALID_FORMAT", f"Temporary registration plate, state: {state}"

    # Check standard format
    if STANDARD_PATTERN.match(normalized):
        state = normalized[:2]
        if state in KNOWN_STATE_CODES:
            return "VALID_FORMAT", f"Standard plate, state: {state}"
        else:
            return "POSSIBLE_FORMAT", f"Standard format but unknown state code: {state}"

    # Check old-style
    if OLD_STYLE_PATTERN.match(normalized):
        state = normalized[:2]
        if state in KNOWN_STATE_CODES:
            return "VALID_FORMAT", f"Old-style plate format, state: {state}"
        return "POSSIBLE_FORMAT", "Old-style format, unknown state"

    # Partial match: starts with valid state code + digits
    if len(normalized) >= 4:
        state = normalized[:2]
        if state in KNOWN_STATE_CODES and normalized[2:4].isdigit():
            return "POSSIBLE_FORMAT", f"Partial Indian plate pattern ({state})"

    return "INVALID_FORMAT", "Does not match any known Indian plate format"


def process_ocr_result(raw_ocr: str, ocr_confidence: float = 0.0) -> Dict:
    """
    Full post-processing of raw OCR text for an Indian license plate.
    Produces separate raw_ocr, normalized_plate, and corrected_plate.
    """
    cleaned = clean_ocr_text(raw_ocr)
    corrected, repairs = repair_indian_plate(cleaned, ocr_confidence=ocr_confidence)

    # Validate against corrected first; if still invalid, check cleaned
    status, note = validate_indian_plate(corrected)
    if status == "INVALID_FORMAT" and corrected != cleaned:
        status_clean, note_clean = validate_indian_plate(cleaned)
        if status_clean in ("VALID_FORMAT", "POSSIBLE_FORMAT"):
            corrected = cleaned
            status, note = status_clean, note_clean

    return {
        "raw_ocr": raw_ocr,
        "normalized_plate": cleaned,
        "corrected_plate": corrected,
        "validation_status": status,
        "validation_note": note,
        "repairs_applied": repairs,
        "is_valid": status == "VALID_FORMAT",
    }
