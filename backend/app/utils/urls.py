"""Public base URLs for links the backend puts in emails."""

from __future__ import annotations

from app.config import settings


def frontend_url() -> str:
    """Public app base URL (no trailing slash): FRONTEND_URL, else the first CORS origin."""
    explicit = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if explicit:
        return explicit
    if settings.CORS_ORIGINS:
        return settings.CORS_ORIGINS[0].rstrip("/")
    return "http://localhost:5173"


def public_api_url() -> str | None:
    """Public URL of this API (no trailing slash), or ``None`` when PUBLIC_API_URL is unset."""
    return (settings.PUBLIC_API_URL or "").strip().rstrip("/") or None
