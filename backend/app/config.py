"""
Application configuration and environment variables
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env from project root
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


def _parse_origins(raw: str | None) -> list[str]:
    """
    Parse the CORS_ORIGINS env var into a list of origins.

    Format: comma-separated origin URLs, e.g.
    ``http://localhost:5173,https://app.grepthink.com``.

    Whitespace is trimmed and empty entries are dropped. A literal ``*``
    is rejected — a wildcard origin combined with allow_credentials is a
    security bug that browsers silently reject at the preflight step,
    making CORS appear broken for no reason. See CODE_REVIEW.md #2.
    """
    if not raw:
        return []
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if "*" in origins:
        raise ValueError(
            "CORS_ORIGINS cannot contain '*' when credentials are allowed. "
            "List each frontend origin explicitly."
        )
    return origins


# Default allowlist covers local dev on Vite's default port plus the
# FastAPI dev server (used when hitting the backend directly via nginx).
_DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


class Settings:
    """Application settings loaded from environment variables"""

    # Supabase Configuration
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    SUPABASE_KEY: str = (
        os.environ.get("SUPABASE_KEY")
        or os.environ.get("VITE_SUPABASE_KEY")
        or os.environ.get("SUPABASE_SECRET_KEY")
    )
    SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET")
    SUPABASE_JWK_JSON: str = os.environ.get("SUPABASE_JWK_JSON")

    # Server Configuration
    HOST: str = os.environ.get("HOST", "0.0.0.0")
    PORT: int = int(os.environ.get("PORT", 5001))
    ENVIRONMENT: str = os.environ.get("ENVIRONMENT", "development").lower()

    # CORS Configuration
    # Set CORS_ORIGINS in .env for production. In dev we fall back to the
    # common local Vite/Next origins. Never use "*" here — it combines
    # badly with allow_credentials=True.
    CORS_ORIGINS: list = _parse_origins(os.environ.get("CORS_ORIGINS")) or _DEFAULT_DEV_ORIGINS
    CORS_CREDENTIALS: bool = True
    CORS_METHODS: list = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]
    CORS_HEADERS: list = ["Authorization", "Content-Type", "Accept"]

    # SMTP / Email Configuration (required for school-email verification emails)
    #
    # Resend (recommended):
    #   SMTP_HOST=smtp.resend.com
    #   SMTP_PORT=587
    #   SMTP_USER=resend                    # literal string — NOT your email
    #   SMTP_PASSWORD=re_xxxxxxxx           # API key from resend.com/api-keys
    #   SMTP_FROM=GrepThink <noreply@yourdomain.com>   # verified domain in Resend
    #
    # Gmail example:
    #   SMTP_HOST=smtp.gmail.com
    #   SMTP_USER=you@gmail.com
    #   SMTP_PASSWORD=app-password
    #   SMTP_FROM=GrepThink <you@gmail.com>
    #
    # A stray newline (a pasted value) must not become part of the setting: smtplib would look up
    # "smtp.example.com\n". Everything is stripped but the password, which may end in a space, so
    # only its line ending goes.
    SMTP_HOST: str = os.environ.get("SMTP_HOST", "").strip()
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", 587))
    SMTP_USER: str = os.environ.get("SMTP_USER", "").strip()
    SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "").rstrip("\r\n")
    SMTP_FROM: str = os.environ.get("SMTP_FROM", "").strip()

    # Maileroo HTTP API (app.utils.email_transport). When MAILEROO_API_KEY (a sending key) is
    # set, every email goes through the API instead of SMTP. EMAIL_FROM is the sender
    # ("GrepThink <noreply@example.com>"); it falls back to SMTP_FROM.
    MAILEROO_API_KEY: str = os.environ.get("MAILEROO_API_KEY", "").strip()
    MAILEROO_API_URL: str = (
        os.environ.get("MAILEROO_API_URL", "").strip().rstrip("/")
        or "https://smtp.maileroo.com/api/v2"
    )
    EMAIL_FROM: str = os.environ.get("EMAIL_FROM", "").strip()

    # Email outbox (app.outbox). EMAIL_DISPATCH_SECRET turns on POST /api/email/dispatch for
    # the pg_cron schedule and turns off the in-process loop (app.jobs.email_dispatch), which
    # otherwise runs every EMAIL_DISPATCH_POLL_SECONDS. The budgets bound how long one dispatch
    # run, or one request sending its own emails, keeps starting new sends.
    EMAIL_DISPATCH_SECRET: str = os.environ.get("EMAIL_DISPATCH_SECRET", "")
    EMAIL_DISPATCH_POLL_SECONDS: float = float(
        os.environ.get("EMAIL_DISPATCH_POLL_SECONDS")
        or os.environ.get("PENDING_INVITES_POLL_SECONDS")
        or 5
    )
    # Legacy name read by app.main until the lifespan switches to app.jobs.email_dispatch.
    PENDING_INVITES_POLL_SECONDS: float = EMAIL_DISPATCH_POLL_SECONDS
    EMAIL_DISPATCH_BUDGET_SECONDS: float = float(os.environ.get("EMAIL_DISPATCH_BUDGET_SECONDS", 8))
    EMAIL_INLINE_BUDGET_SECONDS: float = float(os.environ.get("EMAIL_INLINE_BUDGET_SECONDS", 8))

    # Maileroo webhook shared secret (POST /api/email/webhooks/maileroo). Unset: the endpoint
    # answers 503, so Maileroo keeps retrying until it is configured.
    MAILEROO_WEBHOOK_SECRET: str = os.environ.get("MAILEROO_WEBHOOK_SECRET", "")

    # Signs unsubscribe links. Unset: a key derived from SUPABASE_JWT_SECRET is used.
    EMAIL_UNSUBSCRIBE_SECRET: str = os.environ.get("EMAIL_UNSUBSCRIBE_SECRET", "")

    # Public URL of this API (https://api.example.com), for the one-click unsubscribe link in
    # the List-Unsubscribe header. Unset: emails carry only the frontend unsubscribe page link.
    PUBLIC_API_URL: str = (os.environ.get("PUBLIC_API_URL") or "").strip().rstrip("/")

    # Public frontend URL for links in transactional emails (signup, class join).
    # Falls back to the first CORS origin when unset.
    FRONTEND_URL: str = (os.environ.get("FRONTEND_URL") or "").strip().rstrip("/")

    @classmethod
    def validate(cls):
        """Validate required settings"""
        if not cls.SUPABASE_URL:
            raise ValueError("SUPABASE_URL must be set in .env file")
        if not cls.SUPABASE_KEY:
            raise ValueError("SUPABASE_KEY must be set in .env file")
        if not cls.SUPABASE_JWT_SECRET:
            # WARN: HS256 JWTs won't verify without this. RS256 still works via JWKS.
            logger.warning("SUPABASE_JWT_SECRET not set in .env — HS256 JWT verification will fail")
        if not cls.CORS_ORIGINS:
            raise ValueError("CORS_ORIGINS resolved to an empty list — set CORS_ORIGINS in .env")
        logger.info(
            "CORS configured | origins=%s environment=%s",
            cls.CORS_ORIGINS,
            cls.ENVIRONMENT,
        )


# Validate settings on import
settings = Settings()
settings.validate()
