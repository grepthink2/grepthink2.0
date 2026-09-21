"""The roster .edu address is written only once its owner has proven they hold it.

``profiles.edu_email`` wins when a roster is matched to accounts, so whoever holds an address
there owns that student's roster row. ``PATCH /api/profiles/me`` can clear it but never set it;
the only writer is ``verify-edu-email``. Codes live in the database (serverless instances share
no memory), are stored hashed, expire, can be re-sent at most once a minute, and die after five
wrong guesses. ``/api/create-user``, the other place an address is written, is pinned in
``test_auth_views.py``.

``GET /api/profiles/me`` copies the login email from the verified token into ``profiles.email``
when they differ (after a Supabase email change); see the last section.
"""

from __future__ import annotations

import datetime
import logging
import re
from unittest.mock import patch

import pytest

from app.utils.email_transport import (
    EmailMisconfiguredError,
    EmailNotConfiguredError,
    PermanentEmailError,
    TransientEmailError,
)
from tests.conftest import header_for
from tests.fake_supabase import FakeSupabase

USER = "user-abc"  # the `sub` of conftest's auth_header token
OLD = "2020-01-01T00:00:00+00:00"


@pytest.fixture(autouse=True)
def _no_profile_notification():
    # Profile writes end by refreshing the complete-profile reminder; not under test here.
    with (
        patch("app.notifications.controller.ensure_profile_completion_notification"),
        patch("app.notifications.controller.dismiss_profile_completion_notification"),
    ):
        yield


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        profiles=[
            {
                "id": USER,
                "email": "ann@gmail.com",
                "edu_email": None,
                "role": "student",
                "first_name": "Ann",
                "last_name": "Lee",
            },
            {
                "id": "u-other",
                "email": "bo@ucsc.edu",
                "edu_email": "bo@ucsc.edu",
                "role": "student",
            },
        ],
        edu_email_verifications=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


@pytest.fixture
def mailer():
    """Stands in for SMTP; ``mailer.code()`` is the code the last email carried."""
    with patch("app.profiles.controller.send_email") as send:
        send.code = lambda: re.search(r"\b(\d{6})\b", send.call_args.kwargs["body_text"]).group(1)
        yield send


def _profile(db: FakeSupabase, user_id: str = USER) -> dict:
    return next(p for p in db.rows("profiles") if p["id"] == user_id)


def _pending(db: FakeSupabase) -> list[dict]:
    return db.rows("edu_email_verifications")


# ── the profile endpoint can no longer claim a roster address ────────────────────


def test_patch_me_refuses_to_set_the_edu_email(client, auth_header, db):
    res = client.patch(
        "/api/profiles/me",
        headers=auth_header,
        json={"first_name": "Mallory", "edu_email": "bo@ucsc.edu"},
    )

    assert res.status_code == 400
    assert "verif" in res.json()["detail"].lower()
    # The whole request is refused, not just the one field.
    assert _profile(db)["edu_email"] is None
    assert _profile(db)["first_name"] == "Ann"


@pytest.mark.parametrize("cleared", [None, "", "  "])
def test_patch_me_can_still_remove_the_edu_email(client, auth_header, db, cleared):
    _profile(db)["edu_email"] = "ann@ucsc.edu"

    res = client.patch("/api/profiles/me", headers=auth_header, json={"edu_email": cleared})

    assert res.status_code == 200
    assert _profile(db)["edu_email"] is None


def test_patch_me_still_updates_the_other_fields(client, auth_header, db):
    res = client.patch("/api/profiles/me", headers=auth_header, json={"first_name": "Anna"})

    assert res.status_code == 200
    assert _profile(db)["first_name"] == "Anna"


# ── sending a verification code ──────────────────────────────────────────────────


def test_send_keeps_a_hashed_code_in_the_database(client, auth_header, db, mailer):
    res = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": " Ann@UCSC.edu "},
    )

    assert res.status_code == 200
    assert res.json()["delivery"] == "email"
    assert mailer.call_args.kwargs["to"] == "ann@ucsc.edu"
    [row] = _pending(db)
    assert (row["user_id"], row["edu_email"], row["attempts"]) == (USER, "ann@ucsc.edu", 0)
    assert mailer.code() not in {str(v) for v in row.values()}
    expires = datetime.datetime.fromisoformat(row["expires_at"])
    remaining = expires - datetime.datetime.now(datetime.UTC)
    assert datetime.timedelta(minutes=9) < remaining <= datetime.timedelta(minutes=10)
    # Nothing is claimed until the code comes back.
    assert _profile(db)["edu_email"] is None


@pytest.mark.parametrize(
    "address",
    [
        "ann@gmail.com",
        "ann@ucsc.edu\nBcc: victim@ucsc.edu",
        "ann @ucsc.edu",
        "@ucsc.edu",
        "ann@@ucsc.edu",
        "<b>ann</b>@ucsc.edu",
        "ann@evil.com,ucsc.edu",  # a comma can turn one address into several downstream
        "İpek@ucsc.edu",  # lower-cases to "i̇pek@..." — a combining mark, not plain ASCII
    ],
)
def test_send_refuses_anything_but_one_plain_edu_mailbox(client, auth_header, db, mailer, address):
    res = client.post(
        "/api/profiles/send-edu-verification", headers=auth_header, json={"edu_email": address}
    )

    assert res.status_code == 400
    assert _pending(db) == []
    mailer.assert_not_called()


def test_an_apostrophe_in_the_mailbox_is_accepted_and_escaped_in_the_email(
    client, auth_header, db, mailer
):
    # Google Workspace and Microsoft 365 both allow "'" in the local part (o'brien@...), and it
    # is plain atext in a To: header; the HTML body escapes it.
    res = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": "O'Brien@ucsc.edu"},
    )

    assert res.status_code == 200, res.text
    sent = mailer.call_args.kwargs
    assert sent["to"] == "o'brien@ucsc.edu"
    assert "<strong>o&#x27;brien@ucsc.edu</strong>" in sent["body_html"]
    assert "o'brien" not in sent["body_html"]
    assert _pending(db)[0]["edu_email"] == "o'brien@ucsc.edu"

    verified = client.post(
        "/api/profiles/verify-edu-email",
        headers=auth_header,
        json={"edu_email": "o'brien@ucsc.edu", "code": mailer.code()},
    )
    assert verified.status_code == 200, verified.text
    assert _profile(db)["edu_email"] == "o'brien@ucsc.edu"


def test_send_answers_409_when_another_account_holds_the_address(client, auth_header, db, mailer):
    res = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": "BO@ucsc.edu"},
    )

    assert res.status_code == 409
    assert _pending(db) == []
    mailer.assert_not_called()


def test_send_allows_one_code_a_minute(client, auth_header, db, mailer):
    body = {"edu_email": "ann@ucsc.edu"}
    assert (
        client.post(
            "/api/profiles/send-edu-verification", headers=auth_header, json=body
        ).status_code
        == 200
    )
    first_hash = _pending(db)[0]["code_hash"]

    again = client.post("/api/profiles/send-edu-verification", headers=auth_header, json=body)

    assert again.status_code == 429
    assert mailer.call_count == 1
    assert _pending(db)[0]["code_hash"] == first_hash


def test_send_replaces_an_older_code_and_resets_the_attempts(client, auth_header, db, mailer):
    _pending(db).append(
        {
            "user_id": USER,
            "edu_email": "old@ucsc.edu",
            "code_hash": "stale",
            "attempts": 4,
            "expires_at": "2099-01-01T00:00:00+00:00",
            "last_sent_at": OLD,
        }
    )

    res = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": "ann@ucsc.edu"},
    )

    assert res.status_code == 200
    [row] = _pending(db)
    assert (row["edu_email"], row["attempts"]) == ("ann@ucsc.edu", 0)
    assert row["code_hash"] != "stale"


def test_send_without_smtp_logs_the_code_on_a_developer_machine(
    client, auth_header, db, monkeypatch, caplog
):
    monkeypatch.delenv("VERCEL", raising=False)
    with (
        patch(
            "app.profiles.controller.send_email", side_effect=RuntimeError("SMTP not configured")
        ),
        caplog.at_level(logging.WARNING, logger="app.profiles.controller"),
    ):
        res = client.post(
            "/api/profiles/send-edu-verification",
            headers=auth_header,
            json={"edu_email": "ann@ucsc.edu"},
        )

    assert res.status_code == 200
    assert res.json()["delivery"] == "log"
    assert len(_pending(db)) == 1
    assert re.search(r"\b\d{6}\b", caplog.text)
    # The code goes to the server log only, never back to the caller.
    assert not re.search(r"\d{6}", res.text)


def test_send_without_smtp_on_a_deployment_answers_503_and_keeps_nothing(
    client, auth_header, db, monkeypatch
):
    monkeypatch.setenv("VERCEL", "1")
    with patch(
        "app.profiles.controller.send_email", side_effect=RuntimeError("SMTP not configured")
    ):
        res = client.post(
            "/api/profiles/send-edu-verification",
            headers=auth_header,
            json={"edu_email": "ann@ucsc.edu"},
        )

    assert res.status_code == 503
    assert _pending(db) == []


@pytest.mark.parametrize(
    ("on_a_deployment", "status"),
    [(False, 200), (True, 503)],
    ids=["developer-machine", "deployment"],
)
def test_send_with_no_email_provider_keeps_its_own_answer_not_the_delivery_failure_one(
    client, auth_header, db, monkeypatch, on_a_deployment, status
):
    """EmailNotConfiguredError is a delivery error too, but the RuntimeError branch comes first:
    a missing provider is the administrator's problem (503, or the log on a developer machine),
    not "try again in a minute"."""
    if on_a_deployment:
        monkeypatch.setenv("VERCEL", "1")
    else:
        monkeypatch.delenv("VERCEL", raising=False)
    with patch(
        "app.profiles.controller.send_email", side_effect=EmailNotConfiguredError("nothing set")
    ):
        res = client.post(
            "/api/profiles/send-edu-verification",
            headers=auth_header,
            json={"edu_email": "ann@ucsc.edu"},
        )

    assert res.status_code == status, res.text


TRY_AGAIN = "Couldn't send the verification email. Try again in a minute."
CHECK_THE_ADDRESS = "We couldn't send a code to that address. Check it and try again."


@pytest.mark.parametrize(
    ("failure", "detail", "level"),
    [
        pytest.param(
            TransientEmailError("provider unreachable"), TRY_AGAIN, logging.WARNING, id="transient"
        ),
        # A bad key while students verify must reach Sentry: it is user-driven, so it is loud
        # the moment it starts, and low volume, so it cannot flood. The others are not worth one.
        pytest.param(
            EmailMisconfiguredError("provider refused us"),
            TRY_AGAIN,
            logging.ERROR,
            id="misconfigured",
        ),
        # Only a permanent failure points at the address: the rest are not the user's to fix.
        pytest.param(
            PermanentEmailError("address rejected"),
            CHECK_THE_ADDRESS,
            logging.WARNING,
            id="permanent",
        ),
    ],
)
def test_send_answers_502_and_keeps_nothing_when_the_email_cannot_be_delivered(
    client, auth_header, db, mailer, caplog, failure, detail, level
):
    mailer.side_effect = failure
    with caplog.at_level(logging.WARNING, logger="app.profiles.controller"):
        res = client.post(
            "/api/profiles/send-edu-verification",
            headers=auth_header,
            json={"edu_email": "ann@ucsc.edu"},
        )

    assert res.status_code == 502, res.text
    assert res.json()["detail"] == detail
    # Nobody has a code to enter, so none is left pending.
    assert _pending(db) == []
    # The failure is logged, but the code that never arrived is not.
    [record] = [r for r in caplog.records if "email delivery failed" in r.getMessage()]
    assert record.levelno == level
    assert not re.search(r"\b\d{6}\b", caplog.text)
    assert not re.search(r"\d{6}", res.text)


def test_a_retry_right_after_a_failed_delivery_is_not_rate_limited(client, auth_header, db, mailer):
    """The once-a-minute limit reads the pending row's last_sent_at, and a failed send leaves no
    row, so a code that never went out does not cost the user a minute."""
    body = {"edu_email": "ann@ucsc.edu"}
    mailer.side_effect = TransientEmailError("provider unreachable")
    failed = client.post("/api/profiles/send-edu-verification", headers=auth_header, json=body)
    assert failed.status_code == 502

    mailer.side_effect = None  # the provider is back
    retry = client.post("/api/profiles/send-edu-verification", headers=auth_header, json=body)

    assert retry.status_code == 200, retry.text
    assert len(_pending(db)) == 1
    assert mailer.call_count == 2


def test_a_failed_delivery_forgets_the_code_it_replaced_too(client, auth_header, db, mailer):
    """A new code replaces the old one before it is emailed, so after a failed send there is no
    code that could still be valid: the row goes, rather than keeping one nobody was sent."""
    _pending(db).append(
        {
            "user_id": USER,
            "edu_email": "old@ucsc.edu",
            "code_hash": "stale",
            "attempts": 1,
            "expires_at": "2099-01-01T00:00:00+00:00",
            "last_sent_at": OLD,
        }
    )
    mailer.side_effect = PermanentEmailError("address rejected")

    res = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": "ann@ucsc.edu"},
    )

    assert res.status_code == 502
    assert _pending(db) == []


# ── school email: .edu or an institution's domains ───────────────────────────────


def test_an_institution_domain_can_be_verified_as_a_school_email(
    client, auth_header, db, mailer, with_istinye
):
    res = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": "ann@stu.istinye.edu.tr"},
    )
    assert res.status_code == 200, res.text
    assert _pending(db)[0]["edu_email"] == "ann@stu.istinye.edu.tr"


def test_an_address_at_no_school_is_refused(client, auth_header, db, mailer, with_istinye):
    res = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": "ann@example.com"},
    )
    assert (res.status_code, res.json()["detail"]) == (400, "Must be a valid school email address")
    assert _pending(db) == []


# ── verifying it ─────────────────────────────────────────────────────────────────


def _send(client, auth_header, mailer, address="ann@ucsc.edu") -> str:
    res = client.post(
        "/api/profiles/send-edu-verification", headers=auth_header, json={"edu_email": address}
    )
    assert res.status_code == 200
    return mailer.code()


def _verify(client, auth_header, code, address="ann@ucsc.edu"):
    return client.post(
        "/api/profiles/verify-edu-email",
        headers=auth_header,
        json={"edu_email": address, "code": code},
    )


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


def test_verify_with_the_right_code_saves_the_address_and_forgets_the_code(
    client, auth_header, db, mailer
):
    code = _send(client, auth_header, mailer)

    res = _verify(client, auth_header, code, address="ANN@ucsc.edu")

    assert res.status_code == 200
    assert _profile(db)["edu_email"] == "ann@ucsc.edu"
    assert _pending(db) == []
    # A code is single-use.
    assert _verify(client, auth_header, code).status_code == 400


def test_five_wrong_guesses_kill_the_code(client, auth_header, db, mailer):
    code = _send(client, auth_header, mailer)

    for left in (4, 3, 2, 1):
        miss = _verify(client, auth_header, _wrong(code))
        assert miss.status_code == 400
        assert f"{left} attempt" in miss.json()["detail"]
    last = _verify(client, auth_header, _wrong(code))

    assert last.status_code == 429
    assert _pending(db) == []
    # Even the right code is worthless now.
    assert _verify(client, auth_header, code).status_code == 400
    assert _profile(db)["edu_email"] is None


def test_each_guess_claims_its_attempt_before_the_code_is_compared(client, auth_header, db, mailer):
    code = _send(client, auth_header, mailer)
    _pending(db)[0]["attempts"] = 2
    db.reset_counter()

    _verify(client, auth_header, _wrong(code))

    claim = next(
        q for q in db.queries if q["table"] == "edu_email_verifications" and q["op"] == "update"
    )
    # Conditional on the count that was read: parallel guesses cannot share an attempt.
    assert ("attempts", "eq", 2) in claim["filters"]
    assert _pending(db)[0]["attempts"] == 3


def test_a_guess_that_loses_the_race_for_its_attempt_is_not_evaluated(
    client, auth_header, db, mailer
):
    code = _send(client, auth_header, mailer)

    with patch("app.profiles.controller._claim_attempt", return_value=False):
        res = _verify(client, auth_header, code)

    assert res.status_code == 409
    assert _profile(db)["edu_email"] is None


def test_verify_refuses_an_expired_code(client, auth_header, db, mailer):
    code = _send(client, auth_header, mailer)
    _pending(db)[0]["expires_at"] = OLD

    res = _verify(client, auth_header, code)

    assert res.status_code == 400
    assert "expired" in res.json()["detail"].lower()
    assert _pending(db) == []
    assert _profile(db)["edu_email"] is None


def test_verify_refuses_a_different_address_without_spending_an_attempt(
    client, auth_header, db, mailer
):
    code = _send(client, auth_header, mailer)

    res = _verify(client, auth_header, code, address="someone.else@ucsc.edu")

    assert res.status_code == 400
    assert _pending(db)[0]["attempts"] == 0
    assert _profile(db)["edu_email"] is None


def test_verify_with_nothing_pending(client, auth_header, db):
    assert _verify(client, auth_header, "123456").status_code == 400


# ── the login email follows the token ────────────────────────────────────────────


def test_get_me_mirrors_a_changed_login_email_from_the_token(client, db):
    """After a Supabase email change the token names the new address; the profile follows."""
    res = client.get("/api/profiles/me", headers=header_for("Ann@NewMail.com"))

    assert res.status_code == 200, res.text
    assert res.json()["email"] == "ann@newmail.com"
    assert _profile(db)["email"] == "ann@newmail.com"


@pytest.mark.parametrize("claim", ["ann@gmail.com", "Ann@Gmail.com"])
def test_get_me_writes_nothing_when_the_token_agrees(client, db, claim):
    res = client.get("/api/profiles/me", headers=header_for(claim))

    assert res.status_code == 200, res.text
    assert _profile(db)["email"] == "ann@gmail.com"
    assert "profiles:update" not in [f"{q['table']}:{q['op']}" for q in db.queries]


def test_get_me_leaves_the_email_alone_without_a_claim(client, auth_header, db):
    res = client.get("/api/profiles/me", headers=auth_header)

    assert res.status_code == 200, res.text
    assert _profile(db)["email"] == "ann@gmail.com"
    assert "profiles:update" not in [f"{q['table']}:{q['op']}" for q in db.queries]
