"""Institutions: the cached loader, the school-email rule and ``GET /api/institutions``."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.institutions import controller as institutions
from app.limiter import limiter
from tests.fake_supabase import FakeSupabase

UCSC = {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "UC Santa Cruz",
    "slug": "ucsc",
    "email_domains": ["ucsc.edu"],
}
# Contains a hex letter on purpose: some tests check that a differently-cased form of this id
# still matches, which an all-digit id ("1111...") could not exercise.
IST = {
    "id": "1a111111-1111-4111-8111-111111111111",
    "name": "İstinye University",
    "slug": "istinye",
    "email_domains": [" Istinye.edu.TR "],
}


class _Unreadable:
    """A client whose every table read fails the way a missing table does.

    Counts how many times it was asked for a table, so a test can check the cache spared it a
    second round trip.
    """

    def __init__(self, pg_code: str = "PGRST205"):
        self.calls = 0
        self._pg_code = pg_code

    def table(self, _name):
        self.calls += 1
        raise DatabaseError(
            operation="read",
            target="institutions",
            pg_code=self._pg_code,
            pg_message="Could not find the table 'public.institutions' in the schema cache",
        )


class _FailingWith:
    """A client whose every table read fails with a given, non-missing-table ``DatabaseError``."""

    def __init__(self, *, pg_code: str, pg_message: str = "boom"):
        self._pg_code = pg_code
        self._pg_message = pg_message

    def table(self, name):
        raise DatabaseError(
            operation="read", target=name, pg_code=self._pg_code, pg_message=self._pg_message
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
    assert {i["slug"] for i in first} == {"ucsc", "istinye"}
    assert institutions.load_institutions() == first
    assert db.executes == 1


def test_domains_are_trimmed_and_lower_cased(db):
    ist = next(i for i in institutions.load_institutions() if i["slug"] == "istinye")
    assert ist == {**IST, "email_domains": ["istinye.edu.tr"]}


def test_domains_without_a_dot_are_dropped(monkeypatch):
    fake = FakeSupabase(
        institutions=[
            {
                "id": "55555555-5555-4555-8555-555555555555",
                "name": "Sketchy U",
                "slug": "sketchy",
                "email_domains": ["  @Example.EDU ", ".ucsc.edu", "com", "", "   ", "@."],
            }
        ]
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    institutions.clear_institutions_cache()

    sketchy = next(i for i in institutions.load_institutions() if i["slug"] == "sketchy")
    # "com" and the blank/punctuation-only entries are dropped: under the subdomain rule in
    # is_school_email, a bare "com" would make every ".com" address a school email.
    assert sketchy["email_domains"] == ["example.edu", "ucsc.edu"]


def test_missing_table_is_cached_then_rechecked_after_the_ttl(monkeypatch):
    institutions.clear_institutions_cache()
    unreadable = _Unreadable()
    monkeypatch.setattr(institutions, "get_client", lambda: unreadable)

    assert institutions.load_institutions() is None
    assert institutions.load_institutions() is None
    assert unreadable.calls == 1  # the second call was served from the cache, not read again

    real_monotonic = time.monotonic
    monkeypatch.setattr(time, "monotonic", lambda: real_monotonic() + 61)
    fake = FakeSupabase(institutions=[dict(UCSC)])
    monkeypatch.setattr(institutions, "get_client", lambda: fake)

    recovered = institutions.load_institutions()
    assert recovered is not None
    assert {i["slug"] for i in recovered} == {"ucsc"}


def test_a_failed_read_keeps_serving_the_last_good_list(monkeypatch):
    institutions.clear_institutions_cache()
    fake = FakeSupabase(institutions=[dict(UCSC)])
    monkeypatch.setattr(institutions, "get_client", lambda: fake)
    first = institutions.load_institutions()
    assert first is not None

    monkeypatch.setattr(
        institutions, "get_client", lambda: _FailingWith(pg_code="42501", pg_message="no grant")
    )
    # Make the cached list look expired without losing it, instead of waiting out the real TTL.
    monkeypatch.setattr(institutions, "_cache", (0.0, first))

    again = institutions.load_institutions()
    assert again == first


def test_a_failed_read_with_no_previous_list_raises(monkeypatch):
    institutions.clear_institutions_cache()
    monkeypatch.setattr(
        institutions, "get_client", lambda: _FailingWith(pg_code="42501", pg_message="no grant")
    )

    with pytest.raises(DatabaseError):
        institutions.load_institutions()


def test_a_dropped_connection_is_retried_once(monkeypatch):
    institutions.clear_institutions_cache()

    class _FlakyOnce:
        """Fails once, the way a translated dropped connection looks, then serves ``fake``."""

        def __init__(self, fake):
            self._fake = fake
            self.calls = 0

        def table(self, name):
            self.calls += 1
            if self.calls == 1:
                raise DatabaseUnavailableError(
                    operation="read",
                    target=name,
                    pg_message="Server disconnected",
                    retryable=True,
                )
            return self._fake.table(name)

    flaky = _FlakyOnce(FakeSupabase(institutions=[dict(UCSC)]))
    monkeypatch.setattr(institutions, "get_client", lambda: flaky)

    result = institutions.load_institutions()

    assert flaky.calls == 2
    assert {i["slug"] for i in result} == {"ucsc"}


def test_summaries_and_known_ids(db):
    assert institutions.institution_summaries()[IST["id"]] == {
        "id": IST["id"],
        "name": "İstinye University",
        "slug": "istinye",
    }
    assert institutions.is_known_institution(IST["id"]) is True
    assert institutions.is_known_institution("33333333-3333-4333-8333-333333333333") is False


def test_is_known_institution_normalizes_the_id(db):
    assert institutions.is_known_institution(IST["id"].upper()) is True
    assert institutions.is_known_institution("not-a-uuid") is False
    assert institutions.is_known_institution(None) is False


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
    by_slug = {i["slug"]: i for i in res.json()["institutions"]}
    assert by_slug == {
        "ucsc": UCSC,
        "istinye": {**IST, "email_domains": ["istinye.edu.tr"]},
    }


def test_the_list_is_empty_before_the_migration(client: TestClient, unmigrated):
    res = client.get("/api/institutions")
    assert res.status_code == 200
    assert res.json() == {"institutions": []}
    # Not the usual 5-minute public cache: a browser must not keep serving this empty,
    # pre-migration answer for 5 minutes after the migration is actually applied.
    assert res.headers["cache-control"] == "no-store"


def test_the_list_is_rate_limited():
    assert "app.institutions.views.list_institutions" in limiter._route_limits
