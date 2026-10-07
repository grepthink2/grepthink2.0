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


def _parse_emails(raw: str | None) -> frozenset[str]:
    """Comma-separated e-mail addresses, lower-cased; blank → empty."""
    return frozenset(e.strip().lower() for e in (raw or "").split(",") if e.strip())


# Default allowlist covers local dev on Vite's default port plus the
# FastAPI dev server (used when hitting the backend directly via nginx).
_DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


_ON = frozenset({"1", "true", "yes", "on"})
_OFF = frozenset({"0", "false", "no", "off"})


def _on_or_off(name: str, *, default: bool) -> bool:
    """An on/off variable: 1/true/yes/on or 0/false/no/off, in any case and with spaces around.

    Unset or blank: ``default``. Anything else is logged and read as ``default`` too.
    """
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    if raw.lower() in _ON:
        return True
    if raw.lower() in _OFF:
        return False
    logger.warning(
        "%s=%r is not 1/true/yes/on or 0/false/no/off; using the default (%s)", name, raw, default
    )
    return default


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

    # Analytics (spec 4.1 #1): accounts that may see every institution's dashboard. Instructors
    # see the institutions of the classes they created without being listed here.
    ANALYTICS_ADMIN_EMAILS: frozenset[str] = _parse_emails(os.environ.get("ANALYTICS_ADMIN_EMAILS"))

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
    # otherwise runs every EMAIL_DISPATCH_POLL_SECONDS where EMAIL_DISPATCH_IN_PROCESS is on.
    # The budgets bound how long one dispatch run, or one request sending its own emails, keeps
    # starting new sends.
    EMAIL_DISPATCH_SECRET: str = os.environ.get("EMAIL_DISPATCH_SECRET", "").strip()
    # Whether this process may run that loop. On by default only on Vercel production
    # (VERCEL_ENV=production): a local backend pointed at the shared DEV database would
    # otherwise dispatch everyone's DEV outbox (and pause it, having no mail provider), and a
    # Preview deployment given PROD database variables would send PROD email. Set it to 1 to
    # dispatch locally. With it off and no schedule, queued emails wait (app.main warns).
    EMAIL_DISPATCH_IN_PROCESS: bool = _on_or_off(
        "EMAIL_DISPATCH_IN_PROCESS",
        default=os.environ.get("VERCEL_ENV", "").strip().lower() == "production",
    )
    EMAIL_DISPATCH_POLL_SECONDS: float = float(
        os.environ.get("EMAIL_DISPATCH_POLL_SECONDS")
        or os.environ.get("PENDING_INVITES_POLL_SECONDS")
        or 5
    )
    EMAIL_DISPATCH_BUDGET_SECONDS: float = float(os.environ.get("EMAIL_DISPATCH_BUDGET_SECONDS", 8))
    EMAIL_INLINE_BUDGET_SECONDS: float = float(os.environ.get("EMAIL_INLINE_BUDGET_SECONDS", 8))

    # Maileroo webhook shared secret (POST /api/email/webhooks/maileroo). Unset: the endpoint
    # answers 503, and Maileroo sends each event again 8 times over about 14 hours, then drops it.
    MAILEROO_WEBHOOK_SECRET: str = os.environ.get("MAILEROO_WEBHOOK_SECRET", "").strip()

    # Signs unsubscribe links. Unset: a key derived from SUPABASE_JWT_SECRET is used.
    EMAIL_UNSUBSCRIBE_SECRET: str = os.environ.get("EMAIL_UNSUBSCRIBE_SECRET", "").strip()

    # Public URL of this API (https://api.example.com), for the one-click unsubscribe link in
    # the List-Unsubscribe header. Unset: emails carry only the frontend unsubscribe page link.
    PUBLIC_API_URL: str = (os.environ.get("PUBLIC_API_URL") or "").strip().rstrip("/")

    # Public frontend URL for links in transactional emails (signup, class join).
    # Falls back to the first CORS origin when unset.
    FRONTEND_URL: str = (os.environ.get("FRONTEND_URL") or "").strip().rstrip("/")

    # --- Scrum board integrations (all optional; features degrade when unset) ---
    # PR/MR state: GITHUB_TOKEN lifts api.github.com to 5k req/h (Vercel egress IPs
    # share the anonymous 60/h pool); GITLAB_UCSC_TOKEN is a git.ucsc.edu PAT with
    # read_api. AI drafting: OpenAI-compatible endpoint — e.g. Cloudflare Workers AI
    #   AI_BASE_URL=https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1
    #   AI_MODEL=@cf/meta/llama-3.1-8b-instruct
    # Empty AI_API_KEY disables drafting (board payload sends ai_enabled=false).
    GITHUB_TOKEN: str = os.environ.get("GITHUB_TOKEN", "")
    GITLAB_UCSC_TOKEN: str = os.environ.get("GITLAB_UCSC_TOKEN", "")
    AI_BASE_URL: str = os.environ.get("AI_BASE_URL", "")
    AI_API_KEY: str = os.environ.get("AI_API_KEY", "")
    AI_MODEL: str = os.environ.get("AI_MODEL", "@cf/meta/llama-3.1-8b-instruct")

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
