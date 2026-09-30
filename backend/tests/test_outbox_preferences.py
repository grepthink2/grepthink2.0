"""Email preferences, suppressions and unsubscribe tokens (app.outbox.preferences).

The two tables exist on DEV only until their migration reaches PROD, so every read tolerates a
missing table (the defaults: every category on, no address suppressed) and only the writes that
cannot be skipped say so out loud.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, quote, urlsplit

import pytest
from fastapi import HTTPException

from app.config import settings
from app.core.db import MISSING_TABLE_CODES
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.institutions import controller as institutions
from app.outbox import preferences as prefs
from tests.fake_supabase import FakeSupabase

USER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
OTHER_USER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
EXPLICIT_SECRET = "unsubscribe-secret-for-tests"

ALL_ON = {"reminders": True, "digests": True}


# -- a database that fails -------------------------------------------------------------------


class _Broken(FakeSupabase):
    """FakeSupabase whose requests fail with the ``DatabaseError`` that ``make`` builds.

    ``fails(query)`` picks the requests that fail (every one by default). Same pattern as
    ``_FailingDb`` in tests/test_classes_invites.py, raising what the real client raises.
    """

    def __init__(self, make, fails=lambda query: True, **tables):
        super().__init__(**tables)
        self._make = make
        self._fails = fails

    def table(self, name):
        query = super().table(name)
        execute = query.execute

        def maybe_fail():
            if self._fails(query):
                raise self._make("read" if query._op == "select" else "write", name)
            return execute()

        query.execute = maybe_fail
        return query


def _no_table(pg_code):
    """The error of a table that does not exist: PostgREST's (PGRST205) or Postgres's (42P01)."""

    def make(operation, table):
        return DatabaseError(
            operation=operation,
            target=table,
            pg_code=pg_code,
            pg_message=f"Could not find the table 'public.{table}' in the schema cache",
        )

    return make


def _outage(operation, table):
    return DatabaseUnavailableError(
        operation=operation,
        target=table,
        pg_code="57014",
        pg_message="canceling statement due to statement timeout",
    )


def _denied(operation, table):
    return DatabaseError(
        operation=operation,
        target=table,
        pg_code="42501",
        pg_message=f"permission denied for table {table}",
    )


#: Failures that are real problems, not "the migration has not been applied yet".
OTHER_FAILURES = pytest.mark.parametrize("make", [_outage, _denied], ids=["outage", "denied"])
MISSING_TABLE = pytest.mark.parametrize("pg_code", sorted(MISSING_TABLE_CODES))


def test_missing_table_codes_are_what_postgrest_and_postgres_answer():
    assert frozenset({"PGRST205", "42P01"}) == MISSING_TABLE_CODES
    # One definition: the institutions loader uses this very set, not a copy of it.
    assert institutions._MISSING_TABLE_CODES is MISSING_TABLE_CODES


# -- reading preferences ---------------------------------------------------------------------


def test_every_category_defaults_to_on():
    db = FakeSupabase(email_preferences=[])
    assert prefs.get_preferences(db, USER) == ALL_ON
    assert db.executes == 1


def test_a_stored_opt_out_is_respected_for_that_user_only():
    db = FakeSupabase(
        email_preferences=[
            {"user_id": USER, "category": "reminders", "enabled": False},
            {"user_id": OTHER_USER, "category": "digests", "enabled": False},
        ]
    )
    assert prefs.get_preferences(db, USER) == {"reminders": False, "digests": True}
    assert db.executes == 1


def test_a_stored_opt_in_reads_as_on():
    db = FakeSupabase(email_preferences=[{"user_id": USER, "category": "digests", "enabled": True}])
    assert prefs.get_preferences(db, USER) == ALL_ON


def test_rows_of_categories_the_code_no_longer_has_are_ignored():
    db = FakeSupabase(
        email_preferences=[
            {"user_id": USER, "category": "weekly_recap", "enabled": False},
            {"user_id": USER, "category": "digests", "enabled": False},
        ]
    )
    assert prefs.get_preferences(db, USER) == {"reminders": True, "digests": False}


@MISSING_TABLE
def test_preferences_default_to_on_while_the_table_is_missing(pg_code):
    assert prefs.get_preferences(_Broken(_no_table(pg_code)), USER) == ALL_ON


@OTHER_FAILURES
def test_preferences_raise_any_other_database_error(make):
    with pytest.raises(DatabaseError) as caught:
        prefs.get_preferences(_Broken(make), USER)
    assert caught.value.target == "email_preferences"


# -- writing preferences ---------------------------------------------------------------------


def test_an_update_is_merged_into_the_stored_choices():
    db = FakeSupabase(
        email_preferences=[{"user_id": USER, "category": "digests", "enabled": False}]
    )
    merged = prefs.set_preferences(db, USER, {"reminders": False})
    assert merged == {"reminders": False, "digests": False}
    assert {(r["user_id"], r["category"]): r["enabled"] for r in db.rows("email_preferences")} == {
        (USER, "digests"): False,
        (USER, "reminders"): False,
    }
    assert db.executes == 2  # one read, one write


def test_an_update_can_turn_a_category_back_on():
    db = FakeSupabase(
        email_preferences=[{"user_id": USER, "category": "reminders", "enabled": False}]
    )
    assert prefs.set_preferences(db, USER, {"reminders": True}) == ALL_ON
    [row] = db.rows("email_preferences")
    assert row["enabled"] is True


def test_several_categories_are_written_in_one_request_with_the_same_columns():
    db = FakeSupabase()
    merged = prefs.set_preferences(db, USER, {"reminders": False, "digests": True})
    assert merged == {"reminders": False, "digests": True}
    assert db.executes == 2  # one read, one upsert for both rows
    rows = db.rows("email_preferences")
    assert {(r["category"], r["enabled"]) for r in rows} == {
        ("reminders", False),
        ("digests", True),
    }
    # PostgREST needs the same keys in every object of a bulk upsert. (The fake adds an "id".)
    assert all(set(r) - {"id"} == {"user_id", "category", "enabled", "updated_at"} for r in rows)
    assert {r["user_id"] for r in rows} == {USER}


def test_the_write_is_stamped_with_the_current_utc_time():
    db = FakeSupabase()
    before = datetime.now(UTC)
    prefs.set_preferences(db, USER, {"reminders": False})
    after = datetime.now(UTC)
    [row] = db.rows("email_preferences")
    stamped = datetime.fromisoformat(row["updated_at"])
    assert stamped.utcoffset() == timedelta(0)
    assert before <= stamped <= after


def test_there_is_one_row_per_user_and_category():
    db = FakeSupabase()
    prefs.set_preferences(db, USER, {"reminders": False})
    prefs.set_preferences(db, USER, {"digests": False})  # must not replace the reminders row
    prefs.set_preferences(db, OTHER_USER, {"reminders": False})  # nor another user's row
    assert prefs.set_preferences(db, USER, {"reminders": True}) == {
        "reminders": True,
        "digests": False,
    }
    assert {(r["user_id"], r["category"]): r["enabled"] for r in db.rows("email_preferences")} == {
        (USER, "reminders"): True,
        (USER, "digests"): False,
        (OTHER_USER, "reminders"): False,
    }
    assert len(db.rows("email_preferences")) == 3


@pytest.mark.parametrize(
    "updates",
    [
        {"bogus": True},
        {"reminders": False, "bogus": True},
        {"reminders": "yes", "bogus": True},  # the category is checked before the value
    ],
)
def test_an_unknown_category_is_a_400_and_nothing_is_written(updates):
    db = FakeSupabase()
    with pytest.raises(HTTPException) as caught:
        prefs.set_preferences(db, USER, updates)
    assert (caught.value.status_code, caught.value.detail) == (
        400,
        "Unknown email category: bogus",
    )
    assert db.executes == 0


@pytest.mark.parametrize(
    "updates",
    [
        {"reminders": "yes"},
        {"reminders": "false"},
        {"reminders": 1},
        {"reminders": 0},
        {"reminders": None},
        {"reminders": []},
        {"reminders": False, "digests": "no"},  # one bad value sinks the whole request
    ],
)
def test_a_value_that_is_not_a_boolean_is_a_400_and_nothing_is_written(updates):
    db = FakeSupabase()
    with pytest.raises(HTTPException) as caught:
        prefs.set_preferences(db, USER, updates)
    assert (caught.value.status_code, caught.value.detail) == (
        400,
        "Preferences must be true or false",
    )
    assert db.executes == 0


def test_no_updates_means_a_read_and_no_write():
    db = FakeSupabase(
        email_preferences=[{"user_id": USER, "category": "reminders", "enabled": False}]
    )
    assert prefs.set_preferences(db, USER, {}) == {"reminders": False, "digests": True}
    assert [q["op"] for q in db.queries] == ["select"]


@MISSING_TABLE
def test_saving_a_preference_is_a_503_while_the_table_is_missing(pg_code):
    db = _Broken(_no_table(pg_code))
    with pytest.raises(HTTPException) as caught:
        prefs.set_preferences(db, USER, {"reminders": False})
    assert (caught.value.status_code, caught.value.detail) == (
        503,
        "Email preferences are not available yet",
    )


@OTHER_FAILURES
def test_a_failed_write_is_not_mistaken_for_a_missing_table(make):
    # Still the DatabaseError it was: the 503 above is a plain HTTPException, not one of these.
    db = _Broken(make, fails=lambda query: query._op == "upsert")
    with pytest.raises(DatabaseError):
        prefs.set_preferences(db, USER, {"reminders": False})


def test_a_failed_read_stops_the_update_before_anything_is_written():
    db = _Broken(_outage)
    with pytest.raises(DatabaseUnavailableError):
        prefs.set_preferences(db, USER, {"reminders": False})
    assert not db.rows("email_preferences")


# -- is_enabled ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("user_id", "category"),
    [
        (None, "reminders"),  # no account to have a preference
        ("", "reminders"),
        (USER, None),  # transactional email has no category
        (None, None),
        (USER, "weekly_recap"),  # a category this code does not know is not switchable
    ],
)
def test_email_without_a_user_or_a_known_category_is_always_allowed(user_id, category):
    db = FakeSupabase(
        email_preferences=[
            {"user_id": USER, "category": "reminders", "enabled": False},
            {"user_id": USER, "category": "weekly_recap", "enabled": False},
        ]
    )
    assert prefs.is_enabled(db, user_id, category) is True
    assert db.executes == 0


def test_is_enabled_follows_the_stored_choice_of_that_user_and_category():
    db = FakeSupabase(
        email_preferences=[
            {"user_id": USER, "category": "reminders", "enabled": False},
            {"user_id": USER, "category": "digests", "enabled": True},
            {"user_id": OTHER_USER, "category": "digests", "enabled": False},
        ]
    )
    assert prefs.is_enabled(db, USER, "reminders") is False
    assert prefs.is_enabled(db, USER, "digests") is True
    assert prefs.is_enabled(db, OTHER_USER, "reminders") is True  # no row: on by default
    assert db.executes == 3  # one read each


@MISSING_TABLE
def test_is_enabled_is_true_while_the_table_is_missing(pg_code):
    assert prefs.is_enabled(_Broken(_no_table(pg_code)), USER, "reminders") is True


@OTHER_FAILURES
def test_is_enabled_raises_any_other_database_error(make):
    with pytest.raises(DatabaseError):
        prefs.is_enabled(_Broken(make), USER, "reminders")


# -- the category catalogue ------------------------------------------------------------------


def test_the_payload_lists_every_category_in_order_with_its_choice():
    assert prefs.preferences_payload({"digests": False, "reminders": True}) == [
        {
            "category": "reminders",
            "label": "Deadline reminders",
            "description": "Emails before a TSR or another deadline closes.",
            "enabled": True,
        },
        {
            "category": "digests",
            "label": "Unread message digests",
            "description": "A daily email when messages have been waiting over an hour.",
            "enabled": False,
        },
    ]


def test_the_payload_reads_a_missing_category_as_on():
    assert [item["enabled"] for item in prefs.preferences_payload({})] == [True, True]


def test_the_payload_follows_get_preferences():
    db = FakeSupabase(
        email_preferences=[{"user_id": USER, "category": "digests", "enabled": False}]
    )
    payload = prefs.preferences_payload(prefs.get_preferences(db, USER))
    assert {item["category"]: item["enabled"] for item in payload} == {
        "reminders": True,
        "digests": False,
    }


def test_category_label():
    assert prefs.category_label("reminders") == "Deadline reminders"
    assert prefs.category_label("digests") == "Unread message digests"
    assert prefs.category_label("bogus") is None


def test_category_names_are_safe_inside_a_token_and_a_url():
    # Tokens are "<user>.<category>.<signature>" and go into a link unquoted.
    assert all(re.fullmatch(r"[a-z][a-z_]*", name) for name in prefs.CATEGORIES)


# -- suppressions ----------------------------------------------------------------------------


@pytest.mark.parametrize("reason", sorted(prefs.SUPPRESSION_REASONS))
def test_a_suppressed_address_is_found_however_it_is_written(reason):
    db = FakeSupabase(email_suppressions=[{"email": "ann@example.com", "reason": reason}])
    assert prefs.suppression_reason(db, "ann@example.com") == reason
    assert prefs.suppression_reason(db, "  Ann@Example.COM \n") == reason
    assert db.executes == 2  # one read each


def test_an_address_that_was_never_suppressed_has_no_reason():
    db = FakeSupabase(email_suppressions=[{"email": "ann@example.com", "reason": "bounced"}])
    assert prefs.suppression_reason(db, "bob@example.com") is None
    assert db.executes == 1


@MISSING_TABLE
def test_nothing_is_suppressed_while_the_table_is_missing(pg_code):
    assert prefs.suppression_reason(_Broken(_no_table(pg_code)), "ann@example.com") is None


@OTHER_FAILURES
def test_a_failed_suppression_lookup_is_raised_not_read_as_clear(make):
    # Reading an outage as "not suppressed" would mail an address that bounced.
    with pytest.raises(DatabaseError) as caught:
        prefs.suppression_reason(_Broken(make), "ann@example.com")
    assert caught.value.target == "email_suppressions"


def test_suppress_stores_the_address_lower_cased_and_trimmed():
    db = FakeSupabase()
    prefs.suppress(db, "  Ann@Example.COM ", "bounced", "550 5.1.1 mailbox unavailable")
    [row] = db.rows("email_suppressions")
    assert (row["email"], row["reason"], row["detail"]) == (
        "ann@example.com",
        "bounced",
        "550 5.1.1 mailbox unavailable",
    )
    # created_at is left to the column default, so a repeat does not move it.
    assert set(row) - {"id"} == {"email", "reason", "detail"}


def test_suppress_overwrites_the_reason_and_detail_of_a_known_address():
    db = FakeSupabase()
    prefs.suppress(db, "ann@example.com", "bounced", "mailbox full")
    prefs.suppress(db, "ANN@example.com", "complained")
    [row] = db.rows("email_suppressions")
    assert (row["email"], row["reason"], row["detail"]) == ("ann@example.com", "complained", None)


@pytest.mark.parametrize("reason", sorted(prefs.SUPPRESSION_REASONS))
def test_suppress_takes_every_reason_the_table_allows(reason):
    db = FakeSupabase()
    prefs.suppress(db, "ann@example.com", reason)
    assert prefs.suppression_reason(db, "ann@example.com") == reason


@pytest.mark.parametrize("reason", ["spam", "", "Bounced", None])
def test_suppress_refuses_a_reason_the_table_would_reject(reason):
    db = FakeSupabase()
    with pytest.raises(ValueError):
        prefs.suppress(db, "ann@example.com", reason)
    assert db.executes == 0


def test_the_reasons_are_the_ones_of_the_tables_check_constraint():
    # 2026-09-30_email_preferences.sql: CHECK (reason IN ('bounced', 'rejected', 'complained'))
    assert {"bounced", "rejected", "complained"} == prefs.SUPPRESSION_REASONS


@MISSING_TABLE
def test_suppress_fails_loudly_while_the_table_is_missing(pg_code):
    # The webhook answers 503 so Maileroo retries. Swallowing this would lose the bounce.
    with pytest.raises(DatabaseError) as caught:
        prefs.suppress(_Broken(_no_table(pg_code)), "ann@example.com", "bounced")
    assert caught.value.pg_code == pg_code


def test_suppress_fails_loudly_during_an_outage():
    with pytest.raises(DatabaseUnavailableError):
        prefs.suppress(_Broken(_outage), "ann@example.com", "bounced")


# -- unsubscribe tokens ----------------------------------------------------------------------


@pytest.fixture
def explicit_secret(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", EXPLICIT_SECRET)


def _signature(key: bytes, user_id: str, category: str) -> str:
    """The signature of a token, written out independently of the code under test.

    Links already in people's inboxes keep working across deploys only while this format
    does not change, so the tests pin it.
    """
    digest = hmac.new(key, f"unsubscribe:v1:{user_id}:{category}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def _derived_key(jwt_secret: str) -> bytes:
    return hmac.new(jwt_secret.encode(), b"grepthink/email-unsubscribe/v1", hashlib.sha256).digest()


@pytest.mark.parametrize("category", sorted(prefs.CATEGORIES))
def test_a_token_has_a_fixed_format_and_reads_back(explicit_secret, category):
    token = prefs.make_unsubscribe_token(USER, category)
    assert token == f"{USER}.{category}.{_signature(EXPLICIT_SECRET.encode(), USER, category)}"
    assert prefs.read_unsubscribe_token(token) == (USER, category)


def test_a_token_needs_no_url_quoting(explicit_secret):
    token = prefs.make_unsubscribe_token(USER, "reminders")
    assert quote(token, safe="") == token


@pytest.mark.parametrize(
    "tamper",
    [
        lambda t: t[:-1] + ("A" if t[-1] != "A" else "B"),
        lambda t: t[:-1],
        lambda t: t + "A",
        lambda t: t.rsplit(".", 1)[0] + ".",
    ],
    ids=["changed", "truncated", "extended", "removed"],
)
def test_a_tampered_signature_is_rejected(explicit_secret, tamper):
    token = prefs.make_unsubscribe_token(USER, "reminders")
    assert prefs.read_unsubscribe_token(tamper(token)) is None


def test_the_signature_is_compared_in_constant_time(monkeypatch, explicit_secret):
    # Not observable through behaviour, so pin it: a plain == would leak how much matched.
    compared = []
    real = hmac.compare_digest

    def spy(a, b):
        compared.append((a, b))
        return real(a, b)

    monkeypatch.setattr(hmac, "compare_digest", spy)
    token = prefs.make_unsubscribe_token(USER, "reminders")
    assert prefs.read_unsubscribe_token(token) == (USER, "reminders")
    assert compared == [(token.rsplit(".", 1)[1],) * 2]


def test_a_token_is_bound_to_its_category(explicit_secret):
    token = prefs.make_unsubscribe_token(USER, "reminders")
    assert prefs.read_unsubscribe_token(token.replace(".reminders.", ".digests.")) is None


def test_a_token_is_bound_to_its_user(explicit_secret):
    token = prefs.make_unsubscribe_token(USER, "reminders")
    assert prefs.read_unsubscribe_token(token.replace(USER, OTHER_USER)) is None


def test_a_signed_token_of_a_category_the_code_no_longer_has_is_rejected(explicit_secret):
    key = EXPLICIT_SECRET.encode()
    token = f"{USER}.weekly_recap.{_signature(key, USER, 'weekly_recap')}"
    assert prefs.read_unsubscribe_token(token) is None


def test_a_signed_token_of_something_that_is_not_a_user_id_is_rejected(explicit_secret):
    key = EXPLICIT_SECRET.encode()
    token = f"user-abc.reminders.{_signature(key, 'user-abc', 'reminders')}"
    assert prefs.read_unsubscribe_token(token) is None


@pytest.mark.parametrize(
    ("user_id", "category"),
    [
        ("user-abc", "reminders"),  # not a UUID
        ("", "reminders"),
        (None, "reminders"),
        (42, "reminders"),  # not an id at all
        (USER[:-1], "reminders"),  # one character short
        (USER, "bogus"),
        (USER, ""),
        (USER, None),
    ],
)
def test_no_token_is_made_for_what_could_not_be_read_back(explicit_secret, user_id, category):
    assert prefs.make_unsubscribe_token(user_id, category) is None


def test_a_token_is_made_in_the_canonical_spelling_of_the_user_id(explicit_secret):
    token = prefs.make_unsubscribe_token(USER.upper(), "reminders")
    assert token == prefs.make_unsubscribe_token(USER, "reminders")
    assert token.startswith(f"{USER}.")


def test_a_token_can_be_made_from_a_uuid_object(explicit_secret):
    token = prefs.make_unsubscribe_token(uuid.UUID(USER), "reminders")
    assert token == prefs.make_unsubscribe_token(USER, "reminders")
    assert prefs.read_unsubscribe_token(token) == (USER, "reminders")


@pytest.mark.parametrize("error", [TypeError, AttributeError])
def test_a_user_id_that_cannot_be_turned_into_text_gets_no_token(explicit_secret, error):
    class Unprintable:
        def __str__(self):
            raise error("no text")

    assert prefs.make_unsubscribe_token(Unprintable(), "reminders") is None


_ARABIC_INDIC_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


@pytest.mark.parametrize(
    "respell",
    [
        str.upper,
        lambda user: "{" + user + "}",
        lambda user: "urn:uuid:" + user,
        lambda user: user.replace("-", ""),
        lambda user: user.translate(_ARABIC_INDIC_DIGITS),
    ],
    ids=["upper-case", "braced", "urn", "unhyphenated", "non-ascii-digits"],
)
def test_a_token_only_reads_back_with_the_user_id_spelled_as_it_was_made(explicit_secret, respell):
    # uuid.UUID reads every one of these as the same user, yet no token was ever made with one.
    # Neither the real signature (a reader that merely canonicalized would accept that) nor a
    # signature computed over the odd spelling (one that merely checked the id parses) gets it in.
    key = EXPLICIT_SECRET.encode()
    spelled = respell(USER)
    token = prefs.make_unsubscribe_token(USER, "reminders")
    signed_over_it = f"{spelled}.reminders.{_signature(key, spelled, 'reminders')}"
    assert uuid.UUID(spelled) == uuid.UUID(USER)
    assert prefs.read_unsubscribe_token(token) == (USER, "reminders")
    assert prefs.read_unsubscribe_token(token.replace(USER, spelled)) is None
    assert prefs.read_unsubscribe_token(signed_over_it) is None


@pytest.mark.parametrize(
    "junk",
    [
        "",
        None,
        42,
        b"bytes",
        ".",
        "...",
        "a.b",
        "a.b.c",
        "a.b.c.d",
        f"{USER}.reminders",
        f"{USER}.reminders.",
        f"{USER}.reminders.é",  # compare_digest raises on non-ASCII text
        "é.reminders.x",
        f"{USER}.reminders.{'A' * 43}.{'A' * 43}",
        "x" * 5000,
        " ",
    ],
)
def test_junk_is_none_and_never_raises(explicit_secret, junk):
    assert prefs.read_unsubscribe_token(junk) is None


def test_the_key_falls_back_to_one_derived_from_the_jwt_secret(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", "")
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "jwt-secret-A")
    token = prefs.make_unsubscribe_token(USER, "digests")
    assert token == f"{USER}.digests.{_signature(_derived_key('jwt-secret-A'), USER, 'digests')}"
    assert prefs.read_unsubscribe_token(token) == (USER, "digests")

    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "jwt-secret-B")
    assert prefs.read_unsubscribe_token(token) is None


def test_an_explicit_secret_wins_over_the_jwt_fallback(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "jwt-secret-A")
    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", "")
    derived_token = prefs.make_unsubscribe_token(USER, "reminders")
    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", EXPLICIT_SECRET)
    explicit_token = prefs.make_unsubscribe_token(USER, "reminders")

    assert explicit_token != derived_token
    assert prefs.read_unsubscribe_token(explicit_token) == (USER, "reminders")
    assert prefs.read_unsubscribe_token(derived_token) is None

    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", "")
    assert prefs.read_unsubscribe_token(derived_token) == (USER, "reminders")
    assert prefs.read_unsubscribe_token(explicit_token) is None


def test_a_token_does_not_verify_under_another_secret(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", "secret-one")
    token = prefs.make_unsubscribe_token(USER, "reminders")
    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", "secret-two")
    assert prefs.read_unsubscribe_token(token) is None


@pytest.mark.parametrize("unset", ["", None])
def test_without_any_secret_no_token_is_made_or_accepted(monkeypatch, explicit_secret, unset):
    token = prefs.make_unsubscribe_token(USER, "reminders")  # made while a key existed
    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", unset)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", unset)
    assert prefs.make_unsubscribe_token(USER, "reminders") is None
    assert prefs.read_unsubscribe_token(token) is None


# -- unsubscribe links -----------------------------------------------------------------------


def _token_of(link: str) -> str:
    return parse_qs(urlsplit(link).query)["token"][0]


def test_the_links_carry_one_token_to_the_page_and_to_the_one_click_endpoint(
    monkeypatch, explicit_secret
):
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.com")
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "https://api.example.com")
    token = prefs.make_unsubscribe_token(USER, "digests")

    page, one_click = prefs.unsubscribe_links(USER, "digests")

    assert page == f"https://app.example.com/unsubscribe?token={token}"
    assert one_click == f"https://api.example.com/api/email/unsubscribe?token={token}"
    assert prefs.read_unsubscribe_token(_token_of(page)) == (USER, "digests")
    assert prefs.read_unsubscribe_token(_token_of(one_click)) == (USER, "digests")


def test_without_a_public_api_url_there_is_only_the_page_link(monkeypatch, explicit_secret):
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.com")
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "")
    token = prefs.make_unsubscribe_token(USER, "digests")

    assert prefs.unsubscribe_links(USER, "digests") == (
        f"https://app.example.com/unsubscribe?token={token}",
        None,
    )


def test_the_links_can_be_made_from_a_uuid_object(monkeypatch, explicit_secret):
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.com")
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "https://api.example.com")
    token = prefs.make_unsubscribe_token(USER, "digests")

    assert prefs.unsubscribe_links(uuid.UUID(USER), "digests") == (
        f"https://app.example.com/unsubscribe?token={token}",
        f"https://api.example.com/api/email/unsubscribe?token={token}",
    )


def test_trailing_slashes_on_the_base_urls_are_dropped(monkeypatch, explicit_secret):
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.com/")
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "https://api.example.com/")
    page, one_click = prefs.unsubscribe_links(USER, "reminders")
    assert page.startswith("https://app.example.com/unsubscribe?token=")
    assert one_click.startswith("https://api.example.com/api/email/unsubscribe?token=")


def test_there_are_no_links_without_a_key(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", "")
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "")
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "https://api.example.com")
    assert prefs.unsubscribe_links(USER, "digests") == (None, None)


@pytest.mark.parametrize(("user_id", "category"), [("user-abc", "digests"), (USER, "bogus")])
def test_there_are_no_links_for_what_no_token_can_be_made_for(
    monkeypatch, explicit_secret, user_id, category
):
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "https://api.example.com")
    assert prefs.unsubscribe_links(user_id, category) == (None, None)


# -- suppression_reasons: a whole batch in one read ------------------------------------------


def test_suppression_reasons_reads_a_whole_batch_at_once():
    db = FakeSupabase(
        email_suppressions=[
            {"email": "ann@example.com", "reason": "bounced"},
            {"email": "bob@example.com", "reason": "complained"},
            {"email": "zed@example.com", "reason": "rejected"},
        ]
    )
    reasons = prefs.suppression_reasons(
        db, ["  Ann@Example.COM ", "bob@example.com", "cat@example.com", "ANN@example.com"]
    )
    assert reasons == {"ann@example.com": "bounced", "bob@example.com": "complained"}
    [query] = db.queries
    # Each address once, the way the table stores it.
    assert query["filters"] == [
        ("email", "in", ["ann@example.com", "bob@example.com", "cat@example.com"])
    ]


def test_suppression_reasons_takes_any_iterable():
    db = FakeSupabase(email_suppressions=[{"email": "ann@example.com", "reason": "bounced"}])
    emails = (address for address in ["ann@example.com", "bob@example.com"])
    assert prefs.suppression_reasons(db, emails) == {"ann@example.com": "bounced"}
    assert db.executes == 1


@pytest.mark.parametrize(
    "emails", [[], (), ["", "   "], [None]], ids=["list", "tuple", "blank", "none"]
)
def test_suppression_reasons_of_no_address_reads_nothing(emails):
    db = FakeSupabase(email_suppressions=[{"email": "ann@example.com", "reason": "bounced"}])
    assert prefs.suppression_reasons(db, emails) == {}
    assert db.executes == 0


def test_a_long_list_is_read_in_chunks_that_fit_in_a_url():
    # The addresses travel in the query string, which has a length limit.
    emails = [f"s{index:03d}@example.com" for index in range(250)]
    db = FakeSupabase(
        email_suppressions=[
            {"email": "s000@example.com", "reason": "bounced"},
            {"email": "s249@example.com", "reason": "complained"},
        ]
    )
    assert prefs.suppression_reasons(db, emails) == {
        "s000@example.com": "bounced",
        "s249@example.com": "complained",
    }
    assert [len(query["filters"][0][2]) for query in db.queries] == [100, 100, 50]


@MISSING_TABLE
def test_no_address_in_a_batch_is_suppressed_while_the_table_is_missing(pg_code):
    db = _Broken(_no_table(pg_code))
    assert prefs.suppression_reasons(db, ["ann@example.com", "bob@example.com"]) == {}


@OTHER_FAILURES
def test_a_failed_batch_lookup_is_raised_not_read_as_clear(make):
    with pytest.raises(DatabaseError) as caught:
        prefs.suppression_reasons(_Broken(make), ["ann@example.com"])
    assert caught.value.target == "email_suppressions"
