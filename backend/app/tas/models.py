"""Teaching Assistant (TA) request models."""
from uuid import UUID
from pydantic import BaseModel


class TaUserRequest(BaseModel):
    """Identify a class member to promote/demote or (un)assign as a TA."""
    user_id: UUID
