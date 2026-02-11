"""
Authentication request models
"""
from pydantic import BaseModel


class SignupRequest(BaseModel):
    """Request model for user signup"""
    email: str
    userId: str
    userType: str = None
