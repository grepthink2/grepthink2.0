"""
Security headers middleware.

Adds a conservative set of defensive response headers to every API
response. These headers do nothing for ``/api/*`` JSON payloads on their
own, but they matter if the API is ever served from the same origin as
the frontend (e.g. behind nginx) because browsers apply them to any
HTML/JS the host returns and to error pages the API itself renders.

The Content-Security-Policy here is intentionally minimal. The frontend
SPA ships its own CSP via nginx; this one only governs the few bytes of
HTML the API returns on errors. Do not relax it to allow scripts — the
FastAPI host should never serve executable JS.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach defensive headers to every outgoing response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        # Strict transport security: tell browsers to only ever hit us
        # over HTTPS for the next year, including subdomains. Safe to
        # set unconditionally — browsers ignore it on http:// origins.
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
        # Block MIME sniffing — prevents a browser from treating a JSON
        # response as HTML if an attacker can coerce a Content-Type
        # mismatch upstream.
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        # Clickjacking defense for any HTML surface the API might render.
        response.headers.setdefault("X-Frame-Options", "DENY")
        # Don't leak referring URLs to third parties.
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        # Disable powerful browser APIs that API responses never need.
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )
        # Minimal CSP for error pages / docs. The SPA overrides this.
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'",
        )
        return response
