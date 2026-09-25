"""Signup and class-join hardening (the 2026-09-21 review).

- A join code is eight characters from the generator's alphabet and is matched exactly,
  so ``%`` or ``Q%`` no longer joins whichever class PostgREST lists first.
- The roster school email address is written only after its owner proves they hold it. Codes live
  in the database (serverless instances share no memory), are stored hashed, expire, can
  be re-sent at most once a minute, and die after five wrong guesses.
- A profile's role stays empty until its owner picks one, and is picked exactly once.
"""

from __future__ import annotations

import datetime
import logging
import re
from unittest.mock import MagicMock, patch

import pytest

from tests.conftest import header_for, make_token
from tests.fake_supabase import FakeSupabase

USER = "user-abc"  # the `sub` of conftest's auth_header token
OLD = "2020-01-01T00:00:00+00:00"


@pytest.fixture(autouse=True)
def _fresh_role_cache():
    from app.auth import controller

    controller._role_cache.clear()
    yield
    controller._role_cache.clear()


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
                "created_at": OLD,
            },
            {
                "id": "u-other",
                "email": "bo@ucsc.edu",
                "edu_email": "bo@ucsc.edu",
                "role": "student",
            },
        ],
        classes=[
            {
                "id": "class-1",
                "name": "CSE 115A",
                "course_code": "QASBX26A",
                "created_by": "inst-1",
                # Staff-only columns a join response must never carry back to the joiner.
                "review_zoom_url": "https://zoom.example/staff-only",
                "review_period_open": True,
                "can_students_make_project": False,
            },
            {"id": "class-2", "name": "Other", "course_code": "ZZ99ZZ99", "created_by": "inst-1"},
        ],
        class_enrollments=[],
        edu_email_verifications=[],
    )
    fake.auth = MagicMock()
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


# ── joining a class ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "code",
    ["%", "*", "________", "Q%", "QASBX26%", "QASBX26", "QASBX26AA", "QASB 26A", "QASBX26_", ""],
)
def test_join_rejects_anything_that_is_not_eight_code_characters(client, auth_header, db, code):
    res = client.post("/api/classes/join", headers=auth_header, json={"course_code": code})

    assert res.status_code == 404
    assert res.json()["detail"] == "Invalid course code"
    assert db.rows("class_enrollments") == []
    # A malformed code never reaches the database, wildcard or not.
    assert [q for q in db.queries if q["table"] == "classes"] == []


def test_join_matches_the_code_exactly_whatever_its_case(client, auth_header, db):
    res = client.post("/api/classes/join", headers=auth_header, json={"course_code": " qasbx26a "})

    assert res.status_code == 200
    assert [e["class_id"] for e in db.rows("class_enrollments")] == ["class-1"]
    lookup = next(q for q in db.queries if q["table"] == "classes")
    assert lookup["filters"] == [("course_code", "eq", "QASBX26A")]


def test_join_answers_404_for_a_well_formed_code_nobody_uses(client, auth_header, db):
    res = client.post("/api/classes/join", headers=auth_header, json={"course_code": "AAAA1111"})

    assert res.status_code == 404
    assert db.rows("class_enrollments") == []


def _header(sub: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=sub)}"}


def test_an_instructor_account_can_join_another_instructors_class(client, db):
    db.rows("profiles").append({"id": "inst-join-2", "email": "i2@ucsc.edu", "role": "instructor"})
    res = client.post(
        "/api/classes/join", headers=_header("inst-join-2"), json={"course_code": "QASBX26A"}
    )
    assert res.status_code == 200, res.text
    assert [(e["class_id"], e["user_id"]) for e in db.rows("class_enrollments")] == [
        ("class-1", "inst-join-2")
    ]


def test_the_instructor_of_a_class_cannot_join_it(client, db):
    db.rows("profiles").append({"id": "inst-1", "email": "i1@ucsc.edu", "role": "instructor"})
    res = client.post(
        "/api/classes/join", headers=_header("inst-1"), json={"course_code": "QASBX26A"}
    )
    assert (res.status_code, res.json()["detail"]) == (409, "You are the instructor of this class")
    assert db.rows("class_enrollments") == []


def test_an_account_without_a_role_cannot_join(client, db):
    db.rows("profiles").append({"id": "no-role-join", "email": "n@gmail.com", "role": None})
    res = client.post(
        "/api/classes/join", headers=_header("no-role-join"), json={"course_code": "QASBX26A"}
    )
    assert (res.status_code, res.json()["detail"]) == (
        403,
        "Choose whether you are a student or an instructor first",
    )
    assert db.rows("class_enrollments") == []


def test_join_response_never_carries_staff_only_columns(client, auth_header, db):
    # class-1 has a real review_zoom_url (staff-only, hidden from students elsewhere); a
    # joiner must not get it back, on first join or on a repeat "Already enrolled" post.
    first = client.post("/api/classes/join", headers=auth_header, json={"course_code": "QASBX26A"})
    assert first.status_code == 200, first.text
    assert first.json()["message"] == "Joined class successfully"
    assert "review_zoom_url" not in first.json()["class"]

    again = client.post("/api/classes/join", headers=auth_header, json={"course_code": "QASBX26A"})
    assert again.status_code == 200
    assert again.json()["message"] == "Already enrolled"
    assert "review_zoom_url" not in again.json()["class"]


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


# ── the role is picked once, by its owner ────────────────────────────────────────


def _signup(role: str, email: str = "ann@gmail.com") -> dict:
    return {"email": email, "userId": USER, "userType": role}


ANN = header_for("ann@gmail.com")


def test_create_user_sets_the_role_the_first_time_and_only_then(client, db):
    _profile(db)["role"] = None

    first = client.post("/api/create-user", headers=ANN, json=_signup("instructor"))

    assert first.status_code == 200
    assert first.json()["role"] == "instructor"
    assert _profile(db)["role"] == "instructor"
    pick = next(q for q in db.queries if q["table"] == "profiles" and q["op"] == "update")
    # Conditional on the role still being empty: two racing picks cannot both land.
    assert ("role", "is", None) in pick["filters"]

    second = client.post("/api/create-user", headers=ANN, json=_signup("student"))

    assert second.status_code == 409
    assert _profile(db)["role"] == "instructor"


def test_create_user_answers_409_when_another_request_picked_first(client, db):
    _profile(db)["role"] = None
    real_table = db.table

    def table(name):
        query = real_table(name)
        if name == "profiles":
            real_update = query.update

            def update(payload):
                if "role" in payload:  # the other request lands between our read and write
                    _profile(db)["role"] = "student"
                return real_update(payload)

            query.update = update
        return query

    with patch.object(db, "table", side_effect=table):
        res = client.post("/api/create-user", headers=ANN, json=_signup("instructor"))

    assert res.status_code == 409
    assert _profile(db)["role"] == "student"


def test_the_first_pick_fills_in_the_edu_email_for_an_edu_login(client, db):
    _profile(db).update({"role": None, "email": "ann@ucsc.edu"})

    res = client.post(
        "/api/create-user",
        headers=header_for("ann@ucsc.edu"),
        json=_signup("student", email=" Ann@UCSC.edu "),
    )

    assert res.status_code == 200
    assert _profile(db)["edu_email"] == "ann@ucsc.edu"


def test_the_first_pick_survives_an_edu_address_someone_else_holds(client, db):
    _profile(db).update({"role": None, "email": "bo@ucsc.edu"})
    from app.core.errors import DatabaseConflictError

    real_table = db.table

    def table(name):
        query = real_table(name)
        if name == "profiles":
            real_update = query.update

            def update(payload):
                if "edu_email" in payload:  # profiles_edu_email_key
                    raise DatabaseConflictError(operation="write", target="profiles")
                return real_update(payload)

            query.update = update
        return query

    with patch.object(db, "table", side_effect=table):
        res = client.post(
            "/api/create-user",
            headers=header_for("bo@ucsc.edu"),
            json=_signup("student", email="bo@ucsc.edu"),
        )

    assert res.status_code == 200
    assert _profile(db)["role"] == "student"
    assert _profile(db)["edu_email"] is None


@pytest.mark.parametrize(
    ("token_email", "body_email"),
    [
        ("ann@gmail.com", "bo@ucsc.edu"),  # a classmate's roster address
        ("ann@gmail.com", ""),
        (None, "ann@gmail.com"),  # a token with no verified address proves nothing
    ],
)
def test_create_user_takes_the_email_from_the_token_not_the_body(
    client, auth_header, db, token_email, body_email
):
    _profile(db)["role"] = None
    headers = header_for(token_email) if token_email else auth_header

    res = client.post(
        "/api/create-user", headers=headers, json=_signup("student", email=body_email)
    )

    assert res.status_code == 403
    assert res.json()["detail"] == "Email mismatch between Token and Body"
    assert _profile(db)["role"] is None
    assert _profile(db)["edu_email"] is None


def test_a_missing_role_is_never_cached(db):
    from app.auth.controller import get_user_role

    _profile(db)["role"] = None
    assert get_user_role(USER) is None

    _profile(db)["role"] = "student"

    # Picking a role must take effect on the very next request, on every instance.
    assert get_user_role(USER) == "student"


def test_a_chosen_role_is_still_cached(db):
    from app.auth.controller import get_user_role

    assert get_user_role(USER) == "student"
    db.reset_counter()

    assert get_user_role(USER) == "student"
    assert db.executes == 0
