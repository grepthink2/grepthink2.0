"""Teaching Assistant (TA) request models."""

from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator


class TaUserRequest(BaseModel):
    """Identify a class member to promote/demote as a TA."""

    user_id: UUID


class SetReviewWindowRequest(BaseModel):
    """Open or close a class's end-of-quarter review window."""

    open: bool


class SetReviewTaRequest(BaseModel):
    """Set a team's additional end-of-quarter reviewer.

    ``user_id`` is optional: a TA self-appoints by omitting it; an instructor
    supplies the TA to appoint (override).
    """

    user_id: UUID | None = None


class SetReviewZoomRequest(BaseModel):
    """Set (null/blank clears) the class's shared final-review Zoom room."""

    zoom_url: str | None = None


class FinalReviewScoreEntry(BaseModel):
    """One student's scores for a single scorer role.

    Home rows carry product/team/scrum; review/instructor rows carry overall.
    All scores are 1.0–5.0 and stored at 0.1 granularity (rounded).
    """

    student_id: UUID
    product: float | None = None
    team: float | None = None
    scrum: float | None = None
    overall: float | None = None
    notes: str | None = None


class SaveFinalReviewScoresRequest(BaseModel):
    """Bulk-upsert one scorer role's rows for a team ('home'|'review'|'instructor')."""

    role: str
    scores: list[FinalReviewScoreEntry]


class SaveFinalReviewNotesRequest(BaseModel):
    """Replace the team's structured review-notes document (Review TA form)."""

    content: dict
    template_version: int = 1


class CreateReviewSlotsRequest(BaseModel):
    """Post final-review slots: 1 to 200 distinct start times, each with its time zone.

    Every slot lasts 60 minutes. Times that already have a slot in the class are skipped.
    """

    starts_at: list[AwareDatetime] = Field(min_length=1, max_length=200)

    @field_validator("starts_at")
    @classmethod
    def start_times_are_distinct(cls, starts_at: list[AwareDatetime]) -> list[AwareDatetime]:
        """Refuse (422) a time listed twice. Aware times compare as instants, so 17:00Z and
        09:00-08:00 are the same time."""
        if len(set(starts_at)) != len(starts_at):
            raise ValueError("Each start time can be listed only once")
        return starts_at


class BookReviewSlotRequest(BaseModel):
    """Book a slot for a team: a Product Owner names their own team, the instructor any team."""

    project_id: UUID
