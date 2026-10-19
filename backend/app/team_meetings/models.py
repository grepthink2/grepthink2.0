"""Request models for a team's one-off meetings.

The limits are the ones the database holds a team meeting to (``meetings_team_meeting_shape``,
``meetings_note_length``, ``meetings_location_length`` and ``meetings_zoom_url_length`` in
2026-10-18_team_meetings.sql), so a request these models accept satisfies those CHECKs. Text is
stripped before it is measured and stored, and a blank optional field means none. A start is kept
as the same instant in UTC, the way it is stored.
"""

from __future__ import annotations

import unicodedata
from datetime import UTC, datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, AwareDatetime, BaseModel, StringConstraints, field_validator

TITLE_MAX_LENGTH = 80
LOCATION_MAX_LENGTH = 120
ZOOM_URL_MAX_LENGTH = 500
NOTE_MAX_LENGTH = 500
DEFAULT_DURATION_MINUTES = 60

#: The lengths the meeting form offers. The database allows any 15-minute step from 15 to 240; this
#: is the narrower list the design settled on.
Duration = Literal[15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240]

#: What a link can't contain: control and format characters, surrogates, private use and every kind
#: of space (the same set as a class's "Tasks - External" link, ``app.classes.models``). Any of
#: them breaks the link, or the calendar file that will carry it.
_REFUSED_CATEGORIES = frozenset({"Cc", "Cf", "Cs", "Co", "Zs", "Zl", "Zp"})


def _blank_to_none(value: str | None) -> str | None:
    return value or None


def _zoom_url(url: str | None) -> str | None:
    """A Zoom link, kept as typed (the caller has stripped it); blank is none.

    The web client renders it as a link's ``href``, so only a full ``http(s)://`` address with a
    host passes: a ``javascript:`` or ``data:`` URL would run in GrepThink's origin when clicked.
    """
    if not url:
        return None
    if any(unicodedata.category(ch) in _REFUSED_CATEGORIES for ch in url):
        raise ValueError("The link can't contain spaces or control characters")
    parts = urlsplit(url)  # raises ValueError for a malformed IPv6 host
    # urlsplit only finds a host after "//", so "https:example.org" has none.
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("Enter the full link, like https://ucsc.zoom.us/j/…")
    _ = parts.port  # raises ValueError for a port that is not a number up to 65535
    return url


def _utc(value: datetime) -> datetime:
    """The same instant in UTC. An offset can carry a time at either end of the calendar (years 1
    and 9999) past what a datetime holds once it is moved there: that is a 422, not a crash."""
    try:
        return value.astimezone(UTC)
    except OverflowError:
        raise ValueError("That time is out of range") from None


StartsAt = Annotated[AwareDatetime, AfterValidator(_utc)]
Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TITLE_MAX_LENGTH)
]
Location = Annotated[
    str | None,
    StringConstraints(strip_whitespace=True, max_length=LOCATION_MAX_LENGTH),
    AfterValidator(_blank_to_none),
]
ZoomUrl = Annotated[
    str | None,
    StringConstraints(strip_whitespace=True, max_length=ZOOM_URL_MAX_LENGTH),
    AfterValidator(_zoom_url),
]
Note = Annotated[
    str | None,
    StringConstraints(strip_whitespace=True, max_length=NOTE_MAX_LENGTH),
    AfterValidator(_blank_to_none),
]


class TeamMeetingCreate(BaseModel):
    """A new team meeting. ``starts_at`` needs a time zone; the API keeps the instant."""

    title: Title
    starts_at: StartsAt
    duration_minutes: Duration = DEFAULT_DURATION_MINUTES
    location: Location = None
    zoom_url: ZoomUrl = None
    note: Note = None


class TeamMeetingUpdate(BaseModel):
    """Changes to a team meeting: a field left out is unchanged.

    ``location``, ``zoom_url`` and ``note`` are cleared by null or a blank. A meeting always has a
    title, a start and a length, so for those three null means "not sent" only as the default;
    sending one as null is a 422.
    """

    title: Title | None = None
    starts_at: StartsAt | None = None
    duration_minutes: Duration | None = None
    location: Location = None
    zoom_url: ZoomUrl = None
    note: Note = None

    @field_validator("title", "starts_at", "duration_minutes")
    @classmethod
    def _is_not_cleared(cls, value):
        # Validators don't run on a default, so this sees only a null the request sent.
        if value is None:
            raise ValueError("A meeting always has one")
        return value
