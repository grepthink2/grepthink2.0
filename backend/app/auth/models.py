"""
Authentication request models
"""
from pydantic import BaseModel


class SignupRequest(BaseModel):
    """Request model for user signup"""
    email: str
    userId: str
    userType: str = None
    firstName: str = None
    lastName: str = None
    avatarUrl: str = None


class CheckEmailRequest(BaseModel):
    """Request model for email availability check"""
    email: str
