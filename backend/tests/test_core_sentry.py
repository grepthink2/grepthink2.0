"""Error reporting to Sentry (``app/core/sentry.py``).

Sentry is optional: without ``SENTRY_DSN`` nothing starts. With it, every event is
scrubbed of credentials and personal data before it leaves the process, and an event
captured while a request is handled reaches Sentry before that request's response goes
out, because Vercel can freeze the function as soon as the response is done.

Delivery has to happen before the response *starts*, not merely before it ends: Vercel's
legacy Lambda handler returns as soon as it has read Content-Length bytes, and Starlette's
BaseHTTPMiddleware sends the whole body before its empty closing chunk. The delivery tests
execute ``app/main.py`` afresh with a fake DSN and a transport that records instead of
sending, then drive the app the way an ASGI server does, noting when the response starts
and when it completes.
"""

from __future__ import annotations

import asyncio
import contextlib
import importlib.util
import json
import logging

import pytest
import sentry_sdk
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from sentry_sdk.transport import Transport

import app.core.sentry as sentry_module
import app.main as main_module
from app.core.sentry import SentryFlushMiddleware, before_send, init_sentry
from tests.conftest import make_token

FAKE_DSN = "https://public@example.invalid/1"
COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567"


class RecordingTransport(Transport):
    """Keeps error events instead of sending them; notes events and flushes on a timeline."""

    def __init__(self, timeline: list[str]) -> None:
        super().__init__()
        self.timeline = timeline
        self.events: list[dict] = []

    def capture_envelope(self, envelope) -> None:
        event = envelope.get_event()
        if event is not None:
            self.events.append(event)
            self.timeline.append("event")

    def flush(self, timeout, callback=None) -> None:
        self.timeline.append("flush")


def _stop_sentry() -> None:
    sentry_sdk.get_client().close()
    sentry_sdk.get_global_scope().set_client(None)


@pytest.fixture
def stop_sentry():
    """Return the SDK to its uninitialised state after the test."""
    yield
    _stop_sentry()


@pytest.fixture(scope="module")
def main_app_with_sentry() -> FastAPI:
    """``app/main.py`` executed afresh with SENTRY_DSN set, plus a few probe routes.

    Built once per module, because FastAPI builds its ~120 routes on the first request,
    which takes a few hundred milliseconds. It is built while the SDK runs, as in
    production; each test then starts the SDK again with its own recording transport.
    """
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("SENTRY_DSN", FAKE_DSN)
        mp.setenv("VERCEL_GIT_COMMIT_SHA", COMMIT_SHA)
        real_init = sentry_module.init_sentry
        mp.setattr(
            sentry_module, "init_sentry", lambda: real_init(transport=RecordingTransport([]))
        )
        # Run main.py again under another name: the app.main the other tests share is
        # left alone.
        spec = importlib.util.spec_from_file_location("main_with_sentry", main_module.__file__)
        main = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(main)

        def boom():
            raise RuntimeError("PostgREST said: duplicate key for jane.doe@ucsc.edu")

        def unavailable():
            raise HTTPException(status_code=503, detail="Try again in a moment")

        def logged():
            logging.getLogger("app.classes.controller").error("Could not send the invite email")
            return {"ok": True}

        def streamed():
            def chunks():
                yield b"first chunk\n"
                logging.getLogger("app.classes.controller").error("Lost the invite service")
                yield b"second chunk\n"

            return StreamingResponse(chunks(), media_type="text/plain")

        def fine():
            return {"ok": True}

        for endpoint in (boom, unavailable, logged, streamed, fine):
            main.app.add_api_route(f"/{endpoint.__name__}", endpoint, methods=["GET"])
        _get(main.app, "/fine", [])  # build the routes now rather than in the first test
    _stop_sentry()
    return main.app


@pytest.fixture
def sentry_app(
    main_app_with_sentry, monkeypatch, stop_sentry
) -> tuple[FastAPI, RecordingTransport]:
    """That app with the SDK running and sending to a fresh recording transport."""
    transport = RecordingTransport([])
    monkeypatch.setenv("SENTRY_DSN", FAKE_DSN)
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", COMMIT_SHA)
    assert init_sentry(transport=transport) is True
    return main_app_with_sentry, transport


def _get(app: FastAPI, path: str, timeline: list[str]) -> tuple[int, bytes]:
    """GET ``path`` as an ASGI server would, noting on ``timeline`` when the response starts and completes."""
    status: list[int] = []
    body = bytearray()

    async def serve() -> None:
        finished = asyncio.Event()
        request_sent = False

        async def receive() -> dict:
            nonlocal request_sent
            if not request_sent:
                request_sent = True
                return {"type": "http.request", "body": b"", "more_body": False}
            await finished.wait()
            return {"type": "http.disconnect"}

        async def send(message: dict) -> None:
            if message["type"] == "http.response.start":
                status.append(message["status"])
                timeline.append("response started")
            elif message["type"] == "http.response.body":
                body.extend(message.get("body", b""))
                if not message.get("more_body", False):
                    timeline.append("response complete")
                    finished.set()

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": [(b"host", b"testserver")],
            "client": ("127.0.0.1", 50000),
            "server": ("testserver", 80),
        }
        # Starlette re-raises an unhandled error after sending its 500, for the server to log.
        with contextlib.suppress(RuntimeError):
            await app(scope, receive, send)

    asyncio.run(serve())
    return status[0], bytes(body)


@pytest.mark.parametrize("dsn", [None, "", "   "])
def test_without_a_dsn_nothing_starts(monkeypatch, dsn):
    if dsn is None:
        monkeypatch.delenv("SENTRY_DSN", raising=False)
    else:
        monkeypatch.setenv("SENTRY_DSN", dsn)

    assert init_sentry() is False
    assert not sentry_sdk.get_client().is_active()
    # The app the other tests share was built the same way: no delivery middleware either.
    assert SentryFlushMiddleware not in {m.cls for m in main_module.app.user_middleware}


@pytest.mark.parametrize(
    ("environ", "environment"),
    [
        ({"ENVIRONMENT": "Staging", "VERCEL_ENV": "preview"}, "staging"),
        # ENVIRONMENT is not set on Vercel today, so Vercel's own VERCEL_ENV decides.
        ({"VERCEL_ENV": "production"}, "production"),
        ({}, "development"),
    ],
)
def test_events_name_the_environment_and_the_deployed_commit(
    monkeypatch, stop_sentry, environ, environment
):
    for name in ("ENVIRONMENT", "VERCEL_ENV"):
        monkeypatch.delenv(name, raising=False)
    for name, value in environ.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("SENTRY_DSN", FAKE_DSN)
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", COMMIT_SHA)

    assert init_sentry(transport=RecordingTransport([])) is True

    options = sentry_sdk.get_client().options
    assert options["environment"] == environment
    assert options["release"] == COMMIT_SHA


def test_only_errors_are_sent_and_request_data_is_never_collected(monkeypatch, stop_sentry):
    monkeypatch.setenv("SENTRY_DSN", FAKE_DSN)
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", COMMIT_SHA)

    assert init_sentry(transport=RecordingTransport([])) is True

    options = sentry_sdk.get_client().options
    assert options["send_default_pii"] is False
    assert options["traces_sample_rate"] == 0
    assert options["profiles_sample_rate"] == 0
    assert options["max_request_body_size"] == "never"
    assert options["include_local_variables"] is False
    assert options["before_send"] is before_send


def test_an_unhandled_exception_is_reported_once_before_the_500_is_sent(sentry_app):
    app, transport = sentry_app

    status, body = _get(app, "/boom", transport.timeline)

    assert status == 500
    assert json.loads(body) == {"detail": "Internal server error", "code": "internal_error"}
    assert transport.timeline == ["event", "flush", "response started", "response complete"]
    (event,) = transport.events
    # Sentry lists an exception chain oldest first; the last entry is the one raised. (The
    # chain also holds the anyio ExceptionGroup that Starlette's BaseHTTPMiddleware
    # re-raised it from.)
    raised = event["exception"]["values"][-1]
    assert raised["type"] == "RuntimeError"
    assert raised["mechanism"]["handled"] is False
    assert "jane.doe@ucsc.edu" not in json.dumps(event)  # before_send ran on the way out


@pytest.mark.parametrize(
    ("path", "status", "timeline"),
    [
        # A 5xx HTTPException: the SDK's Starlette integration captures it.
        ("/unavailable", 503, ["event", "flush", "response started", "response complete"]),
        # An error logged by a route that still succeeds: the logging integration captures it.
        ("/logged", 200, ["event", "flush", "response started", "response complete"]),
        # An error logged while the body streams: delivered before the last chunk.
        ("/streamed", 200, ["response started", "event", "flush", "response complete"]),
        # Nothing captured: the response is not held up.
        ("/fine", 200, ["response started", "response complete"]),
    ],
)
def test_events_a_request_captures_are_delivered_before_its_response_goes_out(
    sentry_app, path, status, timeline
):
    app, transport = sentry_app

    assert _get(app, path, transport.timeline)[0] == status
    assert transport.timeline == timeline


def test_before_send_strips_credentials_and_personal_data(monkeypatch):
    service_role_key = make_token(sub="service-role")  # JWT-shaped, like Supabase's legacy keys
    environment = {
        "SUPABASE_SERVICE_ROLE_KEY": service_role_key,
        "SUPABASE_JWT_SECRET": "plain-jwt-secret-with-no-telltale-shape",
        "SMTP_PASSWORD": "plain-smtp-password-with-no-telltale-shape",
        "OPENAI_API_KEY": "sk-proj-" + "a1B2c3D4e5" * 4,
        "GITHUB_TOKEN": "ghp_" + "Z9y8X7w6V5" * 4,
        "GITLAB_TOKEN": "glpat-" + "Q1w2E3r4T5" * 2,
    }
    for name, value in environment.items():
        monkeypatch.setenv(name, value)
    access_token = make_token(sub="user-abc")
    oidc_token = make_token(sub="vercel-oidc")
    # Not in the environment, so only their shape gives them away.
    fine_grained_github_token = "github_pat_" + "11ABCDEFG0" * 4
    anthropic_key = "sk-ant-api03-" + "k" * 30
    email, encoded_email, ip = "jane.doe@ucsc.edu", "jane.doe%40ucsc.edu", "203.0.113.7"
    supabase_rest = "https://test.supabase.co/rest/v1/profiles"

    event = {
        "message": f"Login failed for {email} with {access_token}",
        "logentry": {
            "message": "SMTP login failed for %s: %s",
            "params": [email, environment["SMTP_PASSWORD"]],
        },
        "exception": {
            "values": [
                {
                    "type": "RuntimeError",
                    "value": f"GitHub rejected {fine_grained_github_token}",
                    "stacktrace": {
                        "frames": [
                            {
                                "function": "send_invite",
                                "vars": {
                                    "service_key": service_role_key,
                                    "recipient": email,
                                    "attempt": 3,
                                },
                            }
                        ]
                    },
                }
            ]
        },
        "breadcrumbs": {
            "values": [
                {
                    "category": "httplib",
                    "data": {
                        "url": supabase_rest,
                        "method": "GET",
                        "http.query": f"select=*&email=eq.{encoded_email}",
                    },
                },
                {
                    "category": "httpx",
                    "message": f'HTTP Request: GET {supabase_rest}?email=eq.{encoded_email} "HTTP/1.1 200 OK"',
                },
                {"category": "slowapi", "message": f"ratelimit 5 per 1 minute ({ip}) exceeded"},
            ]
        },
        "request": {
            "url": f"https://api.grepthink2.com/api/check-email?email={encoded_email}",
            "method": "POST",
            "query_string": f"email={encoded_email}",
            "data": {"email": email, "password": "correct horse battery staple"},
            "cookies": {"sb-access-token": access_token},
            "env": {"REMOTE_ADDR": ip},
            "headers": {
                "Authorization": f"Bearer {access_token}",
                "Cookie": f"sb-access-token={access_token}",
                "apikey": service_role_key,
                "X-Vercel-Oidc-Token": oidc_token,
                "X-Forwarded-For": ip,
                "X-Vercel-Ip-City": "Santa%20Cruz",
                "User-Agent": "Mozilla/5.0",
                "Content-Type": "application/json",
            },
        },
        "user": {"id": "user-abc", "email": email, "ip_address": ip},
        "tags": {"user_email": email},
        "extra": {
            "openai_api_key": environment["OPENAI_API_KEY"],
            "note": f"retrying with {anthropic_key}",
            "gitlab": environment["GITLAB_TOKEN"],
            "summary": "Basic settings were saved",
        },
        "contexts": {"runtime": {"name": "CPython", "version": "3.12.4"}},
    }

    scrubbed = before_send(event, {})

    sent = json.dumps(scrubbed)
    for value in [
        *environment.values(),
        access_token,
        oidc_token,
        fine_grained_github_token,
        anthropic_key,
        email,
        encoded_email,
        ip,
        "correct horse battery staple",
        "Santa",
    ]:
        assert value not in sent, value
    # What is needed to debug survives.
    assert scrubbed["message"] == "Login failed for [email] with [Filtered]"
    assert scrubbed["extra"]["summary"] == "Basic settings were saved"  # prose is not a credential
    (exception,) = scrubbed["exception"]["values"]
    assert exception["type"] == "RuntimeError"
    assert exception["stacktrace"]["frames"][0]["vars"]["attempt"] == 3
    assert scrubbed["request"]["method"] == "POST"
    assert scrubbed["request"]["url"] == "https://api.grepthink2.com/api/check-email"
    assert scrubbed["request"]["headers"]["User-Agent"] == "Mozilla/5.0"
    assert scrubbed["breadcrumbs"]["values"][0]["data"]["url"] == supabase_rest
    assert scrubbed["user"] == {"id": "user-abc"}
    assert scrubbed["contexts"] == {"runtime": {"name": "CPython", "version": "3.12.4"}}


def test_before_send_copes_with_unexpected_shapes():
    """If before_send raised, the SDK would drop the event: a bug must not cost the report."""
    event = {
        "request": None,
        "user": "someone",
        "breadcrumbs": {"values": [None, "not a crumb", {"data": None}]},
        "extra": {1: "jane.doe@ucsc.edu", "nested": [("a", b"bytes", None, 2.5)]},
    }

    scrubbed = before_send(event, {})

    assert "jane.doe@ucsc.edu" not in repr(scrubbed)
