"""An institutions-table outage must not turn an already-saved write, or a routine
``GET /api/notifications``, into a 500.

``needs_roster_email`` (``app/utils/profiles.py``) backs the complete-your-profile reminder on
three paths: ``verify_edu_email``/``update_profile`` refreshing it after a save, and
``ensure_profile_completion_notification`` on every notifications list. None of those are the
school-email *gate* itself (``_normalize_edu_email``, and the three ``create_user`` call sites),
which must keep failing closed — those are covered elsewhere (``test_auth_hardening.py``,
``test_auth_views.py``).
"""

from __future__ import annotations

import logging
import re
from unittest.mock import MagicMock, patch

import pytest

from app.core.errors import DatabaseError
from tests.conftest import header_for
from tests.fake_supabase import FakeSupabase

USER = "user-abc"  # the `sub` of conftest's auth_header token


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        profiles=[
            {
                "id": USER,
                "email": "ann@gmail.com",  # not a school domain by itself
                "edu_email": None,
                "role": "student",
                "first_name": "Ann",
                "last_name": "Lee",
            }
        ],
        edu_email_verifications=[],
        notifications=[],
    )
    fake.auth = MagicMock()
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


@pytest.fixture
def mailer():
    with patch("app.profiles.controller.send_email") as send:
        send.code = lambda: re.search(r"\b(\d{6})\b", send.call_args.kwargs["body_text"]).group(1)
        yield send


@pytest.fixture
def _no_profile_notification():
    # create_user ends by refreshing the complete-profile reminder on success; the signup test
    # below only cares that the gate itself fails closed, not about that follow-up call.
    with patch("app.notifications.controller.ensure_profile_completion_notification"):
        yield


def _knock_institutions_offline(monkeypatch):
    """From this point on, any ``load_institutions`` read raises with nothing cached."""
    from app.institutions import controller as institutions

    class _Unreachable:
        def table(self, name):
            raise DatabaseError(
                operation="read", target=name, pg_code="42501", pg_message="no grant"
            )

    monkeypatch.setattr(institutions, "get_client", lambda: _Unreachable())
    # Looks expired, and there is no previous good list to fall back on.
    monkeypatch.setattr(institutions, "_cache", (0.0, None))


@pytest.fixture
def institutions_down(monkeypatch):
    _knock_institutions_offline(monkeypatch)


def test_a_student_with_a_roster_email_never_calls_the_loader(monkeypatch):
    """The cheap checks (role, an existing roster email) run first and short-circuit."""
    from app.institutions import controller as institutions
    from app.utils.profiles import needs_roster_email

    def _must_not_be_called():
        raise AssertionError("load_institutions must not be called")

    monkeypatch.setattr(institutions, "load_institutions", _must_not_be_called)

    profile = {"role": "student", "edu_email": "ann@ucsc.edu", "email": "ann@gmail.com"}
    assert needs_roster_email(profile) is False


def test_a_non_student_never_calls_the_loader_either(monkeypatch):
    from app.institutions import controller as institutions
    from app.utils.profiles import needs_roster_email

    def _must_not_be_called():
        raise AssertionError("load_institutions must not be called")

    monkeypatch.setattr(institutions, "load_institutions", _must_not_be_called)

    profile = {"role": "instructor", "edu_email": None, "email": "ann@gmail.com"}
    assert needs_roster_email(profile) is False


def test_verify_edu_email_succeeds_even_when_institutions_goes_down_right_after(
    client, auth_header, db, mailer, monkeypatch
):
    # Institutions is healthy for the send — conftest's autouse fixture caches UC Santa Cruz.
    sent = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": "ann@ucsc.edu"},
    )
    assert sent.status_code == 200
    code = mailer.code()

    _knock_institutions_offline(monkeypatch)

    res = client.post(
        "/api/profiles/verify-edu-email",
        headers=auth_header,
        json={"edu_email": "ann@ucsc.edu", "code": code},
    )

    assert res.status_code == 200, res.text
    assert db.rows("profiles")[0]["edu_email"] == "ann@ucsc.edu"


def test_patch_profile_succeeds_when_institutions_is_down(
    client, auth_header, db, institutions_down, caplog
):
    with caplog.at_level(logging.WARNING, logger="app.profiles.controller"):
        res = client.patch("/api/profiles/me", headers=auth_header, json={"first_name": "Anna"})

    assert res.status_code == 200, res.text
    assert db.rows("profiles")[0]["first_name"] == "Anna"
    # Best-effort, not silent: the completeness check's failure is logged.
    assert "completeness check failed" in caplog.text


def test_get_notifications_succeeds_when_institutions_is_down(
    client, auth_header, db, institutions_down
):
    res = client.get("/api/notifications", headers=auth_header)

    assert res.status_code == 200, res.text


def test_signup_still_fails_closed_when_institutions_is_down(
    client, db, institutions_down, _no_profile_notification
):
    """The gate paths (create_user's is_school_email calls) are not best-effort: unlike the
    reminder refresh, an outage here must not silently guess whether the address is a school
    email. A plain ".edu" address needs no lookup (short-circuits in is_school_email), so this
    uses an ordinary address that can only be resolved by actually reading the institution list.
    """
    db.rows("profiles").clear()

    res = client.post(
        "/api/create-user",
        headers=header_for("ann@gmail.com"),
        json={"email": "ann@gmail.com", "userId": USER, "userType": "student"},
    )

    assert res.status_code in (500, 503)
    assert res.json()["code"] in ("database_read_failed", "database_unavailable")
    assert db.rows("profiles") == []
