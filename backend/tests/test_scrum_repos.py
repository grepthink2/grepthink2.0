"""Per-project repo registry (D8 revision): URL parsing, write-only tokens, token matching."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.scrum.pr_links import parse_repo_url, pr_repo_prefix

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


@pytest.mark.parametrize("url,provider,canonical", [
    ("https://github.com/ucsc/grepthink2.0", "github", "https://github.com/ucsc/grepthink2.0"),
    ("https://github.com/ucsc/grepthink2.0.git", "github", "https://github.com/ucsc/grepthink2.0"),
    ("https://github.com/ucsc/grepthink2.0/", "github", "https://github.com/ucsc/grepthink2.0"),
    ("https://git.ucsc.edu/cse115a/team1/project", "gitlab", "https://git.ucsc.edu/cse115a/team1/project"),
])
def test_parse_repo_url_accepts(url, provider, canonical):
    parsed = parse_repo_url(url)
    assert parsed == {"provider": provider, "repo_url": canonical}


@pytest.mark.parametrize("url", [
    "https://gitlab.com/x/y",                       # wrong GitLab host
    "https://github.com/only-owner",                # no repo segment
    "http://github.com/o/r",                        # not https
    "https://github.com/o/r/pull/42",               # a PR, not a repo
])
def test_parse_repo_url_rejects(url):
    assert parse_repo_url(url) is None


def test_match_repo_token_prefers_exact_repo():
    from app.scrum.controller import _match_repo_token
    rows = [
        {"repo_url": "https://github.com/ucsc/other", "provider": "github", "access_token": "t-other"},
        {"repo_url": "https://github.com/ucsc/grepthink2.0", "provider": "github", "access_token": "t-exact"},
        {"repo_url": "https://git.ucsc.edu/a/b", "provider": "gitlab", "access_token": "t-gl"},
    ]
    parsed = {"provider": "github", "owner": "ucsc", "repo": "grepthink2.0", "number": 42}
    assert _match_repo_token(rows, parsed) == "t-exact"
    parsed_unknown = {"provider": "github", "owner": "ucsc", "repo": "unregistered", "number": 1}
    assert _match_repo_token(rows, parsed_unknown) == "t-other"   # same-provider fallback
    assert _match_repo_token([], parsed) is None


def test_pr_repo_prefix_matches_parse_repo_url_canonical():
    gh = {"provider": "github", "owner": "ucsc", "repo": "grepthink2.0", "number": 1}
    gl = {"provider": "gitlab", "path": "cse115a/team1/project", "iid": 1}
    assert pr_repo_prefix(gh) == parse_repo_url("https://github.com/ucsc/grepthink2.0")["repo_url"]
    assert pr_repo_prefix(gl) == parse_repo_url("https://git.ucsc.edu/cse115a/team1/project")["repo_url"]


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_add_repo_derives_provider_and_upserts(mock_client, _writer):
    from app.scrum.controller import add_repo
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.upsert.return_value.execute.return_value = MagicMock(
        data=[{"id": "r1", "repo_url": "https://github.com/ucsc/grepthink2.0",
               "provider": "github", "access_token": "secret"}])
    out = add_repo(project_id=PID, user_id=UID,
                   repo_url="https://github.com/ucsc/grepthink2.0.git", access_token="secret")
    upserted = client.table.return_value.upsert.call_args.args[0]
    assert upserted["provider"] == "github"
    assert upserted["repo_url"] == "https://github.com/ucsc/grepthink2.0"   # normalized
    assert client.table.return_value.upsert.call_args.kwargs["on_conflict"] == "project_id,repo_url"
    assert out == {"id": "r1", "repo_url": "https://github.com/ucsc/grepthink2.0",
                   "provider": "github", "has_token": True}   # token never echoed


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_add_repo_rejects_unknown_host(mock_client, _writer):
    from app.scrum.controller import add_repo
    mock_client.return_value = MagicMock()
    with pytest.raises(HTTPException) as e:
        add_repo(project_id=PID, user_id=UID, repo_url="https://gitlab.com/x/y", access_token=None)
    assert e.value.status_code == 422


@patch("app.scrum.controller._board_access", return_value="staff")
@patch("app.scrum.controller._client")
def test_list_repos_exposes_has_token_not_token(mock_client, _access):
    from app.scrum.controller import list_repos
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[{"id": "r1", "repo_url": "u", "provider": "github",
               "access_token": "secret", "created_at": "2026-08-21T00:00:00Z"}])
    out = list_repos(project_id=PID, user_id=UID)
    assert out == [{"id": "r1", "repo_url": "u", "provider": "github", "has_token": True}]
    assert "secret" not in str(out)
