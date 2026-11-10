"""The schedule's query: a class and a range of instants."""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

#: The widest range one request may ask for: six weeks.
MAX_RANGE_DAYS = 42

#: 422: the range is empty or runs backwards.
RANGE_BACKWARDS = "from must be before to"
#: 422: the range is wider than MAX_RANGE_DAYS.
RANGE_TOO_WIDE = f"The range can span at most {MAX_RANGE_DAYS} days"


class ScheduleQuery(BaseModel):
    """``?class_id=&from=&to=``: ``from`` and ``to`` are ISO instants with an offset."""

    model_config = ConfigDict(populate_by_name=True)

    class_id: UUID
    start: AwareDatetime = Field(alias="from")
    end: AwareDatetime = Field(alias="to")

    @model_validator(mode="after")
    def _a_forward_range_of_at_most_six_weeks(self) -> ScheduleQuery:
        if self.start >= self.end:
            raise ValueError(RANGE_BACKWARDS)
        if self.end - self.start > timedelta(days=MAX_RANGE_DAYS):
            raise ValueError(RANGE_TOO_WIDE)
        return self
