"""
Class management request models
"""

import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, Field, field_validator

ClassStatus = Literal["active", "complete"]


class CreateClassRequest(BaseModel):
    """Request model for creating a new class"""

    name: str
    description: str | None = None
    term: str
    start_date: datetime.date
    tsr_count: int | None = None
    #: The school the class belongs to (``GET /api/institutions``). Optional until the
    #: institutions contract step makes ``classes.institution_id`` required.
    institution_id: UUID | None = None


class InviteStudentRequest(BaseModel):
    """Request model for inviting a student to a class"""

    student_email: str


class JoinClassRequest(BaseModel):
    """Request model for joining a class with a course code"""

    course_code: str


class UpdateClassStatusRequest(BaseModel):
    """Request model for updating a class lifecycle status (class instructor only)."""

    status: ClassStatus


class AddManualRosterStudentRequest(BaseModel):
    """Request model for manually adding a student to the roster (class instructor only)."""

    first_name: str
    last_name: str
    email: str


class BulkInviteRequest(BaseModel):
    """Request model for bulk-enrolling students by email list"""

    emails: list[str]


#: The longest subject Maileroo accepts. A longer one fails permanently for every recipient, so
#: it is refused (422) before anything is queued.
MAX_EMAIL_SUBJECT_LENGTH = 255
#: The longest an email address can be (RFC 5321: a 256-octet path, less its angle brackets).
MAX_EMAIL_ADDRESS_LENGTH = 254
#: The most addresses one queued batch may email, and copy (cc, bcc) on every email.
MAX_QUEUED_EMAILS = 500
MAX_QUEUED_COPIES = 20


def _has_line_break(text: str) -> bool:
    """Whether ``text`` has a character ``str.splitlines()`` splits on: CR and LF, but also VT,
    FF, FS, GS, RS, NEL and the Unicode line and paragraph separators. The email transport
    refuses all of them in a subject or an address (each could smuggle in a header), so every
    recipient of such an email would fail."""
    return "".join(text.splitlines()) != text


def _one_line_address(address: str) -> str:
    if _has_line_break(address):
        raise ValueError("An address must be a single line")
    return address


#: An address a queued batch emails or copies: refused (422) before anything is queued when it
#: is longer than an address can be, or has a line break.
QueuedAddress = Annotated[
    str, Field(max_length=MAX_EMAIL_ADDRESS_LENGTH), AfterValidator(_one_line_address)
]


class QueueInviteRequest(BaseModel):
    """Request model for queuing a delayed invite batch"""

    emails: list[QueuedAddress] = Field(max_length=MAX_QUEUED_EMAILS)
    cc: list[QueuedAddress] = Field(default=[], max_length=MAX_QUEUED_COPIES)
    bcc: list[QueuedAddress] = Field(default=[], max_length=MAX_QUEUED_COPIES)
    custom_subject: str | None = Field(default=None, max_length=MAX_EMAIL_SUBJECT_LENGTH)
    custom_body: str | None = None
    custom_body_html: str | None = None

    @field_validator("custom_subject")
    @classmethod
    def subject_is_one_line(cls, subject: str | None) -> str | None:
        """Refuse a subject with a line break (422) before anything is queued."""
        if subject is not None and _has_line_break(subject):
            raise ValueError("The subject must be a single line")
        return subject


class QueueInviteResponse(BaseModel):
    """Response after queuing an invite batch"""

    job_id: str
    send_at: str  # ISO 8601


class CancelInviteResponse(BaseModel):
    """Response after cancelling a queued invite batch"""

    cancelled: bool
