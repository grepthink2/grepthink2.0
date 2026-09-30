"""Institutions: the cached loader, the school-email rule and ``GET /api/institutions``."""

from __future__ import annotations

import logging
import time
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.institutions import controller as institutions
from app.limiter import limiter
from tests.conftest import ISTINYE_INSTITUTION, UCSC_INSTITUTION
from tests.fake_supabase import FakeSupabase

UCSC = {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "UC Santa Cruz",
    "slug": "ucsc",
    "email_domains": ["ucsc.edu"],
    "timezone": "America/Los_Angeles",
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


# Timezones: ``institutions.timezone`` (2026-09-30_institution_timezones.sql) is the IANA zone a
# school's dates are in. PROD has no such column until the migration is applied.

ZONE_SCHOOL = {
    "id": "77777777-7777-4777-8777-777777777777",
    "name": "Zone University",
    "slug": "zone",
    "email_domains": ["zone.edu"],
}


def _load_zone_school(monkeypatch, **columns) -> dict:
    """Load a school whose row is ``ZONE_SCHOOL`` plus ``columns``, through the real loader.

    Pass ``timezone=...`` to set one (``None`` is NULL); leave it out for a database the
    migration has not reached, where the row has no such column at all.
    """
    fake = FakeSupabase(institutions=[{**ZONE_SCHOOL, **columns}])
    monkeypatch.setattr(institutions, "get_client", lambda: fake)
    institutions.clear_institutions_cache()
    [school] = institutions.load_institutions()
    return school


@pytest.mark.parametrize(
    ("columns", "expected"),
    [
        pytest.param({}, "America/Los_Angeles", id="no-column-yet"),
        pytest.param({"timezone": None}, "America/Los_Angeles", id="null"),
        pytest.param({"timezone": ""}, "America/Los_Angeles", id="empty"),
        pytest.param({"timezone": "America/Los_Angeles"}, "America/Los_Angeles", id="pacific"),
        pytest.param({"timezone": "Europe/Istanbul"}, "Europe/Istanbul", id="istanbul"),
    ],
)
def test_a_school_keeps_its_own_timezone_else_gets_the_default_without_an_error(
    monkeypatch, caplog, columns, expected
):
    with caplog.at_level(logging.WARNING, logger="app.institutions.controller"):
        school = _load_zone_school(monkeypatch, **columns)

    assert school["timezone"] == expected
    # Not set is an ordinary state (PROD until the migration is applied): nothing to report.
    assert [r for r in caplog.records if r.name == "app.institutions.controller"] == []


@pytest.mark.parametrize(
    "bad_name",
    [
        pytest.param("Mars/Olympus", id="no-such-zone"),
        pytest.param(" Europe/Istanbul", id="stray-space"),
        pytest.param("../etc", id="leaves-the-tz-database"),
        pytest.param("Europe", id="a-region-not-a-zone"),
    ],
)
def test_an_unknown_timezone_gets_the_default_and_an_error_log(monkeypatch, caplog, bad_name):
    # An ERROR, not a WARNING: Sentry files a WARNING as a breadcrumb only, and a maintainer's
    # typo would otherwise have reminders go out in the wrong zone until someone read the log.
    # These names make zoneinfo raise three kinds of exception (not found, ValueError,
    # IsADirectoryError): none may escape, or one row's typo would fail the read of every school.
    with caplog.at_level(logging.WARNING, logger="app.institutions.controller"):
        school = _load_zone_school(monkeypatch, timezone=bad_name)

    assert school["timezone"] == "America/Los_Angeles"
    # Only the zone fell back: the school keeps everything else.
    assert (school["slug"], school["email_domains"]) == ("zone", ["zone.edu"])
    [record] = [r for r in caplog.records if r.name == "app.institutions.controller"]
    assert record.levelno == logging.ERROR
    assert record.getMessage() == (
        f"institutions: unknown timezone {bad_name!r} for 'zone'; using America/Los_Angeles"
    )


class _SelectSpy:
    """Wraps a fake client and records the column list each ``.select(...)`` was given."""

    def __init__(self, fake):
        self._fake = fake
        self.selects: list[str] = []

    def table(self, name):
        query = self._fake.table(name)
        select = query.select

        def recording_select(columns="*", *args, **kwargs):
            self.selects.append(columns)
            return select(columns, *args, **kwargs)

        query.select = recording_select
        return query


def test_the_read_selects_every_column_so_it_works_before_the_timezone_column_exists(monkeypatch):
    # Naming "timezone" would make PostgREST fail the whole read (42703, undefined column) on a
    # database the migration has not reached (PROD until it is applied), taking every class list
    # and school-email check down with it.
    spy = _SelectSpy(FakeSupabase(institutions=[dict(UCSC)]))
    monkeypatch.setattr(institutions, "get_client", lambda: spy)
    institutions.clear_institutions_cache()

    institutions.load_institutions()

    assert spy.selects == ["*"]


def test_columns_the_app_does_not_use_never_reach_the_cached_list(monkeypatch):
    # select("*") brings back every column, so what is kept is decided by _normalized: a column
    # added to the table later must not ride along into the cache.
    school = _load_zone_school(
        monkeypatch, timezone="Europe/Istanbul", created_at="2026-09-25T00:00:00Z", notes="x"
    )

    assert school == {**ZONE_SCHOOL, "timezone": "Europe/Istanbul"}


def test_the_list_carries_each_schools_timezone(client: TestClient, db):
    schools = client.get("/api/institutions").json()["institutions"]

    assert {i["slug"]: i["timezone"] for i in schools} == {
        "ucsc": "America/Los_Angeles",
        "istinye": "Europe/Istanbul",
    }


@pytest.fixture
def without_timezone_column(monkeypatch):
    """The two schools as a database that has no ``institutions.timezone`` returns them."""
    rows = [{k: v for k, v in row.items() if k != "timezone"} for row in (UCSC, IST_RAW)]
    fake = FakeSupabase(institutions=rows)
    monkeypatch.setattr(institutions, "get_client", lambda: fake)
    institutions.clear_institutions_cache()


def test_the_list_gives_every_school_the_default_zone_before_the_column_exists(
    client: TestClient, without_timezone_column
):
    res = client.get("/api/institutions")

    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=300"
    # Temporary by design: İstinye is treated as Pacific until the migration sets Istanbul.
    assert {i["slug"]: i["timezone"] for i in res.json()["institutions"]} == {
        "ucsc": "America/Los_Angeles",
        "istinye": "America/Los_Angeles",
    }


def test_a_cached_school_without_a_timezone_is_listed_with_the_default(
    client: TestClient, monkeypatch
):
    # An entry primed into the cache by hand, from before the field existed.
    old = {k: v for k, v in UCSC_INSTITUTION.items() if k != "timezone"}
    monkeypatch.setattr(institutions, "_cache", (float("inf"), [old]))

    res = client.get("/api/institutions")

    assert res.json()["institutions"] == [{**old, "timezone": "America/Los_Angeles"}]


@pytest.mark.parametrize(
    ("institution", "zone"),
    [(UCSC_INSTITUTION, "America/Los_Angeles"), (ISTINYE_INSTITUTION, "Europe/Istanbul")],
    ids=["ucsc", "istinye"],
)
def test_institution_timezone_is_that_schools_zone(with_istinye, institution, zone):
    result = institutions.institution_timezone(institution["id"])

    assert isinstance(result, ZoneInfo)
    assert result.key == zone


def test_institution_timezone_reads_the_zone_through_the_loader(db):
    # Row -> _normalized -> cache -> institution_timezone, with no entry primed by hand.
    assert institutions.institution_timezone(ISTINYE_INSTITUTION["id"]).key == "Europe/Istanbul"
    assert institutions.institution_timezone(UCSC["id"]).key == "America/Los_Angeles"


@pytest.mark.parametrize(
    "institution_id",
    [None, "33333333-3333-4333-8333-333333333333", "not-a-uuid"],
    ids=["no-school", "unknown-id", "not-an-id"],
)
def test_institution_timezone_is_the_default_for_no_school_or_an_unknown_one(
    with_istinye, institution_id
):
    result = institutions.institution_timezone(institution_id)

    assert isinstance(result, ZoneInfo)
    assert result.key == "America/Los_Angeles"


def test_institution_timezone_is_the_default_before_the_institutions_table_exists(unmigrated):
    assert institutions.institution_timezone(ISTINYE_INSTITUTION["id"]).key == "America/Los_Angeles"


def test_institution_timezone_of_a_cached_school_without_one_is_the_default(monkeypatch):
    old = {k: v for k, v in ISTINYE_INSTITUTION.items() if k != "timezone"}
    monkeypatch.setattr(institutions, "_cache", (float("inf"), [old]))

    assert institutions.institution_timezone(old["id"]).key == "America/Los_Angeles"


def test_institution_timezone_needs_no_lookup_for_a_class_without_a_school(monkeypatch):
    # A class with no school must not cost a cache lookup, or fail in an outage with a cold cache.
    def load_institutions():
        raise AssertionError("load_institutions must not be called")

    monkeypatch.setattr(institutions, "load_institutions", load_institutions)

    assert institutions.institution_timezone(None).key == "America/Los_Angeles"


def test_institution_timezone_does_not_hide_an_outage_as_an_unknown_school(monkeypatch):
    # With nothing cached a failed read raises. Answering with the default zone would quietly
    # schedule a school in another zone (İstinye is 10-11 hours ahead) at the wrong hour.
    institutions.clear_institutions_cache()
    monkeypatch.setattr(
        institutions, "get_client", lambda: _FailingWith(pg_code="42501", pg_message="no grant")
    )

    with pytest.raises(DatabaseError):
        institutions.institution_timezone(ISTINYE_INSTITUTION["id"])
