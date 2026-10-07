"""Who may see which institution (spec 4.1 #1, §9 'scope')."""

import pytest

from app.analytics import controller
from app.config import settings
from tests.fake_supabase import FakeSupabase

UCSC = {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "UC Santa Cruz",
    "slug": "ucsc",
    "timezone": "America/Los_Angeles",
}
ISTINYE = {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "İstinye University",
    "slug": "istinye",
    "timezone": "Europe/Istanbul",
}
CLASSES = [
    {
        "id": "c1",
        "name": "CSE 115A",
        "term": "Fall 2026",
        "start_date": "2026-09-21",
        "created_at": "2026-09-01T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": UCSC["id"],
    },
    {
        "id": "c2",
        "name": "CSE 115B",
        "term": None,
        "start_date": None,
        "created_at": "2026-09-02T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": UCSC["id"],
    },
    {
        "id": "c3",
        "name": "SE 301",
        "term": "Güz 2026",
        "start_date": "2026-09-28",
        "created_at": "2026-09-03T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": ISTINYE["id"],
    },
    {
        "id": "c4",
        "name": "Other",
        "term": None,
        "start_date": None,
        "created_at": "2026-09-04T10:00:00+00:00",
        "created_by": "someone-else",
        "institution_id": ISTINYE["id"],
    },
]


@pytest.fixture
def fake(monkeypatch):
    fake = FakeSupabase(institutions=[ISTINYE, UCSC], classes=CLASSES, class_enrollments=[])
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    monkeypatch.setattr(settings, "ANALYTICS_ADMIN_EMAILS", frozenset({"maintainer@grepthink.dev"}))
    return fake


def test_a_maintainer_sees_every_institution(fake):
    scope = controller.scope_for_user("anyone", "Maintainer@GrepThink.dev")
    assert [(s["slug"], s["access"]) for s in scope] == [
        ("istinye", "maintainer"),
        ("ucsc", "maintainer"),
    ]
    assert fake.executes == 1


def test_an_instructor_sees_the_institutions_of_the_classes_they_created(fake):
    scope = controller.scope_for_user("prof", "prof@ucsc.edu")
    assert [(s["slug"], s["access"]) for s in scope] == [
        ("istinye", "instructor"),
        ("ucsc", "instructor"),
    ]
    assert fake.executes == 2


def test_students_tas_and_unknown_accounts_have_no_scope(fake):
    assert controller.scope_for_user("student", "s@ucsc.edu") == []
    assert controller.scope_for_user("student", None) == []


def test_get_scope_lists_classes_with_labels_and_never_the_join_code(fake):
    out = controller.get_scope("prof", "prof@ucsc.edu")
    ucsc = next(i for i in out["institutions"] if i["slug"] == "ucsc")
    assert ucsc["classes"] == [
        {
            "id": "c1",
            "name": "CSE 115A",
            "term": "Fall 2026",
            "start_date": "2026-09-21",
            "label": "CSE 115A · Fall 2026",
        },
        {"id": "c2", "name": "CSE 115B", "term": None, "start_date": None, "label": "CSE 115B"},
    ]
    istinye = next(i for i in out["institutions"] if i["slug"] == "istinye")
    assert sorted(c["id"] for c in istinye["classes"]) == [
        "c3",
        "c4",
    ]  # every class of an institution in scope
    assert "course_code" not in str(out)
    assert fake.executes == 3


def test_get_scope_is_empty_for_a_student(fake):
    assert controller.get_scope("student", "s@ucsc.edu") == {"institutions": []}


def test_admin_emails_setting_parses_a_comma_list(monkeypatch):
    from app import config

    monkeypatch.setenv("ANALYTICS_ADMIN_EMAILS", " A@x.edu, b@y.edu ,,")
    assert config._parse_emails(config.os.environ.get("ANALYTICS_ADMIN_EMAILS")) == frozenset(
        {"a@x.edu", "b@y.edu"}
    )
    assert config._parse_emails(None) == frozenset()
