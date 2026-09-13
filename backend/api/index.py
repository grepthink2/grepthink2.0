"""Vercel entrypoint (see backend/vercel.json): the Python runtime serves this module's ``app``."""

from app.main import app

__all__ = ["app"]
