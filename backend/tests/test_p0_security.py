"""Regression guards for the P0 security cleanup.

These lock in three fixes so they can't silently regress again:
  - the role-bypass ``POST /api/projects/test-create`` backdoor is gone,
  - the diagnostic ``GET /api/test-auth`` endpoint is gone,
  - the previously-broken ``remove-product-owner`` route is now registered.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_test_auth_endpoint_removed(client: TestClient):
    # require_user endpoints answer 401 when present, so a 404 proves the
    # diagnostic route was actually removed (not merely unauthenticated).
    r = client.get("/api/test-auth")
    assert r.status_code == 404


def test_test_create_backdoor_removed(client: TestClient):
    # No route -> 404, or method-not-allowed against /{project_id} -> 405.
    r = client.post(
        "/api/projects/test-create",
        json={"class_id": "x", "name": "y", "team_size": 1},
    )
    assert r.status_code in (404, 405)


def test_remove_product_owner_route_registered(client: TestClient):
    # Unauthenticated POST to a valid-UUID path must hit require_user (401),
    # proving the route is registered. A 404 would mean it's still missing.
    r = client.post(
        "/api/projects/00000000-0000-0000-0000-000000000000/remove-product-owner",
        json={"user_id": "00000000-0000-0000-0000-000000000001"},
    )
    assert r.status_code == 401
