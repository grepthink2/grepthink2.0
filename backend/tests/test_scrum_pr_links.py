"""PR URL parsing accept/reject table + state mapping."""
import pytest

from app.scrum.pr_links import parse_pr_url, map_github_state, map_gitlab_state


@pytest.mark.parametrize("url,provider", [
    ("https://github.com/ucsc/grepthink2.0/pull/42", "github"),
    ("https://git.ucsc.edu/cse115a/team1/project/-/merge_requests/17", "gitlab"),
])
def test_parse_accepts(url, provider):
    parsed = parse_pr_url(url)
    assert parsed is not None and parsed["provider"] == provider


@pytest.mark.parametrize("url", [
    "https://gitlab.com/x/y/-/merge_requests/1",     # wrong GitLab host
    "https://github.com/onlyowner/pull/42",           # malformed
    "http://github.com/o/r/pull/42",                  # not https
    "https://evil.example/github.com/o/r/pull/42",
])
def test_parse_rejects(url):
    assert parse_pr_url(url) is None


def test_github_state_mapping():
    assert map_github_state({"state": "open", "draft": True, "merged": False}) == "draft"
    assert map_github_state({"state": "closed", "draft": False, "merged": True}) == "merged"
    assert map_github_state({"state": "closed", "draft": False, "merged": False}) == "closed"
    assert map_github_state({"state": "open", "draft": False, "merged": False}) == "open"


def test_gitlab_state_mapping():
    assert map_gitlab_state({"state": "opened", "draft": True}) == "draft"
    assert map_gitlab_state({"state": "merged", "draft": False}) == "merged"
    assert map_gitlab_state({"state": "closed", "draft": False}) == "closed"
    assert map_gitlab_state({"state": "opened", "draft": False}) == "open"
