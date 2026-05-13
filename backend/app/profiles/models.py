"""
Profile request/response models
"""
from pydantic import BaseModel
from typing import Optional


class ProfileUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    image_url: Optional[str] = None
    edu_email: Optional[str] = None


class SendEduVerificationRequest(BaseModel):
    edu_email: str


class VerifyEduEmailRequest(BaseModel):
    edu_email: str
    code: str
