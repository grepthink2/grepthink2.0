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
TRAILHEAD, ECHO = _id(301), _id(302)
# An id with letters in it, so that its case can differ.
HEXY = "abcdef12-0000-4000-8000-00000000000a"
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
            ("profiles", "class_enrollments"): ("id", "user_id", True),
        },
        institutions=[
            {"id": UCSC, "name": "UC Santa Cruz"},
            {"id": SJSU, "name": "San José State"},
        ],
        classes=[
            # ``course_code`` is the code a student joins the class with, not a label for it.
            _class(C115A, "CSE 115A", "JOIN-AAA", PROF, UCSC),
            _class(C115B, "CSE 115B", "JOIN-BBB", PROF, None, status="complete"),
            _class(COTHER, "CS 157A", "JOIN-CCC", PROF2, SJSU),
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
            _profile(ZED, "Zed", "Kim", edu_email="zed@sjsu.edu"),
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


def _join(db, project, user, role="member"):
    db.rows("project_members").append({"project_id": project, "user_id": user, "role": role})


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
        "class_name": "CSE 115A",
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


def test_a_teammate_who_is_not_in_the_class_is_not_listed(client, db):
    # A team can hold someone from outside its class: adding a member does not check enrollment.
    _join(db, TRAILHEAD, LONER, "admin")
    res = get(client, ANN, BO)
    assert [m["id"] for m in res.json()["shared"][0]["team"]["members"]] == [CY]
    assert "Lo Ner" not in res.text


def test_the_class_instructor_on_a_team_is_listed(client, db):
    # Pat teaches CSE 115B and is not enrolled in it.
    db.rows("projects").append({"id": ECHO, "name": "Echo", "class_id": C115B})
    _join(db, ECHO, BO)
    _join(db, ECHO, PROF)
    team = get(client, ANN, BO).json()["shared"][1]["team"]
    assert team["members"] == [{"id": PROF, "name": "Pat Ruiz", "image_url": None}]


def test_a_teammate_with_no_name_is_not_named_by_their_email(client, db):
    _join(db, TRAILHEAD, NONAME)
    res = get(client, ANN, BO)
    assert {"id": NONAME, "name": "", "image_url": None} in res.json()["shared"][0]["team"][
        "members"
    ]
    assert "@" not in res.text


def test_staff_of_one_class_get_no_school_email_for_a_fellow_student_of_another(client, db):
    # Tara and Zed are both TAs of CSE 115A and both students of Databases: in no class is one
    # of them staff where the other is a student.
    db.rows("class_enrollments").extend([_enrolled(C115A, ZED, "ta"), _enrolled(COTHER, TARA)])
    res = get(client, TARA, ZED)
    body = res.json()
    assert {(s["viewer_role"], s["role"]) for s in body["shared"]} == {
        ("ta", "ta"),
        ("student", "student"),
    }
    assert "school_email" not in body["person"]
    assert "@" not in res.text


@pytest.mark.parametrize("staff", [TARA, PROF], ids=["a TA", "the instructor"])
def test_a_student_gets_no_school_email_for_staff(client, db, staff):
    res = get(client, ANN, staff)
    assert res.status_code == 200
    assert "school_email" not in res.json()["person"]
    assert "@" not in res.text


@pytest.mark.parametrize("viewer", [TARA, BO], ids=["staff", "the person"])
def test_nobody_is_sent_the_login_email_or_the_account_role(client, db, viewer):
    res = get(client, viewer, BO)
    assert set(res.json()["person"]) == {
        "id",
        "name",
        "image_url",
        "github",
        "linkedin",
        "school_email",
    }
    assert "gmail.com" not in res.text


def test_a_refusal_costs_the_same_whether_or_not_the_person_exists(client, db):
    counts = []
    for viewer, target in [(ZED, ANN), (ANN, _id(999))]:
        db.reset_counter()
        assert get(client, viewer, target).status_code == 404
        counts.append(db.executes)
    assert counts == [3, 3]


def test_it_needs_a_sign_in(client, db):
    assert client.get(f"/api/profiles/{BO}").status_code == 401


def test_your_own_id_in_upper_case_is_still_you(client, db):
    db.rows("profiles").append(_profile(HEXY, "He", "Xy"))
    body = get(client, HEXY, HEXY.upper()).json()
    assert body["is_self"] is True
    assert body["person"]["id"] == HEXY


@pytest.mark.parametrize(
    "spelling",
    ["{" + BO + "}", "urn:uuid:" + BO, BO.replace("-", ""), BO.replace("-", "_")],
    ids=["braces", "urn", "no dashes", "underscores"],
)
def test_only_the_plain_spelling_of_an_id_is_read(client, db, spelling):
    res = get(client, ANN, spelling)
    assert res.status_code == 404
    assert res.json() == NOT_FOUND


@pytest.mark.parametrize(
    "viewer", [ANN, TARA, PROF, BO], ids=["classmate", "TA", "instructor", "self"]
)
def test_the_code_that_joins_a_class_is_never_sent(client, db, viewer):
    res = get(client, viewer, BO)
    assert res.status_code == 200
    assert "JOIN-" not in res.text
    assert "course_code" not in res.text
