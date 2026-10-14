"""The two GitHub calls behind the website's issue form.

Each sits behind one function, so a GitHub App could replace the token later without touching
the controller. Both are best-effort: a failure answers None and the controller decides what the
reporter sees. Log lines carry status codes and exception types only: a response body can echo
what was sent, and nothing can scrub a username or a title out of Sentry.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

API_URL = "https://api.github.com"
FETCH_TIMEOUT_S = 5.0


def _client() -> httpx.Client:
    return httpx.Client(timeout=FETCH_TIMEOUT_S)


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "grepthink2-issue-form",
    }
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


def lookup_user(login: str) -> bool | None:
    """Whether a GitHub account named ``login`` exists.

    True or False from a 200 or a 404; None when GitHub could not be asked (rate limit, outage,
    network). Asks anonymously when GITHUB_TOKEN is unset. ``login`` must already match GitHub's
    username rule, so it is safe in a URL path.
    """
    try:
        with _client() as http:
            response = http.get(f"{API_URL}/users/{login}", headers=_headers())
    except httpx.HTTPError as exc:
        logger.warning("issues: GitHub user lookup failed | %s", type(exc).__name__)
        return None
    if response.status_code == 200:
        return True
    if response.status_code == 404:
        return False
    logger.warning("issues: GitHub user lookup answered %s", response.status_code)
    return None


def create_issue(*, title: str, body: str, labels: Sequence[str]) -> tuple[int, str] | None:
    """File an issue in ``settings.GITHUB_ISSUES_REPO``; answer its number and HTML URL.

    None when GITHUB_TOKEN is unset (nothing is sent), when GitHub answers anything but 201, or
    when the request fails.
    """
    if not settings.GITHUB_TOKEN:
        logger.warning("issues: GITHUB_TOKEN is unset, so the report is not filed on GitHub")
        return None
    try:
        with _client() as http:
            response = http.post(
                f"{API_URL}/repos/{settings.GITHUB_ISSUES_REPO}/issues",
                headers=_headers(),
                json={"title": title, "body": body, "labels": list(labels)},
            )
    except httpx.HTTPError as exc:
        logger.error("issues: filing on GitHub failed | %s", type(exc).__name__)
        return None
    if response.status_code != 201:
        logger.error("issues: GitHub refused the issue | status=%s", response.status_code)
        return None
    try:
        data = response.json()
        return int(data["number"]), str(data["html_url"])
    except (ValueError, KeyError, TypeError):
        logger.error("issues: GitHub filed the issue but its answer had no number or URL")
        return None
