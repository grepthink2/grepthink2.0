"""What the API guarantees as a whole, whichever feature a route belongs to.

- Every operation needs a signed-in user unless it is on the short public list below.
  One sweep over the OpenAPI schema replaces per-route "answers 401" tests, and unlike
  them it also covers the route somebody adds next month.
- Routes that were once removed for security stay removed; a route that once went
  missing stays registered.
- Every response carries the security headers, and CORS is an allowlist.
- ``backend/api/index.py`` is what Vercel loads, and it exposes this same app.
"""

from __future__ import annotations

import re

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.main import app

METHODS = {"get", "post", "put", "patch", "delete"}
NIL_UUID = "00000000-0000-0000-0000-000000000000"

# Reachable without a session, on purpose. Adding to this list is a security decision.
PUBLIC = {
    ("get", "/health"),
    ("get", "/api/stats/usercount"),  # the landing page's counter
    ("post", "/api/check-email"),  # signup form, before an account exists
    ("post", "/api/check-user-exists"),  # forgot-password form
    ("post", "/api/contact"),  # landing page contact form
}


def _documented_operations() -> set[tuple[str, str]]:
    return {
        (method, path)
        for path, item in app.openapi()["paths"].items()
        for method in item
        if method in METHODS
    }


def _registered_operations() -> set[tuple[str, str]]:
    """Every route on every included router, whether or not it is in the schema."""
    return {
        (method.lower(), route.path)
        for included in app.routes
        for route in getattr(getattr(included, "original_router", None), "routes", [])
        if isinstance(route, APIRoute)
        for method in route.methods
        if method.lower() in METHODS
    }


def test_every_operation_outside_the_public_list_needs_a_signed_in_user(client: TestClient):
    operations = _registered_operations()
    # If a FastAPI upgrade changes how included routers are stored, fail here rather than
    # quietly sweep nothing. And a route hidden from the schema would be hidden from review.
    assert len(operations) > 100
    assert operations == _documented_operations()
    assert operations >= PUBLIC, f"stale entries in PUBLIC: {sorted(PUBLIC - operations)}"

    open_to_anyone = []
    for method, path in sorted(operations - PUBLIC):
        response = client.request(method.upper(), re.sub(r"\{[^}]+\}", NIL_UUID, path))
        if response.status_code != 401:
            open_to_anyone.append(f"{method.upper()} {path} -> {response.status_code}")

    assert open_to_anyone == []


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/test-auth"),  # diagnostic endpoint that echoed the caller's token claims
        ("POST", "/api/projects/test-create"),  # created projects with no instructor check
    ],
)
def test_removed_backdoors_stay_removed(client: TestClient, method: str, path: str):
    # Any route that exists answers 401 here (see the sweep above), so 404 means it is gone;
    # 405 is another method's route matching the same path.
    assert client.request(method, path, json={}).status_code in (404, 405)


def test_remove_product_owner_is_registered():
    # It was defined but never added to the router, so the button behind it always answered 404.
    assert ("post", "/api/projects/{project_id}/remove-product-owner") in _registered_operations()


def test_every_response_carries_the_security_headers(client: TestClient):
    headers = client.get("/health").headers

    expected = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Strict-Transport-Security": "max-age=31536000",
        "Content-Security-Policy": "default-src 'none'",
        "Permissions-Policy": "camera=()",
    }
    assert {
        name: value for name, value in expected.items() if value not in headers.get(name, "")
    } == {}


@pytest.mark.parametrize(
    ("origin", "allowed"),
    [("http://localhost:5173", True), ("http://evil.example.com", False)],
)
def test_cors_answers_preflights_from_the_allowlist_only(
    client: TestClient, origin: str, allowed: bool
):
    response = client.options(
        "/api/classes",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    # Starlette answers a disallowed preflight with 400 and omits Allow-Origin entirely.
    assert response.headers.get("Access-Control-Allow-Origin") == (origin if allowed else None)
    if allowed:
        assert response.status_code == 200
        assert response.headers.get("Access-Control-Allow-Credentials") == "true"


def test_the_vercel_entrypoint_exposes_this_app():
    # Vercel's Python runtime loads the top-level ``app`` of backend/api/index.py (see
    # backend/vercel.json). A ruff auto-fix once deleted that import as unused, and every
    # preview deployment failed to build.
    import api.index as entrypoint

    assert isinstance(getattr(entrypoint, "app", None), FastAPI)
    assert entrypoint.app is app
