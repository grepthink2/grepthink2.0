"""
Profile business logic
"""

import datetime
import hashlib
import hmac
import html
import logging
import os
import re
import secrets

from fastapi import HTTPException

from app.core.db import get_client
from app.core.errors import DatabaseConflictError, DatabaseError, DatabaseUnavailableError
from app.institutions.controller import is_school_email
from app.utils.email import send_email
from app.utils.profiles import needs_roster_email

logger = logging.getLogger(__name__)

PROFILE_FIELDS = "id, email, role, first_name, last_name, linkedin, github, image_url, edu_email"

_ALLOWED_UPDATE_FIELDS = {
    "first_name",
    "last_name",
    "linkedin",
    "github",
    "image_url",
    "edu_email",
}

# Pending school-email verifications live in the ``edu_email_verifications`` table, one row
# per user. They used to live in a module-level dict, which on serverless meant the instance
# that verified a code was rarely the one that had issued it.
_PENDING_TABLE = "edu_email_verifications"
_CODE_TTL = datetime.timedelta(minutes=10)
_RESEND_INTERVAL = datetime.timedelta(seconds=60)
_MAX_ATTEMPTS = 5

# One plain-ASCII mailbox: no whitespace or punctuation that could carry a header injection
# through the ``To:`` line (a comma, for instance, can turn one address into several) or get
# echoed unescaped into the email's HTML, and no non-ASCII lookalikes (a Turkish lower-cased
# "İ" is two code points, one of them a combining mark this rejects). An apostrophe is allowed
# in the local part (o'brien@...): Google Workspace and Microsoft 365 hand such addresses out,
# it is ordinary text in a header, and ``html.escape`` quotes it in the HTML body. Whether the
# host is a school is is_school_email's call (.edu, or an institution's email_domains).
_MAILBOX = re.compile(r"[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+")


def get_profile(user_id: str) -> dict:
    """
    Fetch a user's full profile row.
    """
    client = get_client()
    result = client.table("profiles").select(PROFILE_FIELDS).eq("id", user_id).limit(1).execute()
    return result.data[0] if result.data else {}


def _user_has_class_access(client, user_id: str, class_id: str, created_by: str) -> bool:
    """True if the user is the class instructor or enrolled as a student."""
    if user_id == created_by:
        return True
    enrollment = (
        client.table("class_enrollments")
        .select("id")
        .eq("class_id", class_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(enrollment.data)


def get_profile_for_class_member(viewer_id: str, target_user_id: str, class_id: str) -> dict:
    """
    Return a profile visible to another member of the same class.

    Both viewer and target must belong to the class (instructor via created_by,
    student via class_enrollments).
    """
    client = get_client()
    class_result = client.table("classes").select("id, created_by").eq("id", class_id).execute()
    if not class_result.data:
        raise HTTPException(status_code=404, detail="Class not found")

    created_by = class_result.data[0]["created_by"]
    if not _user_has_class_access(client, viewer_id, class_id, created_by):
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this class",
        )
    if not _user_has_class_access(client, target_user_id, class_id, created_by):
        raise HTTPException(status_code=404, detail="User is not in this class")

    profile = get_profile(target_user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


def update_profile(user_id: str, data: dict) -> dict:
    """
    Update mutable profile fields for a user.
    Only keys present in _ALLOWED_UPDATE_FIELDS are written.
    """
    if "edu_email" in data:
        # Whoever holds this address owns the matching roster row, so it is only ever set
        # by ``verify_edu_email`` once a code sent to it comes back. Removing it is harmless.
        if (data["edu_email"] or "").strip():
            raise HTTPException(
                status_code=400,
                detail=(
                    "A school email has to be verified before it is saved. "
                    "Request a verification code for it instead."
                ),
            )
        data = {**data, "edu_email": None}

    payload = {k: v for k, v in data.items() if k in _ALLOWED_UPDATE_FIELDS}
    if not payload:
        logger.debug("update_profile: no valid fields to update | user_id=%s", user_id)
        return get_profile(user_id)

    client = get_client()
    result = client.table("profiles").update(payload).eq("id", user_id).execute()
    updated = result.data[0] if result.data else {}
    full_profile = get_profile(user_id) if updated else {}

    _refresh_completion_reminder(user_id, full_profile)
    return full_profile or updated


def _refresh_completion_reminder(user_id: str, profile: dict) -> None:
    """Drop the complete-your-profile reminder once nothing is missing, else make sure it exists.

    Best-effort on the completeness check itself: this runs right after the write it follows
    has already been saved (here, or by ``verify_edu_email``), so an institutions-table outage
    inside ``is_school_email`` must not turn that successful save into a 500. Logged and
    skipped instead — neither dismissed nor (re-)created — and the next call with a healthy
    read catches the reminder up. The log level follows ``app.core.errors``: WARNING for an
    outage, ERROR for anything lasting (a missing grant, say), which Sentry records as an
    event rather than a breadcrumb.
    """
    from app.notifications.controller import (
        dismiss_profile_completion_notification,
        ensure_profile_completion_notification,
    )

    if profile:
        try:
            incomplete = _profile_incomplete(profile)
        except DatabaseError as exc:
            log = logger.warning if isinstance(exc, DatabaseUnavailableError) else logger.error
            log(
                "_refresh_completion_reminder: completeness check failed, skipping | user_id=%s",
                user_id,
                exc_info=True,
            )
            return
        if not incomplete:
            dismiss_profile_completion_notification(user_id)
            return
    ensure_profile_completion_notification(user_id)


def _profile_incomplete(profile: dict) -> bool:
    first = (profile.get("first_name") or "").strip()
    last = (profile.get("last_name") or "").strip()
    if not first or not last:
        return True
    return needs_roster_email(profile)


def _normalize_edu_email(raw: str | None) -> str:
    email = (raw or "").strip().lower()
    if not _MAILBOX.fullmatch(email) or not is_school_email(email):
        raise HTTPException(status_code=400, detail="Must be a valid school email address")
    return email


def _code_hash(user_id: str, edu_email: str, code: str) -> str:
    # Bound to the user and the address, so a row is useless anywhere else. Six digits are
    # guessable offline whatever the hash; what protects a code is the ten-minute expiry,
    # the attempt cap, and that only the service role can read this table.
    return hashlib.sha256(f"{user_id}:{edu_email}:{code}".encode()).hexdigest()


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


def _parse_ts(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=datetime.UTC)


def _pending_row(client, user_id: str) -> dict | None:
    rows = client.table(_PENDING_TABLE).select("*").eq("user_id", user_id).execute().data
    return rows[0] if rows else None


def _forget_pending(client, user_id: str) -> None:
    client.table(_PENDING_TABLE).delete().eq("user_id", user_id).execute()


def _runs_on_a_deployment() -> bool:
    # Vercel sets VERCEL=1 on every deployment, preview or production.
    return bool(os.environ.get("VERCEL"))


def send_edu_verification(user_id: str, edu_email: str) -> dict:
    """
    Email a 6-digit code to ``edu_email`` and remember its hash for ten minutes.

    One pending code per user: a new one replaces the old one and resets its attempts, and
    a user can ask for one at most once a minute. Returns ``{"delivery": "email" | "log"}``;
    ``"log"`` only happens on a developer machine with no SMTP settings, where the code is
    written to the server log so the flow can still be exercised.
    """
    email = _normalize_edu_email(edu_email)
    client = get_client()

    # Check availability before issuing a code so the error surfaces at
    # Save Changes time (inline), not after the user enters the code in the modal.
    conflict = (
        client.table("profiles").select("id").eq("edu_email", email).neq("id", user_id).execute()
    )
    if conflict.data:
        raise HTTPException(
            status_code=409,
            detail="This school email is already linked to another account.",
        )

    now = _utcnow()
    pending = _pending_row(client, user_id)
    last_sent = _parse_ts(pending.get("last_sent_at")) if pending else None
    if last_sent and now - last_sent < _RESEND_INTERVAL:
        raise HTTPException(
            status_code=429,
            detail="A code was just sent. Please wait a minute before asking for another.",
        )

    code = str(secrets.randbelow(1_000_000)).zfill(6)
    client.table(_PENDING_TABLE).upsert(
        {
            "user_id": user_id,
            "edu_email": email,
            "code_hash": _code_hash(user_id, email, code),
            "attempts": 0,
            "expires_at": (now + _CODE_TTL).isoformat(),
            "last_sent_at": now.isoformat(),
        },
        on_conflict="user_id",
    ).execute()

    body_text = (
        f"Your GrepThink school email verification code is: {code}\n\n"
        f"Enter this code in GrepThink to confirm your school email address.\n"
        f"This code expires in 10 minutes.\n\n"
        f"If you did not request this, you can safely ignore this message."
    )
    body_html = f"""
<html>
  <body style="font-family:sans-serif;color:#1a1a1a;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin-bottom:8px">Verify your school email</h2>
    <p>Enter the code below in GrepThink to confirm <strong>{html.escape(email)}</strong>.</p>
    <div style="font-size:2rem;font-weight:700;letter-spacing:0.25em;
                background:#f4f4f5;border-radius:8px;padding:16px 24px;
                display:inline-block;margin:16px 0">{code}</div>
    <p style="color:#666;font-size:0.875rem">This code expires in 10 minutes.<br>
    If you did not request this, you can safely ignore this email.</p>
  </body>
</html>
"""

    try:
        send_email(
            to=email,
            subject="GrepThink — verify your school email",
            body_text=body_text,
            body_html=body_html,
        )
    except RuntimeError as exc:
        # SMTP is not configured. On a deployment that is an outage: nobody can receive the
        # code, so do not leave one pending. On a developer machine, log it so the flow can
        # be tested. It is never returned to the caller.
        if _runs_on_a_deployment():
            _forget_pending(client, user_id)
            raise HTTPException(
                status_code=503,
                detail=(
                    "Email delivery is not configured on this server. "
                    "Please contact your administrator."
                ),
            ) from exc
        logger.warning(
            "edu_verification: SMTP not configured — code for %s is %s (local development only)",
            email,
            code,
        )
        return {"delivery": "log"}

    logger.info("edu_verification: code sent | user_id=%s email=%s", user_id, email)
    return {"delivery": "email"}


def _claim_attempt(client, user_id: str, attempts: int) -> bool:
    """Spend one attempt, but only if nobody else spent it first.

    The update is conditional on the count that was just read, so of several guesses sent
    in parallel exactly one claims each attempt and the rest are turned away unevaluated.
    Five attempts therefore means five comparisons, however the requests are timed.
    """
    claimed = (
        client.table(_PENDING_TABLE)
        .update({"attempts": attempts + 1})
        .eq("user_id", user_id)
        .eq("attempts", attempts)
        .execute()
    )
    return bool(claimed.data)


def verify_edu_email(user_id: str, edu_email: str, code: str) -> dict:
    """
    Check the code for a pending school-email verification and, if it matches, save the address.
    """
    email = (edu_email or "").strip().lower()
    client = get_client()
    pending = _pending_row(client, user_id)
    if not pending:
        raise HTTPException(
            status_code=400,
            detail="No verification pending. Please request a new code.",
        )

    expires_at = _parse_ts(pending.get("expires_at"))
    if expires_at is None or _utcnow() > expires_at:
        _forget_pending(client, user_id)
        raise HTTPException(
            status_code=400,
            detail="Verification code expired. Please request a new one.",
        )

    if (pending.get("edu_email") or "").lower() != email:
        raise HTTPException(
            status_code=400,
            detail="Email mismatch. Please request a new code for this address.",
        )

    attempts = int(pending.get("attempts") or 0)
    if attempts >= _MAX_ATTEMPTS:
        _forget_pending(client, user_id)
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect codes. Please request a new one.",
        )
    if not _claim_attempt(client, user_id, attempts):
        raise HTTPException(
            status_code=409,
            detail="Another attempt is being checked. Please try again.",
        )

    expected = pending.get("code_hash") or ""
    if not hmac.compare_digest(expected, _code_hash(user_id, email, (code or "").strip())):
        left = _MAX_ATTEMPTS - (attempts + 1)
        if left <= 0:
            _forget_pending(client, user_id)
            raise HTTPException(
                status_code=429,
                detail="Too many incorrect codes. Please request a new one.",
            )
        raise HTTPException(
            status_code=400,
            detail=f"Invalid verification code. {left} attempt{'s' if left != 1 else ''} left.",
        )

    try:
        client.table("profiles").update({"edu_email": email}).eq("id", user_id).execute()
    except DatabaseConflictError as exc:
        # Another account claimed this edu_email between when the code was sent
        # and when it was verified (profiles_edu_email_key).
        _forget_pending(client, user_id)
        raise HTTPException(
            status_code=409,
            detail="This school email is already linked to another account.",
        ) from exc
    _forget_pending(client, user_id)

    profile = get_profile(user_id)
    _refresh_completion_reminder(user_id, profile)
    logger.info("edu_verification: verified and saved | user_id=%s email=%s", user_id, email)
    return profile
