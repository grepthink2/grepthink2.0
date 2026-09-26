"""Institutions: the cached loader, the school-email rule and ``GET /api/institutions``."""

from __future__ import annotations

import logging
import time

import pytest
from fastapi.testclient import TestClient

from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.institutions import controller as institutions
from app.limiter import limiter
from tests.conftest import ISTINYE_INSTITUTION
from tests.fake_supabase import FakeSupabase

UCSC = {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "UC Santa Cruz",
    "slug": "ucsc",
    "email_domains": ["ucsc.edu"],
}
# The row as it would actually sit in the database: mixed case and stray whitespace, to exercise
# _normalized_domain. Compare against the already-clean ISTINYE_INSTITUTION from conftest.
IST_RAW = {**ISTINYE_INSTITUTION, "email_domains": [" Istinye.edu.TR "]}


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
    """A client whose every table read fails with a given, non-missing-table ``DatabaseError``.

    Counts how many times it was asked for a table, so a test can check the re-arm window
    spared it a second attempt.
    """

    def __init__(self, *, pg_code: str, pg_message: str = "boom"):
        self._pg_code = pg_code
        self._pg_message = pg_message
        self.calls = 0

    def table(self, name):
        self.calls += 1
        raise DatabaseError(
            operation="read", target=name, pg_code=self._pg_code, pg_message=self._pg_message
        )


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(institutions=[dict(UCSC), dict(IST_RAW)])
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
    assert ist == ISTINYE_INSTITUTION


SKETCHY_DOMAINS = [
    "  @Example.EDU ",
    ".ucsc.edu",
    ".@stu.sketchy.edu",
    "com",
    "admin@istinye.edu.tr",
    "istinye .edu.tr",
    "",
    "   ",
    "@.",
]


@pytest.fixture
def sketchy(monkeypatch):
    fake = FakeSupabase(
        institutions=[
            {
                "id": "55555555-5555-4555-8555-555555555555",
                "name": "Sketchy U",
                "slug": "sketchy",
                "email_domains": SKETCHY_DOMAINS,
            }
        ]
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    institutions.clear_institutions_cache()


def test_only_hostname_shaped_domains_are_kept(sketchy):
    row = next(i for i in institutions.load_institutions() if i["slug"] == "sketchy")
    # Dropped: a bare "com" (under the subdomain rule in is_school_email it would make every
    # ".com" address a school email), a whole address, a domain with a space in it, and the
    # blank or punctuation-only entries. None of them could ever match an address.
    assert row["email_domains"] == ["example.edu", "ucsc.edu", "stu.sketchy.edu"]


def test_each_dropped_domain_is_logged_as_an_error_with_its_school(sketchy, caplog):
    # An ERROR, not a WARNING: Sentry files a WARNING as a breadcrumb only, and a maintainer's
    # typo silently turns off that school's email domain until someone reads the log.
    with caplog.at_level(logging.WARNING, logger="app.institutions.controller"):
        institutions.load_institutions()

    dropped = [
        r for r in caplog.records if r.name == "app.institutions.controller" and "dropped" in r.msg
    ]
    assert [r.levelno for r in dropped] == [logging.ERROR] * 6
    for record, entry in zip(
        dropped, ["com", "admin@istinye.edu.tr", "istinye .edu.tr", "", "   ", "@."], strict=True
    ):
        assert "'sketchy'" in record.getMessage()
        assert repr(entry) in record.getMessage()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("ucsc.edu.", "ucsc.edu"),
        ("@ucsc.edu", "ucsc.edu"),
        (".@ucsc.edu", "ucsc.edu"),
        ("@.ucsc.edu", "ucsc.edu"),
        ("..ucsc.edu..", "ucsc.edu"),
    ],
)
def test_leading_at_signs_and_dots_and_trailing_dots_are_stripped(raw, expected):
    assert institutions._normalized_domain(raw) == expected


@pytest.mark.parametrize(
    "suffix",
    [
        "edu.tr",
        "com.tr",
        "org.tr",
        "k12.tr",
        "ac.uk",
        "co.uk",
        "gov.uk",
        "sch.uk",
        "edu.au",
        "com.au",
        "net.au",
        "ac.jp",
        "co.jp",
        "edu.cn",
        "com.cn",
        "ac.in",
        "edu.pl",
    ],
)
def test_a_bare_two_label_public_suffix_is_dropped(suffix):
    assert institutions._normalized_domain(suffix) is None
    assert institutions._normalized_domain(suffix.upper()) is None
    assert institutions._normalized_domain(f"@{suffix}") is None


@pytest.mark.parametrize(
    "domain",
    ["istinye.edu.tr", "stu.istinye.edu.tr", "ox.ac.uk", "u-tokyo.ac.jp", "ucsc.edu", "co.edu"],
)
def test_a_school_domain_under_a_public_suffix_is_kept(domain):
    assert institutions._normalized_domain(domain) == domain


def test_a_public_suffix_does_not_grant_every_school_under_it(monkeypatch):
    fake = FakeSupabase(
        institutions=[
            {
                "id": "66666666-6666-4666-8666-666666666666",
                "name": "Oops University",
                "slug": "oops",
                # A maintainer meant "our address ends in .edu.tr", not "every .edu.tr school".
                "email_domains": ["edu.tr"],
            }
        ]
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    institutions.clear_institutions_cache()

    oops = next(i for i in institutions.load_institutions() if i["slug"] == "oops")
    assert oops["email_domains"] == []
    assert institutions.is_school_email("ann@besiktas.edu.tr") is False


@pytest.mark.parametrize("pg_code", sorted(institutions._MISSING_TABLE_CODES))
def test_missing_table_is_cached_then_rechecked_after_the_ttl(monkeypatch, pg_code):
    institutions.clear_institutions_cache()
    unreadable = _Unreadable(pg_code=pg_code)
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


@pytest.mark.parametrize("pg_code", sorted(institutions._MISSING_TABLE_CODES))
def test_missing_table_logs_one_line_without_a_traceback(monkeypatch, caplog, pg_code):
    # Expected until the migration is applied, and logged again every minute on every
    # instance: the code says which case it is, a traceback adds nothing.
    institutions.clear_institutions_cache()
    monkeypatch.setattr(institutions, "get_client", lambda: _Unreadable(pg_code=pg_code))

    with caplog.at_level(logging.WARNING, logger="app.institutions.controller"):
        assert institutions.load_institutions() is None

    [record] = [r for r in caplog.records if r.name == "app.institutions.controller"]
    assert record.levelno == logging.WARNING
    assert record.exc_info is None
    assert record.getMessage() == (
        f"institutions: table not found ({pg_code}), treating it as empty"
    )


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


@pytest.mark.parametrize(
    ("failure", "level"),
    [
        (
            lambda: DatabaseError(
                operation="read", target="institutions", pg_code="42501", pg_message="no grant"
            ),
            logging.ERROR,
        ),
        (
            lambda: DatabaseUnavailableError(
                operation="read", target="institutions", pg_message="timed out"
            ),
            logging.WARNING,
        ),
    ],
    ids=["lasting-failure", "outage"],
)
def test_serving_the_last_list_logs_a_lasting_failure_as_an_error_and_an_outage_as_a_warning(
    monkeypatch, caplog, failure, level
):
    # Sentry files a WARNING as a breadcrumb only: a missing grant must reach it as an ERROR even
    # though the stale list keeps the request working; a timeout is expected to clear by itself.
    institutions.clear_institutions_cache()
    fake = FakeSupabase(institutions=[dict(UCSC)])
    monkeypatch.setattr(institutions, "get_client", lambda: fake)
    first = institutions.load_institutions()

    class _Raises:
        def table(self, _name):
            raise failure()

    monkeypatch.setattr(institutions, "get_client", lambda: _Raises())
    monkeypatch.setattr(institutions, "_cache", (0.0, first))  # looks expired, has a fallback
    with caplog.at_level(logging.WARNING, logger="app.institutions.controller"):
        assert institutions.load_institutions() == first

    [record] = [r for r in caplog.records if r.name == "app.institutions.controller"]
    assert (record.levelno, record.getMessage()) == (
        level,
        "institutions: read failed, serving the last known list",
    )


def test_a_failed_read_is_not_retried_within_the_stale_window_then_recovers(monkeypatch):
    institutions.clear_institutions_cache()
    fake = FakeSupabase(institutions=[dict(UCSC)])
    monkeypatch.setattr(institutions, "get_client", lambda: fake)
    first = institutions.load_institutions()

    failing = _FailingWith(pg_code="42501", pg_message="no grant")
    monkeypatch.setattr(institutions, "get_client", lambda: failing)
    monkeypatch.setattr(institutions, "_cache", (0.0, first))  # looks expired, but has a fallback

    assert institutions.load_institutions() == first
    assert failing.calls == 1

    # Still inside the 10 s re-arm: served from the fallback, no second failed read.
    assert institutions.load_institutions() == first
    assert failing.calls == 1

    real_monotonic = time.monotonic
    monkeypatch.setattr(time, "monotonic", lambda: real_monotonic() + 11)
    recovered_client = FakeSupabase(institutions=[dict(UCSC), dict(IST_RAW)])
    monkeypatch.setattr(institutions, "get_client", lambda: recovered_client)

    recovered = institutions.load_institutions()
    assert {i["slug"] for i in recovered} == {"ucsc", "istinye"}


def test_a_newly_added_school_appears_only_after_the_ttl(monkeypatch):
    institutions.clear_institutions_cache()
    fake = FakeSupabase(institutions=[dict(UCSC)])
    monkeypatch.setattr(institutions, "get_client", lambda: fake)
    assert {i["slug"] for i in institutions.load_institutions()} == {"ucsc"}

    fake.rows("institutions").append(dict(IST_RAW))
    # Still inside the 300 s TTL: served from memory, the new row not visible yet.
    assert {i["slug"] for i in institutions.load_institutions()} == {"ucsc"}

    real_monotonic = time.monotonic
    monkeypatch.setattr(time, "monotonic", lambda: real_monotonic() + 301)
    assert {i["slug"] for i in institutions.load_institutions()} == {"ucsc", "istinye"}


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
    assert institutions.institution_summaries(institutions.load_institutions())[
        ISTINYE_INSTITUTION["id"]
    ] == {
        "id": ISTINYE_INSTITUTION["id"],
        "name": "İstinye University",
        "slug": "istinye",
    }
    assert institutions.is_known_institution(ISTINYE_INSTITUTION["id"]) is True
    assert institutions.is_known_institution("33333333-3333-4333-8333-333333333333") is False


def test_is_known_institution_normalizes_the_id(db):
    assert institutions.is_known_institution(ISTINYE_INSTITUTION["id"].upper()) is True
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
        "istinye": ISTINYE_INSTITUTION,
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
