"""Schedule views: the query and the answer.

``GET /api/schedule?class_id=&from=&to=`` answers ``{"lens": ..., "items": [...]}``. A range that
runs backwards, has no offset, or spans more than six weeks is a 422.
"""

from typing import Annotated

from fastapi import Depends, Query

from app.dependencies import require_user
from app.schedule import controller
from app.schedule.models import ScheduleQuery


def get_schedule(
    query: Annotated[ScheduleQuery, Query()], user_id: str = Depends(require_user)
) -> dict:
    return controller.get_schedule(user_id, query.class_id, query.start, query.end)
