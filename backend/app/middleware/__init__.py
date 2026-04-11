"""Custom middleware for the FastAPI app."""
from app.middleware.security import SecurityHeadersMiddleware

__all__ = ["SecurityHeadersMiddleware"]
