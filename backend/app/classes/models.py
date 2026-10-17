"""
Class management request models
"""

import datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import AfterValidator, BaseModel, Field, ValidationInfo, field_validator

ClassStatus = Literal["active", "complete"]

#: The longest "Tasks - External" link a class keeps; the classes_external_tasks_url_valid CHECK
#: allows the same, so a link the API accepts never fails in the database.
MAX_EXTERNAL_TASKS_URL_LENGTH = 2048


def _external_tasks_url(value: str | None) -> str | None:
    """A class's "Tasks - External" link, kept as typed less surrounding spaces; blank is none.

    The web client renders it as a link's ``href``, so only a full ``http(s)://`` address with a
    host passes: a ``javascript:`` or ``data:`` URL would run in GrepThink's origin when clicked.
    """
    url = (value or "").strip()
    if not url:
        return None
    if len(url) > MAX_EXTERNAL_TASKS_URL_LENGTH:
        raise ValueError(f"The link is over {MAX_EXTERNAL_TASKS_URL_LENGTH:,} characters")
    if any(ch.isspace() or not ch.isprintable() for ch in url):
        raise ValueError("The link can't contain spaces")
    parts = urlsplit(url)  # raises ValueError for a malformed IPv6 host
    # urlsplit only finds a host after "//", so "https:example.org" has none.
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("Enter a full link starting with https:// or http://")
    _ = parts.port  # raises ValueError for a port that is not a number up to 65535
    return url


#: A "Tasks - External" link in a request: a full http(s) address, or blank/null for none.
ExternalTasksUrl = Annotated[str | None, AfterValidator(_external_tasks_url)]


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
    #: The class's task board elsewhere, shown as "Tasks - External" in its sidebar.
    external_tasks_url: ExternalTasksUrl = None


class InviteStudentRequest(BaseModel):
    """Request model for inviting a student to a class"""

    student_email: str


class JoinClassRequest(BaseModel):
    """Request model for joining a class with a course code"""

    course_code: str


class UpdateClassStatusRequest(BaseModel):
    """Request model for updating a class lifecycle status (class instructor only)."""

    status: ClassStatus


class UpdateClassExternalTasksUrlRequest(BaseModel):
    """Set, change or remove the class's "Tasks - External" link (class instructor only).

    The field is required, null or blank removing the link, so a body that names no link is a
    422 rather than a removal.
    """

    external_tasks_url: ExternalTasksUrl


class AddManualRosterStudentRequest(BaseModel):
    """Request model for manually adding a student to the roster (class instructor only)."""

    first_name: str
    last_name: str
    email: str


#: The longest subject Maileroo accepts. A longer one fails permanently for every recipient, so
#: it is refused (422) before anything is queued.
MAX_EMAIL_SUBJECT_LENGTH = 255
#: The longest an email address can be (RFC 5321: a 256-octet path, less its angle brackets).
MAX_EMAIL_ADDRESS_LENGTH = 254
#: The most addresses one invite request (a bulk invite, a queued batch) may name, and the most
#: copies (cc, bcc) a queued batch puts on every email.
MAX_INVITE_EMAILS = 500
MAX_QUEUED_COPIES = 20
#: The longest custom email body, as text and as the editor's HTML. Far more than a message
#: needs: what goes past it is a pasted image, which the Roster editor embeds in the HTML as a
#: base64 ``data:`` URI, and which would then travel inside every recipient's email.
MAX_CUSTOM_BODY_LENGTH = 50_000
MAX_CUSTOM_BODY_HTML_LENGTH = 100_000
_BODY_LIMITS = {
    "custom_body": MAX_CUSTOM_BODY_LENGTH,
    "custom_body_html": MAX_CUSTOM_BODY_HTML_LENGTH,
}
_REMOVE_PASTED_IMAGES = "Remove any pasted images: the editor puts each one inside the email."


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


#: An address an invite request names (or a queued batch copies): refused (422) before anything
#: is sent or queued when it is longer than an address can be, or has a line break.
InviteAddress = Annotated[
    str, Field(max_length=MAX_EMAIL_ADDRESS_LENGTH), AfterValidator(_one_line_address)
]


class BulkInviteRequest(BaseModel):
    """Request model for bulk-enrolling students by email list"""

    emails: list[InviteAddress] = Field(max_length=MAX_INVITE_EMAILS)


class QueueInviteRequest(BaseModel):
    """Request model for queuing a delayed invite batch"""

    emails: list[InviteAddress] = Field(max_length=MAX_INVITE_EMAILS)
    cc: list[InviteAddress] = Field(default=[], max_length=MAX_QUEUED_COPIES)
    bcc: list[InviteAddress] = Field(default=[], max_length=MAX_QUEUED_COPIES)
    custom_subject: str | None = Field(default=None, max_length=MAX_EMAIL_SUBJECT_LENGTH)
    custom_body: str | None = Field(
        default=None,
        description=(
            f"The custom email as text, at most {MAX_CUSTOM_BODY_LENGTH:,} characters. "
            f"{_REMOVE_PASTED_IMAGES}"
        ),
    )
    custom_body_html: str | None = Field(
        default=None,
        description=(
            f"The custom email as the editor's HTML, at most {MAX_CUSTOM_BODY_HTML_LENGTH:,} "
            f"characters. {_REMOVE_PASTED_IMAGES}"
        ),
    )

    @field_validator("custom_subject")
    @classmethod
    def subject_is_one_line(cls, subject: str | None) -> str | None:
        """Refuse a subject with a line break (422) before anything is queued."""
        if subject is not None and _has_line_break(subject):
            raise ValueError("The subject must be a single line")
        return subject

    @field_validator("custom_body", "custom_body_html")
    @classmethod
    def body_is_not_too_long(cls, body: str | None, info: ValidationInfo) -> str | None:
        """Refuse (422) a body over its limit, and say what usually makes one that long."""
        limit = _BODY_LIMITS[info.field_name]
        if body is not None and len(body) > limit:
            raise ValueError(
                f"The email body is over {limit:,} characters. {_REMOVE_PASTED_IMAGES}"
            )
        return body


class QueueInviteResponse(BaseModel):
    """Response after queuing an invite batch"""

    job_id: str
    send_at: str  # ISO 8601


class CancelInviteResponse(BaseModel):
    """Response after cancelling a queued invite batch"""

    cancelled: bool
