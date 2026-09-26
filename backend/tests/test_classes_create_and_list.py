"""Class creation (course-code probe) and the class list (``GET /api/classes``).

Before: ``create_class`` probed up to five generated course codes one query at a
time, and the student class list read the enrollments, then the instructors'
profiles, then the enrollment counts, and emitted ``instructor_email`` although
the frontend reads ``teacher_email`` (decision D9), so students never saw it.
"""

from __future__ import annotations

import datetime
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.classes import controller as classes
from tests.conftest import ISTINYE_INSTITUTION, UCSC_INSTITUTION, make_token
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr", "instr-2"
S1, S2, TA1, LONER = "s1", "s2", "ta-1", "loner"
C1, C2, C3 = "class-1", "class-2", "class-3"
BANNER = "https://cdn.example/class-banner.svg"
UCSC_ID = UCSC_INSTITUTION["id"]
IST_ID = ISTINYE_INSTITUTION["id"]


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


# -------------------------------------------------------------- create_class


def _codes(monkeypatch, codes: list[str]) -> None:
    pending = iter(codes)
    monkeypatch.setattr(classes, "generate_course_code", lambda: next(pending))


@pytest.fixture
def create_db(monkeypatch):
    fake = FakeSupabase(
        classes=[
            {"id": "old-1", "course_code": "TAKEN001", "created_by": OTHER_INSTR},
            {"id": "old-2", "course_code": "taken002", "created_by": OTHER_INSTR},
        ],
        assignments=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    monkeypatch.setattr(classes, "upload_class_banner", lambda client, class_id: BANNER)
    return fake


def test_create_class_takes_the_first_free_code_in_one_probe(create_db, monkeypatch):
    # The probe is case-insensitive: "taken002" on file blocks "TAKEN002".
    _codes(monkeypatch, ["TAKEN001", "TAKEN002", "FREE0003", "FREE0004", "FREE0005"])
    created = classes.create_class(
        "CSE 115C", "Software engineering", "Fall", datetime.date(2026, 9, 24), INSTR
    )
    assert {k: created[k] for k in created if k != "id"} == {
        "name": "CSE 115C",
        "description": "Software engineering",
        "created_by": INSTR,
        "course_code": "FREE0003",
        "year": 2026,
        "term": "Fall",
        "start_date": "2026-09-24",
        "status": "active",
        "image_url": BANNER,
    }
    tsrs = [a for a in create_db.rows("assignments") if a["class_id"] == created["id"]]
    assert [a["Title"] for a in tsrs] == [f"TSR {n}" for n in range(1, 6)]

    probes = [q for q in create_db.queries if q["table"] == "classes" and q["op"] == "select"]
    assert len(probes) == 1, _trace(create_db)
    # probe, class insert, banner url update, TSR insert
    assert create_db.executes <= 4, _trace(create_db)


def test_create_class_gives_up_when_every_candidate_is_taken(create_db, monkeypatch):
    for n in range(3, 6):
        create_db.rows("classes").append(
            {"id": f"old-{n}", "course_code": f"TAKEN00{n}", "created_by": OTHER_INSTR}
        )
    _codes(monkeypatch, [f"TAKEN00{n}" for n in range(1, 6)])
    with pytest.raises(HTTPException) as exc:
        classes.create_class("CSE 115C", None, "Fall", datetime.date(2026, 9, 24), INSTR)
    assert (exc.value.status_code, exc.value.detail) == (
        500,
        "Failed to generate unique course code",
    )
    assert not [q for q in create_db.queries if q["op"] != "select"], _trace(create_db)


def test_create_class_records_a_known_institution(create_db, monkeypatch):
    # _pick_course_code always draws _COURSE_CODE_ATTEMPTS (5) candidates up front; repeat the
    # one free code so the generator isn't exhausted (dict.fromkeys collapses the duplicates).
    _codes(monkeypatch, ["FREE0001"] * 5)
    created = classes.create_class(
        "SE 301", None, "Fall", datetime.date(2026, 9, 24), INSTR, institution_id=UCSC_ID
    )
    assert created["institution_id"] == UCSC_ID
    assert create_db.executes <= 4, _trace(create_db)


def test_create_class_refuses_an_unknown_institution_before_writing(create_db, monkeypatch):
    _codes(monkeypatch, ["FREE0001"])
    with pytest.raises(HTTPException) as exc:
        classes.create_class(
            "SE 301",
            None,
            "Fall",
            datetime.date(2026, 9, 24),
            INSTR,
            institution_id="99999999-9999-4999-8999-999999999999",
        )
    assert (exc.value.status_code, exc.value.detail) == (400, "Unknown institution")
    assert create_db.executes == 0


def test_create_class_without_an_institution_leaves_it_unset(create_db, monkeypatch):
    _codes(monkeypatch, ["FREE0001"] * 5)
    created = classes.create_class("SE 301", None, "Fall", datetime.date(2026, 9, 24), INSTR)
    assert "institution_id" not in created


# --------------------------------------------------- the create route (view)

ROUTE_INSTR = "instr-route"
ROUTE_BODY = {"name": "SE 301", "term": "Fall", "start_date": "2026-09-24"}


@pytest.fixture
def instructor_route_db(monkeypatch):
    """Just enough for ``require_instructor`` to admit ``ROUTE_INSTR``; the view's own
    ``controller.create_class`` call is mocked, so no ``classes``/``assignments`` tables
    are needed here."""
    fake = FakeSupabase(profiles=[{"id": ROUTE_INSTR, "email": "r@ucsc.edu", "role": "instructor"}])
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _route_header() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=ROUTE_INSTR)}"}


def test_create_class_route_passes_institution_id_through(client, instructor_route_db, monkeypatch):
    captured: dict = {}
    monkeypatch.setattr(
        classes,
        "create_class",
        lambda *args, **kwargs: captured.update(kwargs) or {"id": "new-class"},
    )

    res = client.post(
        "/api/classes",
        headers=_route_header(),
        json={**ROUTE_BODY, "institution_id": UCSC_ID},
    )

    assert res.status_code == 200, res.text
    assert captured["institution_id"] == UUID(UCSC_ID)


def test_create_class_route_rejects_a_non_uuid_institution_id(client, instructor_route_db):
    res = client.post(
        "/api/classes",
        headers=_route_header(),
        json={**ROUTE_BODY, "institution_id": "not-a-uuid"},
    )

    assert res.status_code == 422


# ----------------------------------------------------------- class listing


def _class(cid, owner, name, code, **extra):
    return {
        "id": cid,
        "name": name,
        "description": f"{name} description",
        "created_by": owner,
        "created_at": "2026-01-01T00:00:00+00:00",
        "course_code": code,
        "status": "active",
        "term": "Fall",
        "start_date": "2026-09-24",
        "year": 2026,
        "image_url": None,
        "review_period_open": False,
        "review_zoom_url": None,
        **extra,
    }


C_IST = "class-ist"


@pytest.fixture
def list_db(monkeypatch):
    """C1 (INSTR, UCSC) has S1, S2 and TA1; C2 (OTHER_INSTR) has S1; C3 (INSTR) is empty;
    C_IST (created by TA1, İstinye) has S2."""
    fake = FakeSupabase(
        profiles=[
            {"id": INSTR, "email": "instr@ucsc.edu"},
            {"id": OTHER_INSTR, "email": "other@ucsc.edu"},
            {"id": S1, "email": "s1@ucsc.edu"},
            {"id": S2, "email": "s2@ucsc.edu"},
            {"id": TA1, "email": "ta1@ucsc.edu"},
            {"id": LONER, "email": "loner@ucsc.edu"},
        ],
        classes=[
            _class(C1, INSTR, "CSE 115C", "AAAA1111", institution_id=UCSC_ID),
            _class(C2, OTHER_INSTR, "CSE 110", "BBBB2222"),
            _class(C3, INSTR, "CSE 130", "CCCC3333", status="complete"),
            _class(C_IST, TA1, "SE 301", "DDDD4444", institution_id=IST_ID),
        ],
        class_enrollments=[
            {"id": "e1", "class_id": C1, "user_id": S1, "enrollment_role": "student"},
            {"id": "e2", "class_id": C2, "user_id": S1, "enrollment_role": None},
            {"id": "e3", "class_id": C1, "user_id": S2, "enrollment_role": "student"},
            {"id": "e4", "class_id": C1, "user_id": TA1, "enrollment_role": "ta"},
            {"id": "e5", "class_id": C_IST, "user_id": S2, "enrollment_role": "student"},
        ],
        relations={
            ("class_enrollments", "classes"): ("class_id", "id", False),
            ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
        },
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


UCSC_SUMMARY = {"id": UCSC_ID, "name": "UC Santa Cruz", "slug": "ucsc"}
IST_SUMMARY = {"id": IST_ID, "name": "İstinye University", "slug": "istinye"}

STUDENT_KEYS = {
    "id",
    "name",
    "description",
    "created_by",
    "created_at",
    "course_code",
    "status",
    "term",
    "start_date",
    "year",
    "image_url",
    "institution_id",
    "teacher_email",
    "enrolled_count",
    "my_role",
    "institution",
}


def test_students_see_their_classes_with_the_teacher_email(list_db):
    out = classes.get_classes_for_user(S1)
    assert [c["id"] for c in out] == [C1, C2]
    assert all(set(c) == STUDENT_KEYS for c in out), [sorted(c) for c in out]
    assert [(c["teacher_email"], c["enrolled_count"], c["my_role"]) for c in out] == [
        ("instr@ucsc.edu", 2, "student"),  # TAs are not counted
        ("other@ucsc.edu", 1, "student"),  # a NULL enrollment_role is a student
    ]
    assert [c["institution"] for c in out] == [UCSC_SUMMARY, None]
    # created and enrolled classes in one wave, then the counts
    assert list_db.executes <= 3, _trace(list_db)


def test_an_account_with_no_classes_gets_an_empty_list(list_db):
    assert classes.get_classes_for_user(LONER) == []
    assert list_db.executes == 2  # the two reads of the first wave, no counts


def test_instructors_see_the_classes_they_created(list_db):
    out = classes.get_classes_for_user(INSTR)
    by_id = {c["id"]: c for c in out}
    assert set(by_id) == {C1, C3}
    assert by_id[C1] == {
        **_class(C1, INSTR, "CSE 115C", "AAAA1111", institution_id=UCSC_ID),
        "enrolled_count": 2,
        "my_role": "instructor",
        "institution": UCSC_SUMMARY,
    }
    assert by_id[C3]["enrolled_count"] == 0
    assert list_db.executes <= 3, _trace(list_db)


def test_one_account_teaches_one_class_and_assists_in_another(list_db, with_istinye):
    out = classes.get_classes_for_user(TA1)
    assert [(c["id"], c["my_role"], c["institution"]) for c in out] == [
        (C_IST, "instructor", IST_SUMMARY),  # created classes come first
        (C1, "ta", UCSC_SUMMARY),
    ]
    assert out[1]["teacher_email"] == "instr@ucsc.edu"
    taught, assisted = out
    # Taught (created) keeps the full owned-class shape; assisted (enrolled, as TA) keeps the
    # narrower one a student or TA may see — the same shape a student's enrolled class has.
    assert set(taught) == set(_class(C_IST, TA1, "SE 301", "DDDD4444", institution_id=IST_ID)) | {
        "enrolled_count",
        "my_role",
        "institution",
    }
    assert set(assisted) == STUDENT_KEYS
    # created and enrolled classes in one wave, then the counts
    assert list_db.executes <= 3, _trace(list_db)


def test_a_class_both_created_and_enrolled_in_is_listed_once_as_taught(list_db):
    list_db.rows("class_enrollments").append(
        {"id": "e6", "class_id": C3, "user_id": INSTR, "enrollment_role": "student"}
    )
    out = classes.get_classes_for_user(INSTR)
    assert sorted((c["id"], c["my_role"]) for c in out) == [(C1, "instructor"), (C3, "instructor")]


def test_before_the_migration_classes_have_no_school(list_db, monkeypatch):
    from app.institutions import controller as institutions

    monkeypatch.setattr(institutions, "_cache", (float("inf"), None))
    out = classes.get_classes_for_user(S1)
    assert [c["institution"] for c in out] == [None, None]
    assert all("institution_id" not in c for c in out)  # not selected: the column may not exist


def test_a_ta_in_a_class_with_no_institution_sees_no_school(list_db):
    # C2 has no institution_id at all (unlike C1/C_IST); make TA1 its TA too.
    list_db.rows("class_enrollments").append(
        {"id": "e7", "class_id": C2, "user_id": TA1, "enrollment_role": "ta"}
    )
    out = classes.get_classes_for_user(TA1)
    c2 = next(c for c in out if c["id"] == C2)
    assert (c2["my_role"], c2["institution"]) == ("ta", None)


def test_an_institution_id_missing_from_the_cache_shows_no_school(list_db):
    # A class can point at an institution id no longer in the (cached) list — deleted, or
    # added after this instance last refreshed. institution_id still comes back as read;
    # only its resolved `institution` summary is None.
    ghost_id = "22222222-2222-4222-8222-222222222222"
    list_db.rows("classes").append(
        _class("class-ghost", INSTR, "CSE 199", "EEEE5555", institution_id=ghost_id)
    )
    out = classes.get_classes_for_user(INSTR)
    ghost = next(c for c in out if c["id"] == "class-ghost")
    assert (ghost["institution_id"], ghost["institution"]) == (ghost_id, None)


def test_an_institutions_loader_outage_answers_503(list_db, monkeypatch):
    from app.core.errors import DatabaseUnavailableError
    from app.institutions import controller as institutions

    class _Unreachable:
        def table(self, _name):
            raise DatabaseUnavailableError(operation="read", target="institutions")

    # No cached list to fall back on, so the outage has to reach the caller (DatabaseError
    # is itself an HTTPException, so `except HTTPException: raise` lets it straight through).
    monkeypatch.setattr(institutions, "_cache", None)
    monkeypatch.setattr(institutions, "get_client", lambda: _Unreachable())

    with pytest.raises(HTTPException) as exc:
        classes.get_classes_for_user(S1)
    assert exc.value.status_code == 503


def test_class_list_lets_http_errors_through(list_db, monkeypatch):
    def unavailable(client, class_ids):
        raise HTTPException(status_code=503, detail="Service unavailable")

    monkeypatch.setattr(classes, "_enrollment_counts_by_class", unavailable)
    with pytest.raises(HTTPException) as exc:
        classes.get_classes_for_user(S1)
    assert (exc.value.status_code, exc.value.detail) == (503, "Service unavailable")
