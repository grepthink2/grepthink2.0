"""Check that the web client and the backend routes agree.

The web client calls the backend by paths written out by hand (mostly in
``frontend/src/lib/api/<domain>.ts``), and nothing generates them from the routes, so the two
drift: a route is renamed and the button behind it starts answering 404, or a client method
outlives the route it called. This check reads both sides and reports

- a request in ``frontend/src`` (``apiRequest``, ``apiUpload``, or ``fetch`` of an ``/api/``
  path) that no route answers with that method;
- a route that nothing in ``frontend/src`` calls, unless ``SERVER_ONLY`` (called by something
  else, with the reason) or ``UNCALLED`` (the routes that had no caller when this check was
  added) names it;
- an action in ``frontend/public/.well-known/grepthink-actions.json`` that names no route;
- an entry of either list that is not a route any more, or that the client now calls.

Paths are compared by shape: ``${classId}`` in the client and ``{class_id}`` in a route are
both a parameter, and the query string is ignored. A parameter never stands in for a fixed
segment (``/api/projects/${id}`` does not match ``/api/projects/pending-invites``), except a
parameter typed as a union of strings (``parent: 'stories' | 'tasks'``), which is read as
each of them. Tests (``__tests__/``, ``*.test.ts(x)``, ``src/test/``) are not the client.

Run it from ``backend/``::

    .venv/bin/python scripts/check_api_client.py

``tests/test_check_api_client.py`` runs the same check with the rest of the suite. In GitHub
Actions each finding is also printed as an annotation on the file and line it is about.
"""

from __future__ import annotations

import inspect
import itertools
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
FRONTEND_SRC = REPO / "frontend" / "src"
ACTIONS_CATALOG = REPO / "frontend" / "public" / ".well-known" / "grepthink-actions.json"

# Routes that something other than the web client calls, each with the reason. The check fails
# when an entry is no longer a route or the client starts calling it, so the list stays exact.
SERVER_ONLY: dict[tuple[str, str], str] = {
    ("GET", "/health"): "liveness probe for uptime checks and deploy smoke tests",
    ("POST", "/api/email/dispatch"): "pg_cron runs the email outbox (Bearer EMAIL_DISPATCH_SECRET)",
    ("POST", "/api/email/webhooks/maileroo"): "Maileroo posts delivery and bounce events",
}

# Routes that nothing in frontend/src has ever called, found when this check was added
# (2026-10-16). Each needs a decision: a client method for a screen that uses it, or removing
# the route. Delete the entry when either lands, and never add one: a new route gets its client
# method in the same change, or a SERVER_ONLY reason.
UNCALLED: dict[tuple[str, str], str] = {
    ("GET", "/api/assignments/{assignment_id}/tsrs/about/{evaluatee_id}"): (
        "the TSR responses about one student, for the instructor"
    ),
    ("GET", "/api/profiles/{user_id}"): "another class member's profile",
    ("POST", "/api/staffing/interest"): (
        "one ranked preference; the interest form saves the whole form through"
        " POST /api/staffing/{class_id}/submission"
    ),
    ("GET", "/api/staffing/{class_id}/pref-by-project"): "projects with their interested students",
    ("GET", "/api/staffing/{class_id}/pref-by-student"): "students with their preferences",
    ("GET", "/api/staffing/{class_id}/project-availability"): (
        "each student's interest and availability per project"
    ),
    ("GET", "/api/stats/usercount"): "the public count of accounts, meant for the landing page",
    ("GET", "/api/tas/projects/{project_id}/review-tas"): (
        "a team's end-of-quarter reviewers; the Final Reviews page uses only the POST and DELETE"
        " beside it"
    ),
    ("GET", "/api/tsrs/{project_id}/received"): "the TSRs a member received in a project",
    ("GET", "/api/tsrs/{project_id}/submitted"): "the TSRs a member submitted in a project",
}

HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")

# Each kind of finding: its annotation title, and the heading over it in the report.
KINDS = {
    "no-route": (
        "API call without a route",
        "Requests in frontend/src that no route answers. Fix the path or the method, or drop"
        " the call if its route is gone:",
    ),
    "unreadable": (
        "API call the check cannot read",
        "Requests whose path this check cannot read. Write the path as a string or template"
        " literal in the call, or return one from a helper function in the same file:",
    ),
    "no-caller": (
        "API route without a caller",
        "Routes that nothing in frontend/src calls. Add the client method to"
        " frontend/src/lib/api/<domain>.ts, or, when only a server or another service calls"
        " the route, add it to SERVER_ONLY in backend/scripts/check_api_client.py with the"
        " reason:",
    ),
    "catalog": (
        "Catalog action without a route",
        "Actions in frontend/public/.well-known/grepthink-actions.json that name no route:",
    ),
    "stale": (
        "Stale allowlist entry",
        "Entries to remove from SERVER_ONLY or UNCALLED in backend/scripts/check_api_client.py:",
    ),
}


@dataclass(frozen=True)
class Route:
    """A registered route, one per method."""

    method: str
    path: str  # as registered: /api/classes/{class_id}/roster
    where: str  # repo-relative file:line of the endpoint function

    @property
    def shape(self) -> str:
        return route_shape(self.path)


@dataclass(frozen=True)
class Call:
    """A request in the web client. ``shapes`` is empty when its path could not be read."""

    callee: str  # apiRequest, apiUpload or fetch
    method: str | None  # None when the request options could not be read: any method matches
    path: str  # as written, a parameter as {expression}, without the query string
    shapes: tuple[str, ...]
    where: str  # repo-relative file:line


@dataclass(frozen=True)
class Action:
    """An action in the agent-facing catalog."""

    id: str
    method: str
    endpoint: str
    where: str


@dataclass(frozen=True)
class Finding:
    kind: str  # a key of KINDS
    where: str
    message: str

    def order(self) -> tuple[str, str, int, str]:
        """Sort key: by kind, then file, then line as a number."""
        file, _, line = self.where.rpartition(":")
        if not line.isdigit():
            file, line = self.where, "0"
        return (self.kind, file, int(line), self.message)


@dataclass
class Result:
    routes: list[Route]
    calls: list[Call]
    actions: list[Action]
    findings: list[Finding]

    def report(self) -> str:
        if not self.findings:
            return (
                f"API client check: {len(self.calls)} client requests, {len(self.routes)} routes"
                f" and {len(self.actions)} catalog actions agree."
            )
        lines = [f"API client check: {len(self.findings)} finding(s)."]
        for kind, (_, heading) in KINDS.items():
            group = [f for f in self.findings if f.kind == kind]
            if group:
                lines += ["", heading]
                lines += [f"  {f.where}  {f.message}" for f in group]
        return "\n".join(lines)


# ----- Routes -------------------------------------------------------------------------------


def route_shape(path: str) -> str:
    """A route path with each parameter written as ``{}``."""
    if ":path}" in path:
        # A {name:path} parameter spans several segments, which shapes cannot express.
        raise ValueError(f"{path}: path parameters spanning segments are not supported")
    return re.sub(r"\{[^}]*\}", "{}", path)


def routes_of(app) -> list[Route]:
    """Every route the app answers, one per method, with where its endpoint is defined."""
    from fastapi.routing import APIRoute, iter_route_contexts

    routes = []
    for context in iter_route_contexts(app.routes):
        if not isinstance(context.original_route, APIRoute):
            continue  # FastAPI's own pages: /docs, /redoc, /openapi.json
        where = _source_of(context.endpoint)
        methods = sorted(set(context.methods or ()) & set(HTTP_METHODS))
        routes += [Route(method, context.path, where) for method in methods]

    # If a FastAPI upgrade changes how routes are stored, fail here rather than check nothing.
    documented = {
        (method.upper(), path)
        for path, item in app.openapi()["paths"].items()
        for method in item
        if method.upper() in HTTP_METHODS
    }
    if not routes or {(r.method, r.path) for r in routes} != documented:
        raise RuntimeError("the routes listed for the check differ from the OpenAPI schema")
    return routes


def _source_of(function) -> str:
    function = inspect.unwrap(function)
    try:
        path = Path(inspect.getsourcefile(function) or "").resolve()
        line = inspect.getsourcelines(function)[1]
        return f"{path.relative_to(REPO).as_posix()}:{line}"
    except (OSError, TypeError, ValueError):
        return f"{function.__module__}.{function.__qualname__}"


# ----- Reading TypeScript -------------------------------------------------------------------
#
# Enough of a lexer to find calls and read their arguments: strings, template literals (with
# nested `${...}`), comments, regular expressions and brackets. It is not a parser; anything it
# cannot follow is reported as unreadable rather than guessed.


class _Unreadable(ValueError):
    """The source is not shaped the way the reader expects (an unterminated string, say)."""


@dataclass(frozen=True)
class _Slot:
    """A ``${...}`` slot of a template literal: its expression."""

    code: str


_QUOTES = "'\""
_CLOSERS = {"(": ")", "[": "]", "{": "}"}
_IDENTIFIER = re.compile(r"[A-Za-z_$][\w$]*")
_CALL = re.compile(r"(?<![\w$])(apiRequest|apiUpload|fetch)\s*(?=[<(])")
# Before a `/`, these mean a regular expression starts there rather than a division.
_REGEX_AFTER = set("(,=:[!&|?{};+-*%<>~^")
_REGEX_AFTER_WORDS = {"return", "typeof", "case", "do", "else", "in", "of", "void", "yield"}


def _skip_string(src: str, i: int) -> int:
    """Index past the quoted string at ``src[i]``. A string never spans a line."""
    quote = src[i]
    i += 1
    while i < len(src):
        if src[i] == "\\":
            i += 2
        elif src[i] == quote:
            return i + 1
        elif src[i] == "\n":
            break
        else:
            i += 1
    raise _Unreadable("unterminated string")


def _read_template(src: str, i: int) -> tuple[list[str | _Slot], int]:
    """The parts of the template literal at ``src[i]`` and the index past it.

    The parts alternate text and slots, and start and end with text (maybe empty).
    """
    parts: list[str | _Slot] = []
    text: list[str] = []
    i += 1
    while i < len(src):
        if src[i] == "\\":
            text.append(src[i : i + 2])
            i += 2
        elif src[i] == "`":
            parts.append("".join(text))
            return parts, i + 1
        elif src.startswith("${", i):
            parts.append("".join(text))
            text = []
            end = _skip_code(src, i + 2, "}")
            parts.append(_Slot(src[i + 2 : end].strip()))
            i = end + 1
        else:
            text.append(src[i])
            i += 1
    raise _Unreadable("unterminated template literal")


def _skip_code(src: str, i: int, stops: str) -> int:
    """Index of the first character in ``stops`` outside any bracket, string or comment."""
    expected: list[str] = []
    while i < len(src):
        c = src[i]
        if c in _QUOTES:
            i = _skip_string(src, i)
            continue
        if c == "`":
            i = _read_template(src, i)[1]
            continue
        if src.startswith("//", i):
            end = src.find("\n", i)
            i = len(src) if end < 0 else end
            continue
        if src.startswith("/*", i):
            end = src.find("*/", i + 2)
            i = len(src) if end < 0 else end + 2
            continue
        if not expected and c in stops:
            return i
        if c in _CLOSERS:
            expected.append(_CLOSERS[c])
        elif expected and c == expected[-1]:
            expected.pop()
        elif c in ")]}":
            raise _Unreadable(f"unbalanced {c!r}")
        i += 1
    raise _Unreadable(f"no closing {stops!r}")


def _regex_end(src: str, i: int) -> int | None:
    """Index past the regular expression at ``src[i]``, or None when it is not one."""
    j = i - 1
    while j >= 0 and src[j].isspace():
        j -= 1
    word = re.search(r"[\w$]+$", src[max(0, j - 9) : j + 1])
    if j >= 0 and src[j] not in _REGEX_AFTER and not (word and word[0] in _REGEX_AFTER_WORDS):
        return None  # a division
    j, in_class = i + 1, False
    while j < len(src) and src[j] != "\n":
        c = src[j]
        if c == "\\":
            j += 2
            continue
        if c == "[":
            in_class = True
        elif c == "]":
            in_class = False
        elif c == "/" and not in_class:
            j += 1
            while j < len(src) and src[j].isalpha():
                j += 1  # flags
            return j
        j += 1
    return None


def _code_only(src: str) -> str:
    """``src`` with comments, strings and regular expressions blanked out, offsets unchanged.

    What is left is code, so searching it for a function name finds calls, not prose.
    """
    out = list(src)
    i = 0
    while i < len(src):
        c = src[i]
        end: int | None
        if src.startswith("//", i):
            end = src.find("\n", i)
            end = len(src) if end < 0 else end
        elif src.startswith("/*", i):
            end = src.find("*/", i + 2)
            end = len(src) if end < 0 else end + 2
        elif c in _QUOTES or c == "`":
            try:
                end = _skip_string(src, i) if c in _QUOTES else _read_template(src, i)[1]
            except _Unreadable:
                end = None  # an apostrophe in JSX text, not a string
        elif c == "/":
            end = _regex_end(src, i)
        else:
            end = None
        if end is None:
            i += 1
            continue
        for k in range(i, end):
            if out[k] != "\n":
                out[k] = " "
        i = end
    return "".join(out)


def _skip_type_arguments(src: str, i: int) -> int:
    """Index past the ``<...>`` type arguments at ``src[i]``."""
    depth = 0
    while i < len(src):
        c = src[i]
        if c in _QUOTES:
            i = _skip_string(src, i)
            continue
        if c == "`":
            i = _read_template(src, i)[1]
            continue
        if c in _CLOSERS:
            i = _skip_code(src, i + 1, _CLOSERS[c]) + 1
            continue
        if src.startswith("=>", i):
            i += 2
            continue
        if c == "<":
            depth += 1
        elif c == ">":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise _Unreadable("unterminated type arguments")


def _arguments(src: str, i: int) -> list[str]:
    """The source of each argument of the call whose ``(`` is at ``src[i]``."""
    args = []
    start = i + 1
    while True:
        end = _skip_code(src, start, ",)")
        args.append(src[start:end].strip())
        if src[end] == ")":
            return [arg for arg in args if arg]  # a trailing comma leaves an empty one
        start = end + 1


def _literal(code: str) -> list[str | _Slot] | None:
    """The parts of ``code`` when it is exactly one string or template literal."""
    code = code.strip()
    if code[:1] in _QUOTES:
        end = _skip_string(code, 0)
        return [code[1 : end - 1]] if end == len(code) else None
    if code[:1] == "`":
        parts, end = _read_template(code, 0)
        return parts if end == len(code) else None
    return None


def _literal_at(src: str, i: int) -> list[str | _Slot] | None:
    """The parts of the string or template literal starting at ``src[i]``, if one does."""
    if src[i : i + 1] in _QUOTES:
        return [src[i + 1 : _skip_string(src, i) - 1]]
    if src[i : i + 1] == "`":
        return _read_template(src, i)[0]
    return None


def _endpoint(arg: str, src: str) -> list[str | _Slot] | None:
    """The first argument of a request, when it is a literal or a call to a helper of ``src``.

    A helper counts when the first thing it returns is a literal, as ``unsubscribeUrl`` in
    lib/api/email.ts does. Anything else is left unread rather than guessed.
    """
    parts = _literal(arg)
    if parts is not None:
        return parts
    helper = re.fullmatch(r"([A-Za-z_$][\w$]*)\s*\(.*\)", arg, re.S)
    if not helper:
        return None
    name = re.escape(helper[1])
    definition = re.search(rf"\bfunction\s+{name}\s*\(|\b(?:const|let)\s+{name}\s*=", src)
    returned = definition and re.compile(r"\breturn\b\s*|=>\s*").search(src, definition.end())
    return _literal_at(src, returned.end()) if returned else None


def _method(callee: str, options: str | None) -> str | None:
    """The request's method; None when the options leave it open."""
    if callee == "apiUpload":
        return "POST"  # lib/api/client.ts: always a multipart POST
    if options is None:
        return "GET"
    if not options.startswith("{") or _skip_code(options, 1, "}") != len(options) - 1:
        return None  # options built elsewhere
    entries = []  # the object's own entries, nested brackets emptied
    i, inner = 0, options[1:-1]
    while i < len(inner):
        c = inner[i]
        if c in _QUOTES or c == "`":
            end = _skip_string(inner, i) if c in _QUOTES else _read_template(inner, i)[1]
            entries.append(inner[i:end])
        elif c in _CLOSERS:
            end = _skip_code(inner, i + 1, _CLOSERS[c]) + 1
            entries.append(c + _CLOSERS[c])
        else:
            end = i + 1
            entries.append(c)
        i = end
    own = "".join(entries)
    method = re.search(r"""(?<![\w$])method\s*:\s*(['"`])([A-Za-z]+)\1""", own)
    if method:
        return method[2].upper()
    if "..." in own or re.search(r"(?<![\w$])method(?![\w$])", own):
        return None  # a spread or a variable may carry the method
    return "GET"


def _union_values(name: str, src: str, before: int) -> list[str] | None:
    """The strings of ``name``'s type when it is declared above as a union of string literals."""
    string = r"""(?:'[^'\n]*'|"[^"\n]*")"""
    declared = re.compile(
        rf"(?<![\w$.]){re.escape(name)}\s*\??\s*:\s*({string}(?:\s*\|\s*{string})+)"
    )
    found = list(declared.finditer(src, 0, before))  # the nearest declaration above wins
    return [value[1:-1] for value in re.findall(string, found[-1][1])] if found else None


def _path(parts: list[str | _Slot], src: str, at: int) -> tuple[str, tuple[str, ...]] | None:
    """The path as written (without base URL or query) and its shapes; None if not a path."""
    if len(parts) >= 3 and parts[0] == "" and str(parts[2]).startswith("/api/"):
        parts = parts[2:]  # `${API_BASE_URL}/api/...`
    if not str(parts[0]).startswith("/"):
        return None
    for k, part in enumerate(parts):
        if isinstance(part, str) and "?" in part:
            parts = [*parts[:k], part.split("?", 1)[0]]
            break

    def shapes(parts: list[str | _Slot]) -> set[str]:
        choices = []
        for part in parts:
            if isinstance(part, str):
                choices.append([part])
            elif _IDENTIFIER.fullmatch(part.code):
                choices.append(_union_values(part.code, src, at) or ["{}"])
            else:
                choices.append(["{}"])
        found = {"".join(choice) for choice in itertools.product(*choices)}
        # A slot glued to the end of the last segment (`/board${query}`) is a query string
        # that may be empty, so the path without it counts too.
        if len(parts) >= 3 and parts[-1] == "" and not str(parts[-3]).endswith("/"):
            found |= shapes(parts[:-2])
        return found

    written = "".join(
        part if isinstance(part, str) else f"{{{part.code if len(part.code) <= 30 else '…'}}}"
        for part in parts
    )
    return written, tuple(sorted(shapes(parts)))


def read_calls(src: str, where: str) -> list[Call]:
    """The backend requests in one TypeScript source file; ``where`` names the file."""
    code = _code_only(src)
    calls = []
    for match in _CALL.finditer(code):
        callee = match[1]
        if re.search(r"\bfunction\s*\*?\s*$", code[max(0, match.start() - 30) : match.start()]):
            continue  # the definition of apiRequest itself
        line = src.count("\n", 0, match.start()) + 1
        location = f"{where}:{line}"
        i = match.end()
        try:
            if src[i] == "<":
                i = _skip_type_arguments(src, i)
                while src[i].isspace():
                    i += 1
            if src[i] != "(":
                continue
            args = _arguments(src, i)
            parts = _endpoint(args[0], src) if args else None
            path = _path(parts, src, match.start()) if parts else None
            method = _method(callee, args[1] if len(args) > 1 else None)
        except _Unreadable as error:
            calls.append(Call(callee, None, f"({error})", (), location))
            continue
        if path is None or (callee == "fetch" and not path[0].startswith("/api/")):
            if callee != "fetch":  # fetch also loads things that are not the backend
                written = " ".join(args[0].split()) if args else ""
                written = written if len(written) <= 60 else f"{written[:59]}…"
                calls.append(Call(callee, method, written, (), location))
            continue
        calls.append(Call(callee, method, path[0], path[1], location))
    return calls


def _is_app_source(path: Path) -> bool:
    """A source file of the app, not a test (mirrors coverage.exclude in vite.config.ts)."""
    relative = path.relative_to(FRONTEND_SRC)
    return not (
        relative.name.endswith(".d.ts")
        or ".test." in relative.name
        or "__tests__" in relative.parts
        or relative.parts[0] == "test"
    )


def client_calls() -> list[Call]:
    """Every backend request in frontend/src."""
    calls = []
    for path in sorted(FRONTEND_SRC.rglob("*.ts*")):
        if path.suffix in (".ts", ".tsx") and _is_app_source(path):
            where = path.relative_to(REPO).as_posix()
            calls += read_calls(path.read_text(encoding="utf-8"), where)
    return calls


# ----- The catalog --------------------------------------------------------------------------


def catalog_actions(path: Path = ACTIONS_CATALOG) -> list[Action]:
    text = path.read_text(encoding="utf-8")
    where = path.relative_to(REPO).as_posix()
    actions = []
    for action in json.loads(text)["actions"]:
        found = re.search(rf'"id"\s*:\s*"{re.escape(action["id"])}"', text)
        line = text.count("\n", 0, found.start()) + 1 if found else 1
        actions.append(
            Action(action["id"], action["method"].upper(), action["endpoint"], f"{where}:{line}")
        )
    return actions


# ----- The comparison -----------------------------------------------------------------------


def compare(
    routes: list[Route],
    calls: list[Call],
    actions: list[Action],
    allowlists: dict[str, dict[tuple[str, str], str]],
) -> list[Finding]:
    """The findings, given each allowlist by name (SERVER_ONLY, UNCALLED)."""
    findings = []
    by_shape: dict[str, list[Route]] = {}
    for route in routes:
        by_shape.setdefault(route.shape, []).append(route)

    called: set[Route] = set()
    for call in calls:
        if not call.shapes:
            findings.append(Finding("unreadable", call.where, f"{call.callee}({call.path})"))
            continue
        answered = [
            route
            for shape in call.shapes
            for route in by_shape.get(shape, [])
            if call.method in (None, route.method)
        ]
        if answered:
            called.update(answered)
        else:
            findings.append(Finding("no-route", call.where, f"{call.method} {call.path}"))

    registered = {(route.method, route.path): route for route in routes}
    listed: dict[tuple[str, str], str] = {}  # route -> the allowlist that names it
    for name, entries in allowlists.items():
        for key in entries:
            method, path = key
            if key in listed:
                message = f"{name}: {method} {path} is in {listed[key]} too"
            elif key not in registered:
                message = f"{name}: {method} {path} is not a route"
            elif registered[key] in called:
                message = f"{name}: {method} {path} has a caller in frontend/src"
            else:
                listed[key] = name
                continue
            findings.append(Finding("stale", _entry_where(method, path), message))

    for key, route in registered.items():
        if route not in called and key not in listed:
            findings.append(Finding("no-caller", route.where, f"{route.method} {route.path}"))

    for action in actions:
        shape = route_shape(action.endpoint.split("?", 1)[0])
        if not any(route.method == action.method for route in by_shape.get(shape, [])):
            message = f"{action.id}: {action.method} {action.endpoint}"
            findings.append(Finding("catalog", action.where, message))
    return sorted(findings, key=Finding.order)


def _entry_where(method: str, path: str) -> str:
    """file:line of an allowlist entry in this script."""
    source = Path(__file__).read_text(encoding="utf-8")
    found = re.search(rf'\("{method}",\s*"{re.escape(path)}"\)', source)
    line = source.count("\n", 0, found.start()) + 1 if found else 1
    return f"{Path(__file__).resolve().relative_to(REPO).as_posix()}:{line}"


def check(app) -> Result:
    routes, calls, actions = routes_of(app), client_calls(), catalog_actions()
    allowlists = {"SERVER_ONLY": SERVER_ONLY, "UNCALLED": UNCALLED}
    return Result(routes, calls, actions, compare(routes, calls, actions, allowlists))


def annotation(finding: Finding) -> str:
    """The finding as a GitHub Actions error annotation on its file and line."""
    file, colon, line = finding.where.rpartition(":")
    on = f"file={file},line={line}," if colon and line.isdigit() else ""
    message = finding.message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    return f"::error {on}title={KINDS[finding.kind][0]}::{message}"


def main() -> int:
    # Import the app without a database or a Sentry project, as tests/conftest.py does.
    os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
    os.environ.setdefault("SUPABASE_KEY", "test-anon-key")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
    os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")
    os.environ["SENTRY_DSN"] = ""
    sys.path.insert(0, str(BACKEND))
    from app.main import app

    result = check(app)
    print(result.report())
    if os.environ.get("GITHUB_ACTIONS") == "true":
        for finding in result.findings:
            print(annotation(finding))
    return 1 if result.findings else 0


if __name__ == "__main__":
    sys.exit(main())
