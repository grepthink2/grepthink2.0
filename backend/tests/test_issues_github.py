"""The two GitHub calls behind the issue form (app/issues/github.py), against a fake API."""

from __future__ import annotations

import json
import logging

import httpx
import pytest

from app.config import settings
from app.issues import github

TOKEN = "github_pat_for_tests"
ISSUE_URL = "https://github.com/grepthink2/grepthink2.0/issues/123"


@pytest.fixture
def api(monkeypatch):
    """Send the module's requests to a handler that records them and answers ``api["reply"]``
    (a response, or an exception to raise)."""
    state: dict = {"requests": [], "reply": httpx.Response(200, json={})}

    def handler(request: httpx.Request) -> httpx.Response:
        state["requests"].append(request)
        if isinstance(state["reply"], Exception):
            raise state["reply"]
        return state["reply"]

    monkeypatch.setattr(
        github, "_client", lambda: httpx.Client(transport=httpx.MockTransport(handler))
    )
    monkeypatch.setattr(settings, "GITHUB_TOKEN", TOKEN)
    monkeypatch.setattr(settings, "GITHUB_ISSUES_REPO", "grepthink2/grepthink2.0")
    return state


@pytest.mark.parametrize(
    ("status", "exists"), [(200, True), (404, False), (403, None), (500, None)]
)
def test_lookup_user_reads_github_s_answer(api, status, exists):
    api["reply"] = httpx.Response(status, json={})

    assert github.lookup_user("octocat") is exists

    [request] = api["requests"]
    assert (request.method, str(request.url)) == ("GET", "https://api.github.com/users/octocat")
    assert request.headers["Authorization"] == f"Bearer {TOKEN}"
    assert request.headers["Accept"] == "application/vnd.github+json"
    assert request.headers["X-GitHub-Api-Version"] == "2022-11-28"
    assert request.headers["User-Agent"].startswith("grepthink2")


def test_lookup_user_asks_anonymously_without_a_token(api, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_TOKEN", "")

    assert github.lookup_user("octocat") is True
    assert "Authorization" not in api["requests"][0].headers


def test_lookup_user_answers_none_when_github_cannot_be_reached(api):
    api["reply"] = httpx.ConnectError("unreachable")

    assert github.lookup_user("octocat") is None


def test_create_issue_files_into_the_configured_repository(api):
    api["reply"] = httpx.Response(201, json={"number": 123, "html_url": ISSUE_URL})

    filed = github.create_issue(title="T", body="B", labels=("from-web", "needs-triage"))

    assert filed == (123, ISSUE_URL)
    [request] = api["requests"]
    assert (request.method, str(request.url)) == (
        "POST",
        "https://api.github.com/repos/grepthink2/grepthink2.0/issues",
    )
    assert json.loads(request.content) == {
        "title": "T",
        "body": "B",
        "labels": ["from-web", "needs-triage"],
    }
    assert request.headers["Authorization"] == f"Bearer {TOKEN}"


def test_create_issue_files_nothing_without_a_token(api, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_TOKEN", "")

    assert github.create_issue(title="T", body="B", labels=()) is None
    assert api["requests"] == []


def test_a_refusal_is_logged_with_its_status_and_never_its_body(api, caplog):
    api["reply"] = httpx.Response(403, json={"message": "Resource not accessible: echo-of-input"})

    with caplog.at_level(logging.ERROR, logger="app.issues.github"):
        assert github.create_issue(title="T", body="B", labels=()) is None

    assert "403" in caplog.text
    assert "echo-of-input" not in caplog.text


@pytest.mark.parametrize(
    "reply",
    [httpx.ReadTimeout("slow"), httpx.Response(201, json={"unexpected": True})],
    ids=["timeout", "no-number"],
)
def test_create_issue_answers_none_when_it_cannot_tell_what_was_filed(api, reply):
    api["reply"] = reply

    assert github.create_issue(title="T", body="B", labels=()) is None
