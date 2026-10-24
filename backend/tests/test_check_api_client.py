"""scripts/check_api_client.py: the web client and the routes agree, and the check sees drift.

The first test is the check itself, over the real app, ``frontend/src`` and the action catalog.
The rest pin what it reads from TypeScript and what it reports, on small inputs.
"""

from __future__ import annotations

import sys

import pytest

from app.main import app
from scripts import check_api_client as check


def test_the_web_client_the_routes_and_the_catalog_agree():
    result = check.check(app)

    # The scan read the real client and catalog, not an empty directory.
    assert len(result.calls) > 100 and len(result.actions) > 50
    assert result.findings == [], result.report()


# ----- What it reads ------------------------------------------------------------------------


def read(source: str) -> list[tuple[str | None, str, tuple[str, ...]]]:
    return [(c.method, c.path, c.shapes) for c in check.read_calls(source, "x.ts")]


def test_reads_the_method_from_the_request_options():
    source = """
      a: () => apiRequest<{ on: Record<string, () => void> }>(`/api/classes/${classId}/roster`),
      b: () => apiRequest('/api/classes', { method: 'POST', body: JSON.stringify({ method: 'x' }) }),
      c: () => apiUpload(`/api/classes/${classId}/roster`, form),
      d: () => apiRequest('/api/search/index', { signal }),
      e: () => apiRequest('/api/things', { ...options }),
      f: () => fetch(`${API_BASE_URL}/api/contact`, { method: 'post' }),
    """
    assert read(source) == [
        ("GET", "/api/classes/{classId}/roster", ("/api/classes/{}/roster",)),
        ("POST", "/api/classes", ("/api/classes",)),
        ("POST", "/api/classes/{classId}/roster", ("/api/classes/{}/roster",)),
        ("GET", "/api/search/index", ("/api/search/index",)),
        (None, "/api/things", ("/api/things",)),  # the spread may set it: any method
        ("POST", "/api/contact", ("/api/contact",)),
    ]


def test_leaves_out_the_query_string():
    source = """
      apiRequest(`/api/assignments?class_id=${classId}`);
      apiRequest(`/api/projects${query ? `?${query}` : ''}`);
      apiRequest(`/api/projects/${projectId}/scrum/board${query}`);
    """
    assert [shapes for _, _, shapes in read(source)] == [
        ("/api/assignments",),
        ("/api/projects", "/api/projects{}"),
        ("/api/projects/{}/scrum/board", "/api/projects/{}/scrum/board{}"),
    ]


def test_skips_what_is_not_a_backend_request():
    source = """
      // apiRequest('/api/commented-out');
      /* fetch('/api/commented-out-too') */
      const text = "apiRequest('/api/in-a-string')";
      export async function apiRequest<T = unknown>(endpoint: string): Promise<T> {
        return fetch(`${API_BASE_URL}${endpoint}`);
      }
      fetch('/logo.svg');
      refetch();
      const quoted = /['"`]/.test(text);
      <p>Don't stop</p>
      apiRequest('/api/after-the-tricky-lines');
    """
    assert read(source) == [
        ("GET", "/api/after-the-tricky-lines", ("/api/after-the-tricky-lines",))
    ]


def test_follows_helpers_and_string_unions_in_the_same_file():
    source = """
      function unsubscribeUrl(token: string): string {
        return `${API_BASE_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
      }
      const roster = (id: string) => `/api/classes/${id}/roster`;
      fetch(unsubscribeUrl(token), { method: 'POST' });
      apiRequest(roster(classId));
      list: async (parent: 'stories' | 'tasks', id: string) =>
        apiRequest(`/api/scrum/${parent}/${id}/comments`),
    """
    assert read(source) == [
        ("POST", "/api/email/unsubscribe", ("/api/email/unsubscribe",)),
        ("GET", "/api/classes/{id}/roster", ("/api/classes/{}/roster",)),
        (
            "GET",
            "/api/scrum/{parent}/{id}/comments",
            ("/api/scrum/stories/{}/comments", "/api/scrum/tasks/{}/comments"),
        ),
    ]


def test_a_request_whose_path_it_cannot_read_has_no_shape():
    source = """
      function built(id: string) { return base + id; }
      function other() { return '/api/other'; }
      apiRequest(built(classId));
      apiRequest(endpoint, { method: 'PUT' });
      apiRequest(`${prefix}/members`);
    """
    assert read(source) == [
        ("GET", "built(classId)", ()),  # its return is not a literal; other()'s is not its own
        ("PUT", "endpoint", ()),  # a variable could hold anything
        ("GET", "`${prefix}/members`", ()),  # only a base URL may come before /api/
    ]


# ----- What it reports ----------------------------------------------------------------------

ROUTES = [
    check.Route("GET", "/api/projects/{project_id}", "views.py:1"),
    check.Route("GET", "/api/projects/pending-invites", "views.py:2"),
    check.Route("POST", "/api/projects", "views.py:3"),
    check.Route("GET", "/health", "views.py:4"),
]


def call(method: str | None, path: str, where: str = "a.ts:1") -> check.Call:
    shape = path.replace("{id}", "{}")
    return check.Call("apiRequest", method, path, (shape,) if path.startswith("/") else (), where)


CALLED = [call("GET", "/api/projects/{id}"), call("GET", "/api/projects/pending-invites")]
CALLED += [call("POST", "/api/projects")]
SERVER_ONLY = {"SERVER_ONLY": {("GET", "/health"): "uptime checks"}}


def test_reports_requests_without_a_route_and_routes_without_a_caller():
    calls = [
        call("GET", "/api/projects/{id}", "a.ts:1"),
        call("PATCH", "/api/projects/{id}", "a.ts:2"),  # no route takes PATCH there
        call("POST", "/api/projects/{id}", "a.ts:3"),  # {id} is not the fixed pending-invites
        call(None, "/api/projects", "a.ts:4"),  # options built elsewhere: any method answers
        call("GET", "pathFor(id)", "a.ts:5"),
    ]

    findings = check.compare(ROUTES, calls, [], SERVER_ONLY)

    assert [(f.kind, f.where, f.message) for f in findings] == [
        ("no-caller", "views.py:2", "GET /api/projects/pending-invites"),
        ("no-route", "a.ts:2", "PATCH /api/projects/{id}"),
        ("no-route", "a.ts:3", "POST /api/projects/{id}"),
        ("unreadable", "a.ts:5", "apiRequest(pathFor(id))"),
    ]


def test_allowlists_stay_exact():
    allowlists = {
        "SERVER_ONLY": {("GET", "/health"): "uptime checks", ("GET", "/api/gone"): "removed"},
        "UNCALLED": {("GET", "/api/projects/{project_id}"): "", ("GET", "/health"): ""},
    }

    findings = check.compare(ROUTES, CALLED, [], allowlists)

    assert sorted((f.kind, f.message) for f in findings) == [
        ("stale", "SERVER_ONLY: GET /api/gone is not a route"),
        ("stale", "UNCALLED: GET /api/projects/{project_id} has a caller in frontend/src"),
        ("stale", "UNCALLED: GET /health is in SERVER_ONLY too"),
    ]


def test_reports_catalog_actions_that_name_no_route():
    actions = [
        check.Action("view", "GET", "/api/projects/{project_id}?week={week}", "catalog.json:1"),
        check.Action("renamed", "POST", "/api/projects/{project_id}/assign", "catalog.json:2"),
        check.Action("wrong_method", "DELETE", "/api/projects", "catalog.json:3"),
    ]

    findings = check.compare(ROUTES, CALLED, actions, SERVER_ONLY)

    assert [(f.kind, f.where, f.message) for f in findings] == [
        ("catalog", "catalog.json:2", "renamed: POST /api/projects/{project_id}/assign"),
        ("catalog", "catalog.json:3", "wrong_method: DELETE /api/projects"),
    ]


def test_refuses_route_parameters_that_span_segments():
    # A shape has one {} per segment; matching /files/{rest:path} needs another rule first.
    with pytest.raises(ValueError, match="spanning segments"):
        check.route_shape("/files/{rest:path}")


def test_in_github_actions_each_finding_is_an_annotation(monkeypatch, capsys):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unused")  # main() fills in only what is unset
    monkeypatch.setattr(sys, "path", list(sys.path))
    monkeypatch.setitem(check.SERVER_ONLY, ("GET", "/api/nope"), "an entry for this test")

    assert check.main() == 1
    assert (
        ",title=Stale allowlist entry::SERVER_ONLY: GET /api/nope is not a route"
        in capsys.readouterr().out
    )


def test_annotation_escapes_the_message():
    finding = check.Finding("no-route", "frontend/src/lib/api/x.ts:12", "GET /api/x?a=100%")
    assert check.annotation(finding) == (
        "::error file=frontend/src/lib/api/x.ts,line=12,title=API call without a route"
        "::GET /api/x?a=100%25"
    )
