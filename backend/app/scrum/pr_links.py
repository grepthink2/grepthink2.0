"""PR/MR URL parsing + state fetch (GitHub, git.ucsc.edu GitLab CE).

All fetches are best-effort with a 3 s timeout: a network failure returns None and
the caller keeps the stored state (spec D8 — the campus GitLab may be VPN-gated).
"""
from __future__ import annotations

import logging
import re
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

GITHUB_RE = re.compile(r"^https://github\.com/([\w.-]+)/([\w.-]+)/pull/(\d+)/?$")
GITLAB_RE = re.compile(r"^https://git\.ucsc\.edu/((?:[\w.-]+/)+[\w.-]+)/-/merge_requests/(\d+)/?$")
GITHUB_REPO_RE = re.compile(r"^https://github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/?$")
GITLAB_REPO_RE = re.compile(r"^https://git\.ucsc\.edu/((?:[\w.-]+/)+[\w.-]+?)(?:\.git)?/?$")
FETCH_TIMEOUT_S = 3.0


def parse_repo_url(url: str) -> dict | None:
    """Normalize a team repo URL (D8: per-project repo registry). Same two hosts
    as PR links; returns {'provider', 'repo_url'} with the canonical prefix."""
    m = GITHUB_REPO_RE.match(url or "")
    if m:
        return {"provider": "github", "repo_url": f"https://github.com/{m.group(1)}/{m.group(2)}"}
    m = GITLAB_REPO_RE.match(url or "")
    if m:
        return {"provider": "gitlab", "repo_url": f"https://git.ucsc.edu/{m.group(1)}"}
    return None


def pr_repo_prefix(parsed: dict) -> str:
    """Canonical repo prefix of a parsed PR/MR reference (matches parse_repo_url output)."""
    if parsed["provider"] == "github":
        return f"https://github.com/{parsed['owner']}/{parsed['repo']}"
    return f"https://git.ucsc.edu/{parsed['path']}"


def parse_pr_url(url: str) -> dict | None:
    m = GITHUB_RE.match(url or "")
    if m:
        return {"provider": "github", "owner": m.group(1), "repo": m.group(2), "number": int(m.group(3))}
    m = GITLAB_RE.match(url or "")
    if m:
        return {"provider": "gitlab", "path": m.group(1), "iid": int(m.group(2))}
    return None


def map_github_state(pr: dict) -> str:
    if pr.get("merged") or pr.get("merged_at"):
        return "merged"
    if pr.get("state") == "closed":
        return "closed"
    return "draft" if pr.get("draft") else "open"


def map_gitlab_state(mr: dict) -> str:
    state = mr.get("state")
    if state == "merged":
        return "merged"
    if state == "closed":
        return "closed"
    return "draft" if mr.get("draft") or mr.get("work_in_progress") else "open"


def fetch_pr_state(parsed: dict, token: str | None = None) -> str | None:
    """Return 'open'|'merged'|'closed'|'draft', or None on any failure.
    `token` (a team's per-repo credential, D8) overrides the env token."""
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT_S) as http:
            if parsed["provider"] == "github":
                headers = {"Accept": "application/vnd.github+json"}
                auth = token or settings.GITHUB_TOKEN
                if auth:
                    headers["Authorization"] = f"Bearer {auth}"
                r = http.get(f"https://api.github.com/repos/{parsed['owner']}/{parsed['repo']}/pulls/{parsed['number']}",
                             headers=headers)
                if r.status_code != 200:
                    return None
                return map_github_state(r.json())
            headers = {}
            auth = token or settings.GITLAB_UCSC_TOKEN
            if auth:
                headers["PRIVATE-TOKEN"] = auth
            r = http.get(f"https://git.ucsc.edu/api/v4/projects/{quote(parsed['path'], safe='')}/merge_requests/{parsed['iid']}",
                         headers=headers)
            if r.status_code != 200:
                return None
            return map_gitlab_state(r.json())
    except Exception:
        logger.exception("scrum: PR state fetch failed | provider=%s", parsed.get("provider"))
        return None
