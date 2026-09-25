"""Institutions: the cached loader, the school-email rule and ``GET /api/institutions``."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.core.errors import DatabaseError
from app.institutions import controller as institutions
from app.limiter import limiter
from tests.fake_supabase import FakeSupabase

UCSC = {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "UC Santa Cruz",
    "slug": "ucsc",
    "email_domains": ["ucsc.edu"],
}
IST = {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "İstinye University",
    "slug": "istinye",
    "email_domains": [" Istinye.edu.TR "],
}


class _Unreadable:
    """A client whose every table read fails the way a missing table does."""

    def table(self, _name):
        raise DatabaseError(
            operation="read",
            target="institutions",
            pg_code="PGRST205",
            pg_message="Could not find the table 'public.institutions' in the schema cache",
        )


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(institutions=[dict(UCSC), dict(IST)])
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    institutions.clear_institutions_cache()
    return fake


@pytest.fixture
def unmigrated(monkeypatch):
    institutions.clear_institutions_cache()
    monkeypatch.setattr(institutions, "get_client", lambda: _Unreadable())


def test_the_list_is_read_once_then_served_from_memory(db):
    first = institutions.load_institutions()
    assert [i["slug"] for i in first] == ["ucsc", "istinye"]  # ordered by name
    assert institutions.load_institutions() == first
    assert db.executes == 1


def test_domains_are_trimmed_and_lower_cased(db):
    ist = next(i for i in institutions.load_institutions() if i["slug"] == "istinye")
    assert ist == {**IST, "email_domains": ["istinye.edu.tr"]}


def test_a_missing_table_means_no_institutions_for_a_minute(unmigrated):
    assert institutions.load_institutions() is None
    expires_at, value = institutions._cache
    assert value is None
    assert expires_at - time.monotonic() <= 60


def test_summaries_and_known_ids(db):
    assert institutions.institution_summaries()[IST["id"]] == {
        "id": IST["id"],
        "name": "İstinye University",
        "slug": "istinye",
    }
    assert institutions.is_known_institution(IST["id"]) is True
    assert institutions.is_known_institution("33333333-3333-4333-8333-333333333333") is False


@pytest.mark.parametrize(
    ("email", "expected"),
    [
        ("ann@ucsc.edu", True),
        ("Ann@UCSC.EDU", True),
        ("ann@gatech.edu", True),  # any .edu counts, added or not
        ("ann@istinye.edu.tr", True),
        ("ann@stu.istinye.edu.tr", True),  # a subdomain of an institution domain
        ("ann@evil-istinye.edu.tr", False),
        ("ann@istinye.edu.tr.example.com", False),
        ("ann@gmail.com", False),
        ("not-an-email", False),
        ("", False),
        (None, False),
    ],
)
def test_school_email(db, email, expected):
    assert institutions.is_school_email(email) is expected


def test_before_the_migration_only_edu_counts(unmigrated):
    assert institutions.is_school_email("ann@ucsc.edu") is True
    assert institutions.is_school_email("ann@istinye.edu.tr") is False


def test_the_list_is_public_and_cacheable(client: TestClient, db):
    res = client.get("/api/institutions")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=300"
    assert res.json() == {
        "institutions": [
            UCSC,
            {**IST, "email_domains": ["istinye.edu.tr"]},
        ]
    }


def test_the_list_is_empty_before_the_migration(client: TestClient, unmigrated):
    res = client.get("/api/institutions")
    assert res.status_code == 200
    assert res.json() == {"institutions": []}


def test_the_list_is_rate_limited():
    assert "app.institutions.views.list_institutions" in limiter._route_limits
