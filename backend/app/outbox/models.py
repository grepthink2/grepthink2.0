"""Request bodies of the email routes."""

from typing import Any

from pydantic import BaseModel


class EmailPreferencesUpdate(BaseModel):
    """``PUT /api/email/preferences``: category -> wanted, for the categories to change.

    The values are checked by ``preferences.set_preferences`` (400 for an unknown category or a
    value that is not a boolean), so a wrong one gets that message rather than a 422.
    """

    preferences: dict[str, Any]
