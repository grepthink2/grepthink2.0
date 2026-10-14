"""The website's issue form: ``POST /api/issues`` (app/issues).

GitHub and the mailer are fakes here; ``tests/test_issues_github.py`` covers the GitHub calls.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

from app.contact.controller import CONTACT_RECIPIENT
from app.issues import controller
from app.limiter import limiter
from app.utils.email_transport import TransientEmailError

URL = "/api/issues"
ISSUE_URL = "https://github.com/grepthink2/grepthink2.0/issues/123"
REPORT = {
    "github_user": "@octocat",
    "email": "ann@ucsc.edu",
    "title": "Board crashes on load",
    "description": "It **breaks** when the sprint is empty.",
    "website": "",
}


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    """Every test posts; 5/minute would otherwise run out a few tests in."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def world(monkeypatch):
    """Fake GitHub and mailer, recording what each was asked. Set ``user_exists``, ``filed``
    or ``email_error`` before posting to change what they answer."""
    w = SimpleNamespace(
        user_exists=True,
        filed=(123, ISSUE_URL),
        email_error=None,
        lookups=[],
        issues=[],
        emails=[],
    )

    def lookup_user(login):
        w.lookups.append(login)
        return w.user_exists

    def create_issue(*, title, body, labels):
        w.issues.append({"title": title, "body": body, "labels": labels})
        return w.filed

    def send_email(**kwargs):
        w.emails.append(kwargs)
        if w.email_error:
            raise w.email_error

    monkeypatch.setattr(controller.github, "lookup_user", lookup_user)
    monkeypatch.setattr(controller.github, "create_issue", create_issue)
    monkeypatch.setattr(controller, "send_email", send_email)
    return w


def test_a_report_becomes_a_public_issue_and_a_private_email(client, world):
    response = client.post(
        URL,
        json={
            **REPORT,
            "title": "  Board   crashes\non load ",
            "description": "Ping @alice, it **breaks**.",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"issue_number": 123, "issue_url": ISSUE_URL}
    assert world.lookups == ["octocat"]
    assert world.issues == [
        {
            "title": "Board crashes on load",
            "body": (
                "Ping @​alice, it **breaks**.\n\n---\n"
                "Reported by [octocat](https://github.com/octocat) through the website's issue form."
            ),
            "labels": ("from-web", "needs-triage"),
        }
    ]
    [email] = world.emails
    assert email["to"] == CONTACT_RECIPIENT
    assert email["reply_to"] == "ann@ucsc.edu"
    assert email["subject"] == "Issue report from octocat: Board crashes on load (#123)"
    assert "ann@ucsc.edu" in email["body_text"]
    assert ISSUE_URL in email["body_text"]
    assert "Ping @alice, it **breaks**." in email["body_text"]


def test_a_filled_honeypot_answers_as_if_nothing_was_filed(client, world):
    response = client.post(URL, json={**REPORT, "website": "https://spam.example"})

    assert response.status_code == 200
    assert response.json() == {"issue_number": None, "issue_url": None}
    assert (world.lookups, world.issues, world.emails) == ([], [], [])


BAD_USER = "Enter a valid GitHub username."
NOT_SCHOOL = "Use a school email, or send us a note through Contact."


@pytest.mark.parametrize(
    ("field", "value", "detail"),
    [
        ("github_user", "-octocat", BAD_USER),
        ("github_user", "octocat-", BAD_USER),
        ("github_user", "octo--cat", BAD_USER),
        ("github_user", "octo_cat", BAD_USER),
        ("github_user", "octo cat", BAD_USER),
        ("github_user", "a" * 40, BAD_USER),
        ("github_user", "@@octocat", BAD_USER),  # one "@" is dropped, not every one
        ("email", "ann@gmail.com", NOT_SCHOOL),
        ("email", "not-an-email", NOT_SCHOOL),
    ],
)
def test_a_malformed_report_is_refused_before_github_is_asked(client, world, field, value, detail):
    response = client.post(URL, json={**REPORT, field: value})

    assert response.status_code == 400
    assert response.json()["detail"] == detail
    assert (world.lookups, world.issues, world.emails) == ([], [], [])


@pytest.mark.parametrize("login", ["a", "0", "a" * 39, "octo-cat", "Octo-Cat-42"])
def test_github_login_shapes_github_allows(login):
    assert controller.GITHUB_LOGIN_RE.fullmatch(login)


def test_an_institution_domain_counts_as_a_school_email(client, world, with_istinye):
    response = client.post(URL, json={**REPORT, "email": "ali@stu.istinye.edu.tr"})

    assert response.status_code == 200
    assert world.emails[0]["reply_to"] == "ali@stu.istinye.edu.tr"


def test_an_edu_address_needs_no_institutions_read(client, world, monkeypatch):
    def unavailable():
        raise AssertionError("a .edu address must not read the institutions table")

    monkeypatch.setattr("app.institutions.controller.load_institutions", unavailable)

    assert client.post(URL, json=REPORT).status_code == 200


def test_an_unknown_github_user_is_refused_and_nothing_is_filed(client, world):
    world.user_exists = False

    response = client.post(URL, json=REPORT)

    assert response.status_code == 400
    assert response.json()["detail"] == "That GitHub username doesn't exist."
    assert (world.issues, world.emails) == ([], [])


def test_a_lookup_github_cannot_answer_does_not_block_the_report(client, world):
    world.user_exists = None

    response = client.post(URL, json=REPORT)

    assert response.json() == {"issue_number": 123, "issue_url": ISSUE_URL}


def test_a_report_github_does_not_take_still_reaches_the_maintainer(client, world):
    world.filed = None

    response = client.post(URL, json=REPORT)

    assert response.status_code == 200
    assert response.json() == {"issue_number": None, "issue_url": None}
    [email] = world.emails
    assert email["subject"] == "Issue report from octocat: Board crashes on load"
    assert "Not filed on GitHub" in email["body_text"]


def test_an_email_failure_after_filing_still_answers_with_the_issue(client, world, caplog):
    world.email_error = TransientEmailError("smtp unavailable")

    with caplog.at_level(logging.ERROR, logger="app.issues.controller"):
        response = client.post(URL, json=REPORT)

    assert response.status_code == 200
    assert response.json() == {"issue_number": 123, "issue_url": ISSUE_URL}
    assert "#123" in caplog.text


def test_a_report_that_reaches_no_one_answers_502(client, world):
    world.filed = None
    world.email_error = TransientEmailError("smtp unavailable")

    response = client.post(URL, json=REPORT)

    assert response.status_code == 502
    assert response.json()["detail"] == "Failed to send your report"


@pytest.mark.parametrize("field", ["title", "description"])
def test_a_blank_title_or_description_is_refused(client, world, field):
    response = client.post(URL, json={**REPORT, field: "  \n  "})

    assert response.status_code == 422
    assert (world.lookups, world.issues, world.emails) == ([], [], [])


@pytest.mark.parametrize(
    ("typed", "filed"),
    [
        ("thanks @alice", "thanks @​alice"),
        ("@org/team look", "@​org/team look"),
        ("(@bob)", "(@​bob)"),
        # GitHub's "not after a word character" is ASCII-only, and it reads text after
        # character references are decoded.
        ("@@alice", "@@​alice"),
        ("é@alice", "é@​alice"),
        ("日本@alice", "日本@​alice"),
        ("&#64;alice", "@​alice"),
        ("&#x40;alice", "@​alice"),
        ("&commat;alice", "@​alice"),
        ("mail ann@ucsc.edu", "mail ann@ucsc.edu"),  # an address, not a mention
        ("a lone @ sign", "a lone @ sign"),
    ],
)
def test_mentions_in_the_description_cannot_notify_anyone(typed, filed):
    assert controller.defuse_mentions(typed) == filed


def test_the_issue_form_is_rate_limited():
    [rule] = limiter._route_limits["app.issues.views.submit_issue"]
    assert str(rule.limit) == "5 per 1 minute"
