"""POST /api/classes/join: a join code names exactly one class.

A code is eight characters from the generator's alphabet (``app/utils/generators.py``) and is
matched exactly. It used to be matched with ``ilike`` and never checked, so ``%`` joined
whichever class PostgREST listed first and ``Q%`` narrowed it to the classes starting with Q.

Any account that has picked a role may join, an instructor account included, except the
class's own instructor (409). The answer never carries the staff-only class columns.
"""

from __future__ import annotations

import pytest

from tests.conftest import make_token
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
                # Staff-only columns a join response must never carry back to the joiner.
                "review_zoom_url": "https://zoom.example/staff-only",
                "review_period_open": True,
                "can_students_make_project": False,
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


def _header(sub: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=sub)}"}


def test_an_instructor_account_can_join_another_instructors_class(client, db):
    db.rows("profiles").append({"id": "inst-join-2", "email": "i2@ucsc.edu", "role": "instructor"})
    res = client.post(
        "/api/classes/join", headers=_header("inst-join-2"), json={"course_code": "QASBX26A"}
    )
    assert res.status_code == 200, res.text
    assert [(e["class_id"], e["user_id"]) for e in db.rows("class_enrollments")] == [
        ("class-1", "inst-join-2")
    ]


def test_the_instructor_of_a_class_cannot_join_it(client, db):
    db.rows("profiles").append({"id": "inst-1", "email": "i1@ucsc.edu", "role": "instructor"})
    res = client.post(
        "/api/classes/join", headers=_header("inst-1"), json={"course_code": "QASBX26A"}
    )
    assert (res.status_code, res.json()["detail"]) == (409, "You are the instructor of this class")
    assert db.rows("class_enrollments") == []


def test_an_account_without_a_role_cannot_join(client, db):
    db.rows("profiles").append({"id": "no-role-join", "email": "n@gmail.com", "role": None})
    res = client.post(
        "/api/classes/join", headers=_header("no-role-join"), json={"course_code": "QASBX26A"}
    )
    assert (res.status_code, res.json()["detail"]) == (
        403,
        "Choose whether you are a student or an instructor first",
    )
    assert db.rows("class_enrollments") == []


STAFF_ONLY_CLASS_COLUMNS = {"review_zoom_url", "review_period_open", "can_students_make_project"}


def test_join_response_never_carries_staff_only_columns(client, auth_header, db):
    # class-1 has real values in all three staff-only columns (hidden from students elsewhere);
    # a joiner must not get them back, on first join or on a repeat "Already enrolled" post.
    first = client.post("/api/classes/join", headers=auth_header, json={"course_code": "QASBX26A"})
    assert first.status_code == 200, first.text
    assert first.json()["message"] == "Joined class successfully"
    assert STAFF_ONLY_CLASS_COLUMNS.isdisjoint(first.json()["class"])

    again = client.post("/api/classes/join", headers=auth_header, json={"course_code": "QASBX26A"})
    assert again.status_code == 200
    assert again.json()["message"] == "Already enrolled"
    assert STAFF_ONLY_CLASS_COLUMNS.isdisjoint(again.json()["class"])
