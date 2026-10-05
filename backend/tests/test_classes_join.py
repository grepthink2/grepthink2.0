"""POST /api/classes/join: a join code names exactly one class.

A code is eight characters from the generator's alphabet (``app/utils/generators.py``) and is
matched exactly. It used to be matched with ``ilike`` and never checked, so ``%`` joined
whichever class PostgREST listed first and ``Q%`` narrowed it to the classes starting with Q.
"""

from __future__ import annotations

import pytest

from tests.fake_supabase import FakeSupabase

USER = "user-abc"  # the `sub` of conftest's auth_header token


@pytest.fixture(autouse=True)
def _fresh_role_cache():
    from app.auth import controller

    controller._role_cache.clear()
    yield
    controller._role_cache.clear()


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        profiles=[{"id": USER, "email": "ann@gmail.com", "role": "student"}],
        classes=[
            {
                "id": "class-1",
                "name": "CSE 115A",
                "course_code": "QASBX26A",
                "created_by": "inst-1",
            },
            {"id": "class-2", "name": "Other", "course_code": "ZZ99ZZ99", "created_by": "inst-1"},
        ],
        class_enrollments=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


@pytest.mark.parametrize(
    "code",
    ["%", "*", "________", "Q%", "QASBX26%", "QASBX26", "QASBX26AA", "QASB 26A", "QASBX26_", ""],
)
def test_join_rejects_anything_that_is_not_eight_code_characters(client, auth_header, db, code):
    res = client.post("/api/classes/join", headers=auth_header, json={"course_code": code})

    assert res.status_code == 404
    assert res.json()["detail"] == "Invalid course code"
    assert db.rows("class_enrollments") == []
    # A malformed code never reaches the database, wildcard or not.
    assert [q for q in db.queries if q["table"] == "classes"] == []


def test_join_matches_the_code_exactly_whatever_its_case(client, auth_header, db):
    res = client.post("/api/classes/join", headers=auth_header, json={"course_code": " qasbx26a "})

    assert res.status_code == 200
    assert [e["class_id"] for e in db.rows("class_enrollments")] == ["class-1"]
    lookup = next(q for q in db.queries if q["table"] == "classes")
    assert lookup["filters"] == [("course_code", "eq", "QASBX26A")]


def test_join_answers_404_for_a_well_formed_code_nobody_uses(client, auth_header, db):
    res = client.post("/api/classes/join", headers=auth_header, json={"course_code": "AAAA1111"})

    assert res.status_code == 404
    assert db.rows("class_enrollments") == []
