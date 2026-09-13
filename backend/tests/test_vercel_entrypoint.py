"""``backend/api/index.py`` is the Vercel entrypoint (see ``backend/vercel.json``).

Vercel's Python runtime loads the file's top-level ``app``. A ruff auto-fix once
deleted the import as unused, and every preview deployment failed to build.
"""

from fastapi import FastAPI


def test_vercel_entrypoint_exposes_the_fastapi_app():
    import api.index as entrypoint
    from app.main import app

    assert isinstance(getattr(entrypoint, "app", None), FastAPI)
    assert entrypoint.app is app
