"""Who may see which institution (spec 4.1 #1, §9 'scope')."""

import pytest

from app import config
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
ZED = {
    "id": "33333333-3333-4333-8333-333333333333",
    "name": "Zed College",
    "slug": "zed",
    "timezone": "America/New_York",
}  # no classes yet
CLASSES = [  # course_code is the join code: it must never appear in a scope payload
    {
        "id": "c1",
        "name": "CSE 115A",
        "term": "Fall 2026",
        "start_date": "2026-09-21",
        "created_at": "2026-09-01T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": UCSC["id"],
        "course_code": "JOIN0001",
    },
    {
        "id": "c2",
        "name": "CSE 115B",
        "term": None,
        "start_date": None,
        "created_at": "2026-09-02T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": UCSC["id"],
        "course_code": "JOIN0002",
    },
    {
        "id": "c3",
        "name": "SE 301",
        "term": "Güz 2026",
        "start_date": "2026-09-28",
        "created_at": "2026-09-03T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": ISTINYE["id"],
        "course_code": "JOIN0003",
    },
    {
        "id": "c4",
        "name": "Other",
        "term": None,
        "start_date": None,
        "created_at": "2026-09-04T10:00:00+00:00",
        "created_by": "someone-else",
        "institution_id": ISTINYE["id"],
        "course_code": "JOIN0004",
    },
    {
        "id": "c5",
        "name": "Orphan",
        "term": None,
        "start_date": None,
        "created_at": "2026-09-05T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": None,
        "course_code": "JOIN0005",
    },
    {
        "id": "c6",
        "name": "CSE 115A",
        "term": "Spring 2026",
        "start_date": "2026-03-30",
        "created_at": "2026-03-01T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": UCSC["id"],
        "course_code": "JOIN0006",
    },
]
ENROLLMENTS = [
    {"class_id": "c1", "user_id": "ta", "enrollment_role": "ta"},
    {"class_id": "c1", "user_id": "student", "enrollment_role": "student"},
]
RELATIONS = {
    ("classes", "institutions"): ("institution_id", "id", False)
}  # the scope read embeds the institution


@pytest.fixture
def fake(monkeypatch):
    fake = FakeSupabase(
        relations=RELATIONS,
        institutions=[ISTINYE, UCSC, ZED],
        classes=CLASSES,
        class_enrollments=ENROLLMENTS,
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    monkeypatch.setattr(settings, "ANALYTICS_ADMIN_EMAILS", frozenset({"maintainer@grepthink.dev"}))
    return fake


def test_a_maintainer_sees_every_institution_in_one_read(fake):
    scope = controller.scope_for_user("anyone", "Maintainer@GrepThink.dev")
    assert [(s["slug"], s["access"]) for s in scope] == [
        ("istinye", "maintainer"),
        ("ucsc", "maintainer"),
        ("zed", "maintainer"),
    ]
    assert scope[0] == {
        **ISTINYE,
        "access": "maintainer",
    }  # the whole row: id, name, slug, timezone, access
    assert fake.executes == 1


def test_an_instructor_sees_only_the_institutions_of_the_classes_they_created(fake):
    scope = controller.scope_for_user("prof", "prof@ucsc.edu")
    assert [(s["slug"], s["access"]) for s in scope] == [
        ("istinye", "instructor"),
        ("ucsc", "instructor"),
    ]
    assert (
        fake.executes == 1
    )  # one read: the classes, each with its institution embedded over the foreign key
    # the boundary: whoever created one İstinye class sees İstinye and nothing else
    assert [(s["slug"], s["access"]) for s in controller.scope_for_user("someone-else", None)] == [
        ("istinye", "instructor")
    ]


def test_students_tas_and_unknown_accounts_have_no_scope(fake):
    assert controller.scope_for_user("ta", "ta@ucsc.edu") == []  # enrolled as a TA, created nothing
    assert controller.scope_for_user("student", "s@ucsc.edu") == []
    assert controller.scope_for_user("nobody", None) == []
    assert fake.executes == 3  # one read each, nothing more


def test_get_scope_lists_classes_with_labels_in_a_fixed_order_and_never_the_join_code(fake):
    out = controller.get_scope("prof", "prof@ucsc.edu")
    assert [i["slug"] for i in out["institutions"]] == ["istinye", "ucsc"]
    ucsc = next(i for i in out["institutions"] if i["slug"] == "ucsc")
    assert ucsc[
        "classes"
    ] == [  # by name, then start date, then id: the two "CSE 115A" terms keep a fixed order
        {
            "id": "c6",
            "name": "CSE 115A",
            "term": "Spring 2026",
            "start_date": "2026-03-30",
            "label": "CSE 115A · Spring 2026",
        },
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
    assert "JOIN000" not in str(out) and "c5" not in str(
        out
    )  # no join code; the class with no institution is nowhere
    assert fake.executes == 2


def test_get_scope_stays_inside_the_callers_institutions(fake):
    out = controller.get_scope("someone-else", None)
    assert [i["slug"] for i in out["institutions"]] == ["istinye"]
    assert [c["id"] for c in out["institutions"][0]["classes"]] == [
        "c4",
        "c3",
    ]  # "Other" sorts before "SE 301"
    assert "c1" not in str(out) and "c2" not in str(out)


def test_get_scope_gives_a_maintainer_an_empty_class_list_for_a_new_school(fake):
    out = controller.get_scope("x", "maintainer@grepthink.dev")
    zed = next(i for i in out["institutions"] if i["slug"] == "zed")
    assert zed == {**ZED, "access": "maintainer", "classes": []}
    assert fake.executes == 2


def test_get_scope_is_empty_for_a_student(fake):
    assert controller.get_scope("student", "s@ucsc.edu") == {"institutions": []}
    assert fake.executes == 1


def test_is_maintainer_compares_ascii_case_insensitively_and_nothing_else(monkeypatch):
    monkeypatch.setattr(settings, "ANALYTICS_ADMIN_EMAILS", frozenset({"kate@grepthink.dev"}))
    assert controller.is_maintainer("Kate@GrepThink.dev")
    assert not controller.is_maintainer(
        "Kate@grepthink.dev"
    )  # the Kelvin sign lower-cases to an ASCII k
    assert not controller.is_maintainer(None) and not controller.is_maintainer("")


def test_name_key_strips_accents_and_case():
    names = ["Zurich U", "École Alpha", "Ezra University", "İstinye University", "ucsc"]
    assert sorted(names, key=controller._name_key) == [
        "École Alpha",
        "Ezra University",
        "İstinye University",
        "ucsc",
        "Zurich U",
    ]


def test_admin_emails_setting_parses_a_comma_list():
    assert config._parse_emails(" A@x.edu, b@y.edu ,,") == frozenset({"a@x.edu", "b@y.edu"})
    assert config._parse_emails(None) == frozenset() and config._parse_emails("   ") == frozenset()
    assert isinstance(settings.ANALYTICS_ADMIN_EMAILS, frozenset)
