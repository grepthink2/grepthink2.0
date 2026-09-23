"""
Generator utilities for creating unique identifiers
"""

import re
import secrets
import string

COURSE_CODE_LENGTH = 8
COURSE_CODE_ALPHABET = string.ascii_uppercase + string.digits
_COURSE_CODE = re.compile(rf"[{re.escape(COURSE_CODE_ALPHABET)}]{{{COURSE_CODE_LENGTH}}}")


def generate_course_code(length: int = COURSE_CODE_LENGTH) -> str:
    """
    Generate a random course code using uppercase letters and digits

    Args:
        length: Length of the course code (default: 8)

    Returns:
        Random course code string
    """
    return "".join(secrets.choice(COURSE_CODE_ALPHABET) for _ in range(length))


def normalize_course_code(raw: str | None) -> str | None:
    """The code as it is stored (trimmed, upper case), or ``None`` if it cannot be one.

    Anything a student types is checked against the generator's own alphabet and length
    before it goes near a query, so ``%``, ``_`` and ``*`` are never pattern characters:
    a code that is not eight letters and digits is simply not a code.
    """
    code = (raw or "").strip().upper()
    return code if _COURSE_CODE.fullmatch(code) else None
