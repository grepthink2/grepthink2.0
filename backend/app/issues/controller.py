"""Business logic for the website's issue form.

A report becomes a public GitHub issue (``app.issues.github``) and an email to the maintainer
that carries the reporter's address. The address never appears in the issue.
"""

from __future__ import annotations

import html
import logging
import re

from fastapi import HTTPException

from app.contact.controller import CONTACT_RECIPIENT, EMAIL_RE
from app.institutions.controller import is_school_email
from app.issues import github
from app.utils.email import send_email
from app.utils.email_transport import EmailDeliveryError

logger = logging.getLogger(__name__)

# Created once in the repository by hand; GitHub drops labels a token may not set.
ISSUE_LABELS = ("from-web", "needs-triage")

# GitHub's username rule: 1-39 letters, digits or single hyphens, with no hyphen at either end.
# Use fullmatch: it has no anchors.
GITHUB_LOGIN_RE = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}")

# An "@name" typed in the description would make GitHub notify that account from ours. A
# zero-width space after the "@" stops the mention and looks the same. An "@" inside a word (an
# email address) is never a mention, so it is left alone.
_MENTION_RE = re.compile(r"(?<![\w@])@(?=[A-Za-z0-9])")
_ZERO_WIDTH_SPACE = "​"


def defuse_mentions(text: str) -> str:
    return _MENTION_RE.sub("@" + _ZERO_WIDTH_SPACE, text)


def _issue_body(description: str, login: str) -> str:
    # The reporter is a link, not an @-mention, so nobody can make GitHub notify a stranger.
    return (
        f"{defuse_mentions(description)}\n\n---\n"
        f"Reported by [{login}](https://github.com/{login}) through the website's issue form."
    )


def submit_issue(
    *, github_user: str, email: str, title: str, description: str, website: str = ""
) -> dict:
    """Check a report, file it on GitHub, and email it to the maintainer.

    Returns ``{"issue_number", "issue_url"}``; both are None when the report was emailed but not
    filed (GitHub unreachable, token unset or refused), or when the honeypot caught a bot.

    Raises:
        HTTPException(400): a malformed username, a non-school email, or an unknown GitHub user.
        HTTPException(502): neither GitHub nor the email reached anyone.
        DatabaseError: a non-``.edu`` address needs the institutions list and it can't be read.
    """
    # Honeypot: pretend success so the bot learns nothing, and send nothing.
    if website.strip():
        logger.info("issues: honeypot triggered, dropping the report silently")
        return {"issue_number": None, "issue_url": None}

    login = github_user.strip()
    if login.startswith("@"):
        login = login[1:]
    if not GITHUB_LOGIN_RE.fullmatch(login):
        raise HTTPException(status_code=400, detail="Enter a valid GitHub username.")

    email = email.strip()
    if not EMAIL_RE.match(email) or not is_school_email(email):
        raise HTTPException(
            status_code=400, detail="Use a school email, or send us a note through Contact."
        )

    # None (GitHub could not be asked) skips the check: the same outage would stop the filing,
    # and the report still reaches the maintainer by email.
    if github.lookup_user(login) is False:
        raise HTTPException(status_code=400, detail="That GitHub username doesn't exist.")

    title = " ".join(title.split())  # one line: it is also an email Subject
    description = description.strip()
    filed = github.create_issue(
        title=title, body=_issue_body(description, login), labels=ISSUE_LABELS
    )
    number, url = filed if filed else (None, None)

    subject = f"Issue report from {login}: {title}" + (f" (#{number})" if number else "")
    where = url or "Not filed on GitHub"
    body_text = f"GitHub user: {login}\nEmail: {email}\nIssue: {where}\n\n{description}\n"
    body_html = (
        f"<p><strong>GitHub user:</strong> {html.escape(login)}</p>"
        f"<p><strong>Email:</strong> {html.escape(email)}</p>"
        f"<p><strong>Issue:</strong> {html.escape(where)}</p>"
        f"<p>{html.escape(description).replace(chr(10), '<br>')}</p>"
    )
    try:
        send_email(
            to=CONTACT_RECIPIENT,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            reply_to=email,
        )
    except EmailDeliveryError as exc:
        if filed is None:
            logger.error("issues: report neither filed nor emailed | %s", type(exc).__name__)
            raise HTTPException(status_code=502, detail="Failed to send your report") from exc
        # The issue footer still names the reporter; only the private address is lost.
        logger.error("issues: filed #%s but the email failed | %s", number, type(exc).__name__)

    return {"issue_number": number, "issue_url": url}
