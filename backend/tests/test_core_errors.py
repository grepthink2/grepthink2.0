"""The global exception handler must never leak exception text to clients."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.errors import install_exception_handlers


def _app() -> FastAPI:
    app = FastAPI()
    install_exception_handlers(app)

    @app.get("/boom")
    def boom():
        raise RuntimeError(
            "PostgREST said: duplicate key value violates constraint profiles_email_key"
        )

    @app.get("/http")
    def http():
        raise HTTPException(status_code=409, detail="Profile already exists")

    return app


def test_unexpected_exception_becomes_fixed_500_body():
    client = TestClient(_app(), raise_server_exceptions=False)
    res = client.get("/boom")
    assert res.status_code == 500
    assert res.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert "duplicate key" not in res.text
    assert "profiles_email_key" not in res.text


def test_http_exceptions_are_untouched():
    client = TestClient(_app(), raise_server_exceptions=False)
    res = client.get("/http")
    assert res.status_code == 409
    assert res.json() == {"detail": "Profile already exists"}


def test_main_app_installs_the_handler():
    """The real app must use it too (guards against the wiring being dropped)."""
    from app.main import app as main_app

    assert any(
        getattr(handler, "__name__", "") == "_unhandled_exception"
        for exc_type, handler in main_app.exception_handlers.items()
        if exc_type is Exception
    )
