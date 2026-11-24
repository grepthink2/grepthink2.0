"""GET /api/profiles/{user_id}: one person, as the viewer may see them.

The viewer and the person must share a class (each its instructor or enrolled in it); everyone
sees their own page. A classmate gets the name, the avatar, the links, the classes shared and the
person's team in each. Staff of a class where the person is a student also get the school email.
Nobody gets the login email or the account role, and no class in common, an unknown id and a
malformed id are refused with the same 404.
"""

from __future__ import annotations

import pytest

from app.limiter import limiter
from tests.conftest import header_for
from tests.fake_supabase import FakeSupabase


def _id(n: int) -> str:
    return f"00000000-0000-4000-8000-{n:012d}"


ANN, BO, CY, TARA, PROF, ZED, NONAME, LONER, GHOST, PROF2 = (_id(n) for n in range(1, 11))
C115A, C115B, COTHER = _id(101), _id(102), _id(103)
UCSC, SJSU = _id(201), _id(202)
TRAILHEAD = _id(301)
NOT_FOUND = {"detail": "Profile not found"}


def _profile(uid, first, last, **more):
    return {
        "id": uid,
        "first_name": first,
        "last_name": last,
        "email": f"{first or 'x'}@gmail.com".lower(),
        "role": "student",
        "image_url": None,
        "github": None,
        "linkedin": None,
        "edu_email": None,
        **more,
    }


def _class(cid, name, code, by, inst, status="active"):
    return {
        "id": cid,
        "name": name,
        "course_code": code,
        "term": "Fall",
        "year": 2026,
        "status": status,
        "created_by": by,
        "institution_id": inst,
    }


def _enrolled(cid, uid, role="student"):
    return {"class_id": cid, "user_id": uid, "enrollment_role": role}


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        relations={
            ("classes", "institutions"): ("institution_id", "id", False),
            ("projects", "project_members"): ("id", "project_id", True),
            ("project_members", "profiles"): ("user_id", "id", False),
        },
        institutions=[
            {"id": UCSC, "name": "UC Santa Cruz"},
            {"id": SJSU, "name": "San José State"},
        ],
        classes=[
            _class(C115A, "Software Engineering", "CSE 115A", PROF, UCSC),
            _class(C115B, "Software Engineering II", "CSE 115B", PROF, None, status="complete"),
            _class(COTHER, "Databases", "CS 157A", PROF2, SJSU),
        ],
        class_enrollments=[
            _enrolled(C115A, ANN),
            _enrolled(C115A, BO),
            _enrolled(C115A, CY),
            _enrolled(C115A, NONAME),
            _enrolled(C115A, TARA, "ta"),
            _enrolled(C115A, PROF, "ta"),  # the instructor, enrolled in their own class too
            _enrolled(C115B, ANN),
            _enrolled(C115B, BO),
            _enrolled(COTHER, BO),
            _enrolled(COTHER, ZED),
        ],
        profiles=[
            _profile(ANN, "Ann", "Lee"),
            _profile(
                BO,
                "Bo",
                "Park",
                edu_email="bo@ucsc.edu",
                github="bopark",
                image_url="https://img/bo.png",
            ),
            _profile(CY, "Cy", "Diaz"),
            _profile(TARA, "Tara", "Oh", edu_email="tara@ucsc.edu"),
            _profile(PROF, "Pat", "Ruiz", role="instructor", edu_email="pat@ucsc.edu"),
            _profile(ZED, "Zed", "Kim"),
            _profile(NONAME, None, None),
            _profile(LONER, "Lo", "Ner"),
        ],
        projects=[{"id": TRAILHEAD, "name": "Trailhead", "class_id": C115A}],
        project_members=[
            {"project_id": TRAILHEAD, "user_id": BO, "role": "product owner"},
            {"project_id": TRAILHEAD, "user_id": CY, "role": "member"},
            {"project_id": TRAILHEAD, "user_id": GHOST, "role": "member"},  # no profile row
        ],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def get(client, viewer, target):
    return client.get(f"/api/profiles/{target}", headers=header_for("viewer@gmail.com", viewer))


def test_a_classmate_sees_the_person_and_no_email(client, db):
    res = get(client, ANN, BO)
    assert res.status_code == 200
    body = res.json()
    assert body["person"] == {
        "id": BO,
        "name": "Bo Park",
        "image_url": "https://img/bo.png",
        "github": "bopark",
        "linkedin": None,
    }
    assert body["is_self"] is False
    assert "email" not in res.text  # no login email, no school email, not even the key


def test_only_shared_classes_are_listed_with_roles_school_and_team(client, db):
    shared = get(client, ANN, BO).json()["shared"]
    assert [s["class_id"] for s in shared] == [C115A, C115B]  # not the class Ann is not in
    assert shared[0] == {
        "class_id": C115A,
        "class_name": "Software Engineering",
        "course_code": "CSE 115A",
        "term": "Fall",
        "year": 2026,
        "status": "active",
        "institution": {"id": UCSC, "name": "UC Santa Cruz"},
        "role": "student",
        "viewer_role": "student",
        "team": {
            "project_id": TRAILHEAD,
            "name": "Trailhead",
            "project_role": "product owner",
            # Bo's teammates: not Bo, and not the member whose profile row is gone.
            "members": [{"id": CY, "name": "Cy Diaz", "image_url": None}],
        },
    }
    assert shared[1]["status"] == "complete"
    assert shared[1]["institution"] is None
    assert shared[1]["team"] is None


@pytest.mark.parametrize("viewer,role", [(TARA, "ta"), (PROF, "instructor")])
def test_staff_of_the_students_class_get_the_school_email(client, db, viewer, role):
    body = get(client, viewer, BO).json()
    assert body["person"]["school_email"] == "bo@ucsc.edu"
    assert {s["viewer_role"] for s in body["shared"]} == {role}


def test_staff_do_not_get_another_staff_members_school_email(client, db):
    assert "school_email" not in get(client, TARA, PROF).json()["person"]
    assert "school_email" not in get(client, PROF, TARA).json()["person"]


def test_the_instructor_who_is_also_enrolled_is_listed_once_as_instructor(client, db):
    shared = get(client, ANN, PROF).json()["shared"]
    assert [(s["class_id"], s["role"]) for s in shared] == [
        (C115A, "instructor"),
        (C115B, "instructor"),
    ]


def test_your_own_page_lists_every_class_and_your_school_email(client, db):
    body = get(client, BO, BO).json()
    assert body["is_self"] is True
    assert {s["class_id"] for s in body["shared"]} == {C115A, C115B, COTHER}
    assert body["person"]["school_email"] == "bo@ucsc.edu"


def test_your_own_page_answers_before_you_are_in_a_class(client, db):
    body = get(client, LONER, LONER).json()
    assert body["shared"] == []
    assert body["is_self"] is True


@pytest.mark.parametrize(
    "viewer,target",
    [(ZED, ANN), (ANN, _id(999)), (ANN, "not-a-uuid"), (LONER, ANN)],
    ids=["no class in common", "unknown id", "malformed id", "a viewer in no class"],
)
def test_every_refusal_is_the_same_404(client, db, viewer, target):
    res = get(client, viewer, target)
    assert res.status_code == 404
    assert res.json() == NOT_FOUND


def test_a_person_with_no_name_is_not_named_by_their_email(client, db):
    res = get(client, ANN, NONAME)
    assert res.json()["person"]["name"] == ""
    assert "@" not in res.text


def test_one_profile_costs_five_requests_at_most(client, db):
    db.reset_counter()
    assert get(client, ANN, BO).status_code == 200
    assert db.executes <= 5


def test_the_limit_is_per_signed_in_user(client, db):
    limiter.reset()
    try:
        for _ in range(120):
            assert get(client, ANN, BO).status_code == 200
        assert get(client, ANN, BO).status_code == 429
        assert get(client, CY, BO).status_code == 200
    finally:
        limiter.reset()
