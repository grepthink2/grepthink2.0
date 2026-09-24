"""Error reporting to Sentry. Optional: nothing starts unless ``SENTRY_DSN`` is set.

What is sent
    Error events only. Tracing, profiling and release-health sessions stay off, which
    keeps the project inside Sentry's free tier. The SDK never collects request bodies
    or local variables, and ``before_send`` scrubs every event before it leaves the
    process: cookies, query strings and all but a few harmless request headers; the
    values of credential-like environment variables (Supabase keys, the SMTP password,
    AI and GitHub/GitLab tokens, and whatever is added later); and anything shaped like
    an email address, IPv4 address, JWT or provider token.

When it is sent
    The SDK sends from a background thread, but Vercel may freeze the function as soon
    as a response is complete, stranding whatever is still queued. Its legacy Lambda
    handler returns the moment it has read Content-Length bytes, so delivery has to finish
    before the response starts. The catch-all 500 handler waits for delivery before it
    answers (``report_unhandled_exception``), and ``SentryFlushMiddleware`` holds back
    any other response until the events captured while producing it are delivered. A
    request that captured nothing is not delayed, and no wait lasts longer than
    ``FLUSH_TIMEOUT_SECONDS``.
"""

from __future__ import annotations

import os
import re
import threading
from collections.abc import Callable, Mapping
from typing import Any

import sentry_sdk
from sentry_sdk.utils import event_from_exception
from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# The longest a response waits for its events to reach Sentry.
FLUSH_TIMEOUT_SECONDS = 2.0

_FILTERED = "[Filtered]"


def init_sentry(**overrides: Any) -> bool:
    """Start the SDK if ``SENTRY_DSN`` is set, and say whether it started.

    ``app.main`` calls this before it builds the app, because the SDK's FastAPI
    integration instruments Starlette as it starts. The environment is read at call
    time, after ``app.config`` has loaded the repo-root ``.env``. ``overrides`` go
    straight to ``sentry_sdk.init``; tests use them to swap in a recording transport.
    """
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    options: dict[str, Any] = {
        "dsn": dsn,
        # ENVIRONMENT wins. Vercel does not set it today, so fall back to Vercel's own
        # VERCEL_ENV (production / preview) rather than filing PROD errors as development.
        "environment": (
            os.environ.get("ENVIRONMENT") or os.environ.get("VERCEL_ENV") or "development"
        )
        .strip()
        .lower(),
        # The deployed commit, so every issue points at the code that raised it.
        "release": os.environ.get("VERCEL_GIT_COMMIT_SHA") or None,
        "send_default_pii": False,
        "max_request_body_size": "never",
        "include_local_variables": False,
        "before_send": before_send,
        # Errors only.
        "traces_sample_rate": 0.0,
        "profiles_sample_rate": 0.0,
        "auto_session_tracking": False,
        # No sentry-trace / baggage headers on requests to Supabase or anyone else.
        "trace_propagation_targets": [],
    }
    sentry_sdk.init(**{**options, **overrides})
    return True


# ---------------------------------------------------------------------------- scrubbing

# Request headers whose values are kept. Every other header is reported as present but
# filtered: Authorization, Cookie, apikey, X-Forwarded-For, the X-Vercel-Ip-* location
# headers, the X-Vercel-Oidc-Token that Vercel's runtime adds to every request, ...
_SAFE_HEADERS = frozenset(
    {
        "accept",
        "accept-encoding",
        "accept-language",
        "cache-control",
        "content-length",
        "content-type",
        "host",
        "origin",
        "user-agent",
        "x-forwarded-host",
        "x-forwarded-proto",
        "x-vercel-deployment-url",
        "x-vercel-id",
    }
)

# Names (dictionary keys, environment variables) whose values are credentials or
# personal data. Deliberately broad: filtering a harmless value costs little.
_SENSITIVE_NAME = re.compile(
    r"pass|pwd|secret|token|auth|cookie|session|credential|signature|private|bearer|jwt|dsn"
    r"|email|phone|apikey|(?:^|[^a-z])key(?:[^a-z]|$)",
    re.IGNORECASE,
)

# Environment values shorter than this are not treated as secrets (ports, flags, ...).
_MIN_SECRET_LENGTH = 8

# Shapes redacted from every string, in order. Each pattern runs only on strings that
# contain one of its hints (or always, without hints), so large strings stay cheap.
_PATTERNS: tuple[tuple[tuple[str, ...], re.Pattern[str], str], ...] = (
    # Credentials inside URLs: scheme://user:password@host
    (("://",), re.compile(r"(://[^\s/:@\"'<>]{1,256}:)[^\s/@\"'<>]{1,256}@"), rf"\1{_FILTERED}@"),
    # Authorization header values quoted in messages (not the word "basic" in prose).
    ((), re.compile(r"\b([Bb]earer|Basic)\s+[\w.~+/=-]{16,}"), rf"\1 {_FILTERED}"),
    # JWTs: Supabase access tokens and legacy anon / service-role keys, Vercel OIDC tokens.
    (("eyJ",), re.compile(r"\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]*"), _FILTERED),
    # Provider credentials: Supabase secret keys, GitHub, GitLab, OpenAI / Anthropic, Google.
    (
        (),
        re.compile(
            r"\b(?:sb_secret_[\w-]{10,}|gh[pousr]_\w{20,}|github_pat_\w{20,}"
            r"|gl(?:pat|dt|rt|rtr|cbt|ptt|ft|imt|agent|wt|soat|ffct|oas)-[\w.-]{20,}"
            r"|sk-[\w-]{20,}|AIza[\w-]{30,})"
        ),
        _FILTERED,
    ),
    # Email addresses, also URL-encoded. Bounded repeats keep long strings linear.
    (
        ("@", "%40"),
        re.compile(r"[\w.%+-]{1,64}(?:@|%40)(?:[a-z0-9-]{1,63}\.){1,8}[a-z]{2,24}\b", re.I),
        "[email]",
    ),
    # IPv4 addresses.
    (
        (".",),
        re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b"),
        "[ip]",
    ),
)

# A run of non-space characters, for finding URLs and paths that carry a query string.
_URL_LIKE = re.compile(r"[^\s\"'<>]+")

# Parts of an event the SDK itself fills in. Their key names are structural (the trace
# context carries a "public_key"), so only their string values are redacted.
_SDK_OWNED = frozenset({"debug_meta", "modules", "sdk", "_meta"})


def before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any]:
    """Scrub an outgoing error event and note that one is on its way (see the module doc)."""
    scrubbed = _scrub_event(event)
    _note_event_queued()
    return scrubbed


def _scrub_event(event: Mapping[str, Any]) -> dict[str, Any]:
    redact = _redactor(os.environ)
    scrubbed: dict[str, Any] = {}
    for key, value in event.items():
        if key == "request" and isinstance(value, Mapping):
            value = _request_without_private_parts(value)
        elif key == "user" and isinstance(value, Mapping):
            # Keep the opaque id (the app sets nothing else); drop email, IP address, name.
            value = {"id": value["id"]} if value.get("id") is not None else {}
        elif key == "breadcrumbs":
            value = _breadcrumbs_without_queries(value)

        if key == "contexts" and isinstance(value, Mapping):
            scrubbed[key] = {
                name: _scrub(context, redact, by_name=name != "trace")
                for name, context in value.items()
            }
        else:
            scrubbed[key] = _scrub(value, redact, by_name=key not in _SDK_OWNED)
    return scrubbed


def _request_without_private_parts(request: Mapping[str, Any]) -> dict[str, Any]:
    """Drop the body, cookies, query string and WSGI environ; keep harmless header values."""
    kept = {k: v for k, v in request.items() if k not in ("data", "cookies", "query_string", "env")}
    if isinstance(kept.get("url"), str):
        kept["url"] = kept["url"].split("?", 1)[0].split("#", 1)[0]
    headers = kept.get("headers")
    if isinstance(headers, Mapping):
        kept["headers"] = {
            name: value if str(name).lower() in _SAFE_HEADERS else _FILTERED
            for name, value in headers.items()
        }
    return kept


def _breadcrumbs_without_queries(breadcrumbs: Any) -> Any:
    """Drop the query strings that HTTP-client breadcrumbs record next to each URL."""
    values = breadcrumbs.get("values") if isinstance(breadcrumbs, Mapping) else None
    if not isinstance(values, list):
        return breadcrumbs
    cleaned = []
    for crumb in values:
        if isinstance(crumb, Mapping) and isinstance(crumb.get("data"), Mapping):
            data = {
                k: v for k, v in crumb["data"].items() if k not in ("http.query", "http.fragment")
            }
            crumb = {**crumb, "data": data}
        cleaned.append(crumb)
    return {**breadcrumbs, "values": cleaned}


def _redactor(environ: Mapping[str, str]) -> Callable[[str], str]:
    """Build the string redaction for one event, with the environment's secrets as of now."""
    secrets = sorted(
        {
            value.strip()
            for name, value in environ.items()
            if _SENSITIVE_NAME.search(name) and len(value.strip()) >= _MIN_SECRET_LENGTH
        },
        key=len,
        reverse=True,
    )

    def redact(text: str) -> str:
        for secret in secrets:
            if secret in text:
                text = text.replace(secret, _FILTERED)
        if "?" in text:
            text = _URL_LIKE.sub(_without_query, text)
        for hints, pattern, replacement in _PATTERNS:
            if not hints or any(hint in text for hint in hints):
                text = pattern.sub(replacement, text)
        return text

    return redact


def _without_query(match: re.Match[str]) -> str:
    """``/path?query`` or ``https://host/path?query`` -> keep the path, filter the query."""
    token = match.group(0)
    query = token.find("?")
    if 0 < query < len(token) - 1 and "/" in token[:query]:
        return token[: query + 1] + _FILTERED
    return token


def _scrub(value: Any, redact: Callable[[str], str], *, by_name: bool) -> Any:
    """Redact every string in ``value``; with ``by_name``, also filter sensitive keys."""
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, Mapping):
        return {
            key: _FILTERED
            if by_name and isinstance(key, str) and _SENSITIVE_NAME.search(key)
            else _scrub(item, redact, by_name=by_name)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_scrub(item, redact, by_name=by_name) for item in value]
    return value


# ----------------------------------------------------------------------------- delivery

# Error events handed to the transport since the process started (counted in before_send).
_events_queued = 0
_events_queued_lock = threading.Lock()


def _note_event_queued() -> None:
    global _events_queued
    with _events_queued_lock:
        _events_queued += 1


async def _deliver_queued_events() -> None:
    """Wait, at most ``FLUSH_TIMEOUT_SECONDS``, until the SDK has sent everything queued.

    ``sentry_sdk.flush`` blocks until the SDK's sender thread is done, so it runs in a
    worker thread and the event loop keeps serving other requests meanwhile.
    """
    await run_in_threadpool(sentry_sdk.flush, FLUSH_TIMEOUT_SECONDS)


async def report_unhandled_exception(exc: BaseException) -> None:
    """Report an exception no route handled, and wait until Sentry has it.

    Called by the catch-all 500 handler in ``app.core.errors`` before it answers. The
    event is marked unhandled, as the SDK's Starlette integration marks such errors;
    the handler's own log call and the SDK's capture of the re-raised exception are then
    dropped as duplicates. A no-op when Sentry is off.
    """
    client = sentry_sdk.get_client()
    if not client.is_active():
        return
    event, hint = event_from_exception(
        exc, client_options=client.options, mechanism={"type": "starlette", "handled": False}
    )
    sentry_sdk.capture_event(event, hint=hint)
    await _deliver_queued_events()


class SentryFlushMiddleware:
    """Hold back each response until the events queued while producing it are delivered.

    ``app.main`` adds it last, so it is the outermost middleware and sees every response
    except the catch-all 500, which ``report_unhandled_exception`` delivers itself. It
    delivers before the response starts, and again before its last chunk if something
    was captured while the body streamed. It waits whenever any event was queued since
    the last check (a concurrent request's event can cause an extra, harmless wait); a
    request during which nothing was captured is not delayed.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        delivered_up_to = _events_queued

        async def send_after_delivery(message: Message) -> None:
            nonlocal delivered_up_to
            starts = message["type"] == "http.response.start"
            ends = message["type"] == "http.response.body" and not message.get("more_body", False)
            if (starts or ends) and _events_queued != delivered_up_to:
                delivered_up_to = _events_queued
                await _deliver_queued_events()
            await send(message)

        await self.app(scope, receive, send_after_delivery)
