"""The ``/api/email`` routes other than the webhook (tests/test_outbox_webhooks.py), and the
in-process dispatcher the API starts while the ``pg_cron`` schedule does not exist yet.

* ``POST /dispatch``: off (404) until ``EMAIL_DISPATCH_SECRET`` is set, then only for that bearer
  token; one ``dispatch_tick``, which now begins with the scheduled class invites.
* ``GET`` / ``POST /unsubscribe``: public, the signed token in the link is the credential.
* ``GET`` / ``PUT /preferences``: the signed-in user's own categories.

Everything runs against FakeSupabase; no request leaves the process.
"""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import json
import logging
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import settings
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.jobs import email_dispatch
from app.limiter import limiter
from app.outbox import controller as outbox
from app.outbox import preferences as prefs
from app.outbox import views
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase
from tests.outbox_support import NOW, Clock, Mailbox, claim_function

DISPATCH = "/api/email/dispatch"
UNSUBSCRIBE = "/api/email/unsubscribe"
PREFERENCES = "/api/email/preferences"

DISPATCH_SECRET = "dispatch-secret-for-tests-0123456789abcdef"
UNSUBSCRIBE_SECRET = "unsubscribe-secret-for-tests"

USER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
OTHER_USER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
INSTRUCTOR = "11111111-2222-4333-8444-555555555555"
CLASS = "c1a55000-0000-4000-8000-000000000001"
JOB = "a0b00000-0000-4000-8000-000000000001"

#: What GET /preferences answers for someone who never changed a thing.
ALL_ON = [
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
        "enabled": True,
    },
]


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    """Known secrets, whatever the developer's .env holds, and no rate-limit count left over."""
    monkeypatch.setattr(settings, "EMAIL_DISPATCH_SECRET", "")
    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", UNSUBSCRIBE_SECRET)
    limiter.reset()
    yield
    limiter.reset()


class FailingDb(FakeSupabase):
    """FakeSupabase whose requests for which ``fails(table, op)`` holds raise ``make(...)``."""

    def __init__(self, fails, make, **tables):
        super().__init__(**tables)
        self._fails = fails
        self._make = make

    def table(self, name):
        query = super().table(name)
        execute = query.execute

        def maybe_fail():
            if self._fails(name, query._op):
                raise self._make("read" if query._op == "select" else "write", name)
            return execute()

        query.execute = maybe_fail
        return query


def database_error(pg_code: str):
    def make(operation, target):
        return DatabaseError(
            operation=operation, target=target, pg_code=pg_code, pg_message="rejected"
        )

    return make


def outage(operation, target):
    return DatabaseUnavailableError(
        operation=operation,
        target=target,
        pg_code="57014",
        pg_message="canceling statement due to statement timeout",
    )


def install(monkeypatch, db: FakeSupabase) -> FakeSupabase:
    monkeypatch.setattr("app.core.db.service_client", db, raising=False)
    return db


@pytest.fixture
def db(monkeypatch) -> FakeSupabase:
    return install(monkeypatch, FakeSupabase(email_preferences=[]))


def signed_in(user_id: str = USER) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=user_id)}"}


def stored_preferences(db: FakeSupabase) -> dict[tuple[str, str], bool]:
    return {(r["user_id"], r["category"]): r["enabled"] for r in db.rows("email_preferences")}


# -- POST /dispatch ------------------------------------------------------------------------------


@pytest.fixture
def ticks(monkeypatch) -> list[dict]:
    """``dispatch_tick`` replaced: the keyword arguments of each call."""
    calls: list[dict] = []

    def fake_tick(**kwargs):
        calls.append(kwargs)
        counts = dict.fromkeys(("expanded", "claimed", "retried", "failed", "skipped"), 0)
        return {**counts, "sent": 3, "unavailable": False, "paused": False}

    monkeypatch.setattr(outbox, "dispatch_tick", fake_tick)
    return calls


@pytest.fixture
def dispatch_on(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_DISPATCH_SECRET", DISPATCH_SECRET)


BEARER = {"Authorization": f"Bearer {DISPATCH_SECRET}"}


@pytest.mark.parametrize("headers", [{}, BEARER], ids=["no-token", "token"])
def test_dispatch_is_not_there_while_the_secret_is_unset(client, ticks, headers):
    # The in-process loop dispatches then; the pg_cron calls made before the secret is set
    # answer 404 and change nothing.
    res = client.post(DISPATCH, headers=headers, json={})
    assert res.status_code == 404
    assert res.json() == {"detail": "Not Found"}
    assert ticks == []


def test_dispatch_runs_one_tick_with_the_configured_budget(client, ticks, dispatch_on, monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_DISPATCH_BUDGET_SECONDS", 12.5)

    # What pg_net sends: the token, and a JSON body the route does not read.
    res = client.post(DISPATCH, headers=BEARER, json={})

    assert res.status_code == 200
    assert res.json() == {
        "expanded": 0,
        "claimed": 0,
        "sent": 3,
        "retried": 0,
        "failed": 0,
        "skipped": 0,
        "unavailable": False,
        "paused": False,
    }
    assert ticks == [{"budget_seconds": 12.5}]


@pytest.mark.parametrize(
    "authorization",
    [
        None,
        "",
        "Bearer wrong",
        f"Bearer {DISPATCH_SECRET}x",
        f"Bearer {DISPATCH_SECRET[:-1]}",
        f"bearer {DISPATCH_SECRET}",
        f"Basic {DISPATCH_SECRET}",
        DISPATCH_SECRET,
        f"Bearer {make_token(sub=USER)}",  # a user's session is not the dispatch token
    ],
    ids=["missing", "empty", "wrong", "longer", "shorter", "lower-case", "basic", "bare", "jwt"],
)
def test_dispatch_needs_exactly_the_bearer_secret(client, ticks, dispatch_on, authorization):
    headers = {} if authorization is None else {"Authorization": authorization}
    res = client.post(DISPATCH, headers=headers)
    assert res.status_code == 401
    assert res.json() == {"detail": "Invalid dispatch token"}
    assert ticks == []


def test_a_dispatch_token_that_is_not_ascii_is_a_401_not_a_500(client, ticks, dispatch_on):
    # compare_digest raises on text that is not ASCII; the header must never get that far.
    res = client.post(DISPATCH, headers={"Authorization": "Bearer café".encode()})
    assert res.status_code == 401
    assert ticks == []


def test_the_dispatch_token_is_compared_in_constant_time(client, ticks, dispatch_on, monkeypatch):
    compared = []
    real = hmac.compare_digest

    def spy(a, b):
        compared.append((a, b))
        return real(a, b)

    monkeypatch.setattr(hmac, "compare_digest", spy)
    assert client.post(DISPATCH, headers=BEARER).status_code == 200
    # Once to pick the rate-limit bucket, once to let the call in.
    assert compared == [(BEARER["Authorization"], BEARER["Authorization"])] * 2


@pytest.mark.parametrize(
    "headers", [{}, {"Authorization": "Bearer not-the-secret-4f2a"}], ids=["missing", "wrong"]
)
def test_a_refused_dispatch_call_is_logged_without_its_token(
    client, ticks, dispatch_on, caplog, headers
):
    with caplog.at_level(logging.DEBUG):
        assert client.post(DISPATCH, headers=headers).status_code == 401

    assert [
        (r.levelname, r.getMessage()) for r in caplog.records if r.name == "app.outbox.views"
    ] == [("WARNING", "dispatch: rejected a call with a wrong or missing token")]
    assert "not-the-secret-4f2a" not in caplog.text


def test_calls_without_the_token_cannot_use_up_the_schedules_rate_limit(client, ticks, dispatch_on):
    # On Vercel every caller arrives from the proxy's address, so they would all share one bucket
    # with the schedule. Calls with the token have a bucket of their own.
    wrong = {"Authorization": "Bearer wrong"}
    for _ in range(30):
        assert client.post(DISPATCH, headers=wrong).status_code == 401
    assert client.post(DISPATCH, headers=wrong).status_code == 429

    assert client.post(DISPATCH, headers=BEARER).status_code == 200
    assert len(ticks) == 1


def test_the_schedules_own_bucket_still_holds_30_calls_a_minute(client, ticks, dispatch_on):
    for _ in range(30):
        assert client.post(DISPATCH, headers=BEARER).status_code == 200
    assert client.post(DISPATCH, headers=BEARER).status_code == 429
    assert len(ticks) == 30


def test_the_dispatch_rate_limit_picks_its_bucket_by_token():
    [rule] = limiter._route_limits["app.outbox.views.dispatch"]
    assert rule.key_func is views._dispatch_rate_key


SECRET_NAMES = ["EMAIL_DISPATCH_SECRET", "MAILEROO_WEBHOOK_SECRET", "EMAIL_UNSUBSCRIBE_SECRET"]


def secrets_under(environments: list[dict[str, str]]) -> list[list[str]]:
    """The ``SECRET_NAMES`` ``Settings`` reads under each environment, in a separate process:
    reloading ``app.config`` here would swap the ``settings`` every other test holds. Each
    environment should name every secret, so that nothing comes from a developer's .env."""
    script = """
import importlib, json, os, sys
import app.config as config
environments, names = json.loads(sys.argv[1]), json.loads(sys.argv[2])
for environment in environments:
    os.environ.update(environment)
    importlib.reload(config)
    print(json.dumps([getattr(config.Settings, name) for name in names]))
"""
    run = subprocess.run(
        [sys.executable, "-c", script, json.dumps(environments), json.dumps(SECRET_NAMES)],
        cwd=Path(__file__).resolve().parent.parent,
        capture_output=True,
        text=True,
        check=True,
    )
    return [json.loads(line) for line in run.stdout.strip().splitlines()[-len(environments) :]]


def test_the_email_secrets_are_read_without_surrounding_whitespace():
    # A secret pasted with a trailing newline matches no header pg_cron or Maileroo sends, and a
    # dispatch secret that is set at all turns the in-process loop off: nothing would dispatch.
    environments = [
        {
            "EMAIL_DISPATCH_SECRET": " d1spatch-s3cret\n",
            "MAILEROO_WEBHOOK_SECRET": "\twebh00k-s3cret \r\n",
            "EMAIL_UNSUBSCRIBE_SECRET": "uns-s3cret\n",
        },
        dict.fromkeys(SECRET_NAMES, " \r\n\t"),  # only whitespace: unset, like ""
        dict.fromkeys(SECRET_NAMES, ""),
    ]

    assert secrets_under(environments) == [
        ["d1spatch-s3cret", "webh00k-s3cret", "uns-s3cret"],
        ["", "", ""],
        ["", "", ""],
    ]


def test_a_dispatch_sends_a_due_scheduled_invite_end_to_end(client, dispatch_on, monkeypatch):
    # The real tick, through the route: the scheduled-invite producer queues the job's rows,
    # the same run claims and sends them, and the job is marked sent.
    clock = Clock()
    monkeypatch.setattr(outbox, "_now", clock.now)
    monkeypatch.setattr(outbox, "_monotonic", clock.monotonic)
    mail = Mailbox(clock)
    monkeypatch.setattr("app.utils.email_transport.send", mail.send)
    job = {
        "id": JOB,
        "class_id": CLASS,
        "instructor_id": INSTRUCTOR,
        "emails": ["ann@ucsc.edu", "bob@ucsc.edu"],
        "send_at": (NOW - timedelta(minutes=1)).isoformat(),
        "cancelled": False,
        "sent": False,
        "custom_subject": "Welcome to CSE 115C",
        "custom_body": "See you in section.",
        "custom_body_html": None,
        "cc": [],
        "bcc": [],
    }
    db = FakeSupabase(
        pending_invites=[job],
        email_outbox=[],
        email_suppressions=[],
        email_preferences=[],
        notifications=[],
    )
    db.rpcs["claim_email_outbox"] = claim_function(db, clock)
    install(monkeypatch, db)

    res = client.post(DISPATCH, headers=BEARER, json={})

    assert res.status_code == 200, res.text
    assert res.json() == {
        "expanded": 1,
        "claimed": 2,
        "sent": 2,
        "retried": 0,
        "failed": 0,
        "skipped": 0,
        "unavailable": False,
        "paused": False,
    }
    assert sorted((m.to, m.subject) for m in mail.sent) == [
        ("ann@ucsc.edu", "Welcome to CSE 115C"),
        ("bob@ucsc.edu", "Welcome to CSE 115C"),
    ]
    assert db.rows("pending_invites")[0]["sent"] is True
    assert {row["status"] for row in db.rows("email_outbox")} == {"sent"}

    # The next run finds nothing to send again.
    assert client.post(DISPATCH, headers=BEARER).json()["claimed"] == 0
    assert len(mail.sent) == 2


# -- GET and POST /unsubscribe -------------------------------------------------------------------


def token_for(user_id: str = USER, category: str = "reminders") -> str:
    token = prefs.make_unsubscribe_token(user_id, category)
    assert token is not None
    return token


@pytest.mark.parametrize(
    ("category", "label"),
    [("reminders", "Deadline reminders"), ("digests", "Unread message digests")],
)
def test_a_valid_link_says_what_it_unsubscribes_from_and_changes_nothing(
    client, db, category, label
):
    res = client.get(UNSUBSCRIBE, params={"token": token_for(category=category)})
    assert res.status_code == 200
    assert res.json() == {"valid": True, "category": category, "label": label}
    assert db.executes == 0


@pytest.mark.parametrize(
    "token",
    [
        lambda: token_for()[:-1] + ("A" if token_for()[-1] != "A" else "B"),  # tampered
        lambda: token_for().replace(".reminders.", ".digests."),  # another category
        lambda: token_for().replace(USER, OTHER_USER),  # another user
        lambda: "not-a-token",
        lambda: "",
    ],
    ids=["tampered", "other-category", "other-user", "junk", "empty"],
)
def test_a_link_that_is_not_valid_says_so(client, db, token):
    res = client.get(UNSUBSCRIBE, params={"token": token()})
    assert res.status_code == 200
    assert res.json() == {"valid": False}


def test_a_link_without_a_token_is_not_valid(client, db):
    assert client.get(UNSUBSCRIBE).json() == {"valid": False}
    assert client.post(UNSUBSCRIBE).status_code == 400


def test_unsubscribing_switches_the_category_off_for_the_tokens_user(client, db):
    db.rows("email_preferences").append(
        {"user_id": USER, "category": "digests", "enabled": False, "updated_at": "earlier"}
    )

    res = client.post(UNSUBSCRIBE, params={"token": token_for(category="reminders")})

    assert res.status_code == 200
    assert res.json() == {
        "unsubscribed": True,
        "category": "reminders",
        "label": "Deadline reminders",
    }
    assert stored_preferences(db) == {(USER, "digests"): False, (USER, "reminders"): False}


def test_unsubscribing_twice_is_harmless(client, db):
    for _ in range(2):
        assert client.post(UNSUBSCRIBE, params={"token": token_for()}).status_code == 200
    assert stored_preferences(db) == {(USER, "reminders"): False}


def test_one_click_unsubscribe_ignores_its_form_body(client, db):
    # RFC 8058: the mail client POSTs this form to the List-Unsubscribe URL, signed out.
    res = client.post(
        UNSUBSCRIBE,
        params={"token": token_for()},
        content=b"List-Unsubscribe=One-Click",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert res.status_code == 200
    assert stored_preferences(db) == {(USER, "reminders"): False}


def test_an_invalid_link_cannot_unsubscribe_anyone(client, db):
    forged = token_for().replace(USER, OTHER_USER)
    res = client.post(UNSUBSCRIBE, params={"token": forged})
    assert res.status_code == 400
    assert res.json() == {"detail": "This unsubscribe link isn't valid."}
    assert db.executes == 0


def test_unsubscribing_an_account_that_is_gone_still_succeeds(client, monkeypatch):
    # The preference row references the profile (23503): nothing is emailed to it any more.
    install(
        monkeypatch,
        FailingDb(lambda table, op: op == "upsert", database_error("23503"), email_preferences=[]),
    )
    res = client.post(UNSUBSCRIBE, params={"token": token_for()})
    assert res.status_code == 200
    assert res.json()["unsubscribed"] is True


def test_unsubscribing_before_the_preferences_migration_is_a_503(client, monkeypatch):
    install(
        monkeypatch,
        FailingDb(lambda table, op: True, database_error("PGRST205"), email_preferences=[]),
    )
    res = client.post(UNSUBSCRIBE, params={"token": token_for()})
    assert res.status_code == 503
    assert res.json() == {"detail": "Email preferences are not available yet"}


@pytest.mark.parametrize(
    ("make", "status"), [(database_error("42501"), 500), (outage, 503)], ids=["denied", "outage"]
)
def test_unsubscribing_does_not_pretend_a_failed_write_succeeded(client, monkeypatch, make, status):
    install(monkeypatch, FailingDb(lambda table, op: op == "upsert", make, email_preferences=[]))
    res = client.post(UNSUBSCRIBE, params={"token": token_for()})
    assert res.status_code == status
    assert "unsubscribed" not in res.json()


# -- GET and PUT /preferences --------------------------------------------------------------------


def test_preferences_need_a_signed_in_user(client, db):
    assert client.get(PREFERENCES).status_code == 401
    assert client.put(PREFERENCES, json={"preferences": {"reminders": False}}).status_code == 401
    assert db.executes == 0


def test_every_category_is_on_until_changed(client, db):
    res = client.get(PREFERENCES, headers=signed_in())
    assert res.status_code == 200
    assert res.json() == {"preferences": ALL_ON}


def test_the_preferences_are_the_callers_own(client, db):
    db.rows("email_preferences").append(
        {"user_id": OTHER_USER, "category": "reminders", "enabled": False}
    )
    assert client.get(PREFERENCES, headers=signed_in()).json() == {"preferences": ALL_ON}
    others = client.get(PREFERENCES, headers=signed_in(OTHER_USER)).json()["preferences"]
    assert [item["enabled"] for item in others] == [False, True]


def test_turning_a_category_off_saves_it_and_answers_the_full_list(client, db):
    res = client.put(PREFERENCES, headers=signed_in(), json={"preferences": {"digests": False}})

    assert res.status_code == 200
    assert res.json() == {"preferences": [ALL_ON[0], {**ALL_ON[1], "enabled": False}]}
    assert stored_preferences(db) == {(USER, "digests"): False}
    assert client.get(PREFERENCES, headers=signed_in()).json() == res.json()


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({"preferences": {"weekly_recap": False}}, "Unknown email category: weekly_recap"),
        ({"preferences": {"reminders": "no"}}, "Preferences must be true or false"),
        ({"preferences": {"reminders": 0}}, "Preferences must be true or false"),
        ({"preferences": {"reminders": None}}, "Preferences must be true or false"),
    ],
    ids=["unknown-category", "string", "number", "null"],
)
def test_a_wrong_preference_is_a_400_and_nothing_is_saved(client, db, body, detail):
    res = client.put(PREFERENCES, headers=signed_in(), json=body)
    assert res.status_code == 400
    assert res.json() == {"detail": detail}
    assert db.rows("email_preferences") == []


@pytest.mark.parametrize("body", [{}, {"preferences": ["reminders"]}], ids=["missing", "list"])
def test_a_body_without_a_preferences_object_is_a_422(client, db, body):
    assert client.put(PREFERENCES, headers=signed_in(), json=body).status_code == 422
    assert db.rows("email_preferences") == []


# -- rate limits ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("view", "limit"),
    [
        ("dispatch", "30 per 1 minute"),
        ("maileroo_webhook", "600 per 1 minute"),
        ("unsubscribe_info", "30 per 1 minute"),
        ("unsubscribe", "30 per 1 minute"),
    ],
)
def test_every_public_email_route_is_rate_limited(view, limit):
    [rule] = limiter._route_limits[f"app.outbox.views.{view}"]
    assert str(rule.limit) == limit


def test_the_31st_link_check_in_a_minute_is_refused(client, db):
    for _ in range(30):
        assert client.get(UNSUBSCRIBE, params={"token": "x"}).status_code == 200
    assert client.get(UNSUBSCRIBE, params={"token": "x"}).status_code == 429


# -- the in-process dispatcher -------------------------------------------------------------------


@pytest.fixture
def loop_runs(monkeypatch) -> dict[str, list]:
    """``run_forever`` as ``app.main`` calls it, replaced by a loop that waits until cancelled."""
    runs: dict[str, list] = {"started": [], "cancelled": []}

    async def fake_run_forever(interval_seconds: float) -> None:
        runs["started"].append(interval_seconds)
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            runs["cancelled"].append(interval_seconds)
            raise

    monkeypatch.setattr(main, "run_email_dispatch", fake_run_forever)
    monkeypatch.setattr(settings, "EMAIL_DISPATCH_POLL_SECONDS", 7.5)
    return runs


def test_without_the_dispatch_secret_the_api_dispatches_from_its_own_process(loop_runs):
    with TestClient(main.app) as api:
        assert api.get("/health").status_code == 200  # the app is up, the loop has started
        assert loop_runs == {"started": [7.5], "cancelled": []}
    # Stopped with the app.
    assert loop_runs == {"started": [7.5], "cancelled": [7.5]}


def test_with_the_dispatch_secret_only_the_schedule_dispatches(loop_runs, monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_DISPATCH_SECRET", DISPATCH_SECRET)
    with TestClient(main.app) as api:
        assert api.get("/health").status_code == 200
    assert loop_runs == {"started": [], "cancelled": []}


def test_the_loop_ticks_with_the_configured_budget_until_cancelled_whatever_a_run_raises(
    monkeypatch, caplog
):
    budgets: list[float] = []
    monkeypatch.setattr(settings, "EMAIL_DISPATCH_BUDGET_SECONDS", 4.0)

    def tick(*, budget_seconds):
        budgets.append(budget_seconds)
        if len(budgets) == 1:
            raise RuntimeError("a bug in one run")
        return {}

    monkeypatch.setattr(outbox, "dispatch_tick", tick)

    async def run_until_two_ticks():
        task = asyncio.create_task(email_dispatch.run_forever(0))
        while len(budgets) < 2:
            await asyncio.sleep(0.001)
        task.cancel()  # what the lifespan does at shutdown
        with contextlib.suppress(asyncio.CancelledError):
            await task
        return task

    with caplog.at_level(logging.ERROR, logger="app.jobs.email_dispatch"):
        task = asyncio.run(run_until_two_ticks())

    assert task.cancelled()
    assert budgets[:2] == [4.0, 4.0] and set(budgets) == {4.0}
    [logged] = caplog.records
    assert logged.getMessage() == "email_dispatch: a dispatch run failed"
    assert isinstance(logged.exc_info[1], RuntimeError)
