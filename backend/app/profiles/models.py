"""
Profile request/response models
"""

from pydantic import BaseModel


class ProfileUpdateRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    linkedin: str | None = None
    github: str | None = None
    image_url: str | None = None
    edu_email: str | None = None


class SendEduVerificationRequest(BaseModel):
    edu_email: str


class VerifyEduEmailRequest(BaseModel):
    edu_email: str
    code: str
