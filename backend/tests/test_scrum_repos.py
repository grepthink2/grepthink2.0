"""Per-project repo registry (D8 revision): URL parsing, write-only tokens, token matching."""

import pytest
from fastapi import HTTPException

from app.scrum import controller
from app.scrum.pr_links import parse_repo_url, pr_repo_prefix
from tests.scrum_support import INSTR, OUTSIDER, PID, UID, scrum_db

REPO = {
    "id": "r1",
    "project_id": PID,
    "repo_url": "https://github.com/ucsc/grepthink2.0",
    "provider": "github",
    "access_token": "secret",
    "created_at": "2026-08-21T00:00:00Z",
}


@pytest.mark.parametrize(
    ("url", "provider", "canonical"),
    [
        ("https://github.com/ucsc/grepthink2.0", "github", "https://github.com/ucsc/grepthink2.0"),
        (
            "https://github.com/ucsc/grepthink2.0.git",
            "github",
            "https://github.com/ucsc/grepthink2.0",
        ),
        ("https://github.com/ucsc/grepthink2.0/", "github", "https://github.com/ucsc/grepthink2.0"),
        (
            "https://git.ucsc.edu/cse115a/team1/project",
            "gitlab",
            "https://git.ucsc.edu/cse115a/team1/project",
        ),
    ],
)
def test_parse_repo_url_accepts(url, provider, canonical):
    assert parse_repo_url(url) == {"provider": provider, "repo_url": canonical}


@pytest.mark.parametrize(
    "url",
    [
        "https://gitlab.com/x/y",  # wrong GitLab host
        "https://github.com/only-owner",  # no repo segment
        "http://github.com/o/r",  # not https
        "https://github.com/o/r/pull/42",  # a PR, not a repo
    ],
)
def test_parse_repo_url_rejects(url):
    assert parse_repo_url(url) is None


def test_match_repo_token_prefers_the_exact_repo():
    rows = [
        {
            "repo_url": "https://github.com/ucsc/other",
            "provider": "github",
            "access_token": "t-other",
        },
        {
            "repo_url": "https://github.com/ucsc/grepthink2.0",
            "provider": "github",
            "access_token": "t-exact",
        },
        {"repo_url": "https://git.ucsc.edu/a/b", "provider": "gitlab", "access_token": "t-gl"},
    ]
    parsed = {"provider": "github", "owner": "ucsc", "repo": "grepthink2.0", "number": 42}
    assert controller._match_repo_token(rows, parsed) == "t-exact"
    unknown = {"provider": "github", "owner": "ucsc", "repo": "unregistered", "number": 1}
    assert controller._match_repo_token(rows, unknown) == "t-other"  # same-provider fallback
    assert controller._match_repo_token([], parsed) is None


def test_pr_repo_prefix_matches_parse_repo_url_canonical():
    gh = {"provider": "github", "owner": "ucsc", "repo": "grepthink2.0", "number": 1}
    gl = {"provider": "gitlab", "path": "cse115a/team1/project", "iid": 1}
    assert pr_repo_prefix(gh) == parse_repo_url("https://github.com/ucsc/grepthink2.0")["repo_url"]
    assert (
        pr_repo_prefix(gl)
        == parse_repo_url("https://git.ucsc.edu/cse115a/team1/project")["repo_url"]
    )


def test_add_repo_normalizes_the_url_and_never_echoes_the_token(monkeypatch):
    db = scrum_db(monkeypatch)
    out = controller.add_repo(
        project_id=PID,
        user_id=UID,
        repo_url="https://github.com/ucsc/grepthink2.0.git",
        access_token="secret",
    )
    [stored] = db.rows("scrum_repos")
    assert (stored["provider"], stored["repo_url"]) == (
        "github",
        "https://github.com/ucsc/grepthink2.0",
    )
    assert out == {
        "id": stored["id"],
        "repo_url": "https://github.com/ucsc/grepthink2.0",
        "provider": "github",
        "has_token": True,
    }


def test_re_adding_a_repo_rotates_its_token(monkeypatch):
    db = scrum_db(monkeypatch, scrum_repos=[dict(REPO)])
    controller.add_repo(
        project_id=PID, user_id=UID, repo_url=REPO["repo_url"], access_token="rotated"
    )
    [stored] = db.rows("scrum_repos")
    assert stored["access_token"] == "rotated"


def test_add_repo_rejects_an_unknown_host(monkeypatch):
    db = scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.add_repo(
            project_id=PID, user_id=UID, repo_url="https://gitlab.com/x/y", access_token=None
        )
    assert e.value.status_code == 422
    assert db.rows("scrum_repos") == []


def test_staff_list_repos_but_see_only_has_token(monkeypatch):
    scrum_db(monkeypatch, scrum_repos=[dict(REPO)])
    out = controller.list_repos(project_id=PID, user_id=INSTR)
    assert out == [
        {"id": "r1", "repo_url": REPO["repo_url"], "provider": "github", "has_token": True}
    ]
    assert "secret" not in str(out)


def test_staff_cannot_add_or_delete_repos(monkeypatch):
    db = scrum_db(monkeypatch, scrum_repos=[dict(REPO)])
    with pytest.raises(HTTPException) as e:
        controller.add_repo(
            project_id=PID, user_id=INSTR, repo_url=REPO["repo_url"], access_token=None
        )
    assert e.value.status_code == 403
    with pytest.raises(HTTPException) as e:
        controller.delete_repo(repo_id="r1", user_id=INSTR)
    assert e.value.status_code == 403
    assert len(db.rows("scrum_repos")) == 1


def test_outsiders_cannot_list_repos(monkeypatch):
    scrum_db(monkeypatch, scrum_repos=[dict(REPO)])
    with pytest.raises(HTTPException) as e:
        controller.list_repos(project_id=PID, user_id=OUTSIDER)
    assert e.value.status_code == 403


def test_delete_repo_404_when_missing(monkeypatch):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.delete_repo(repo_id="nope", user_id=UID)
    assert (e.value.status_code, e.value.detail) == (404, controller.REPO_NOT_FOUND)
