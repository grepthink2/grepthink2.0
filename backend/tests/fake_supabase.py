"""
In-memory stand-in for the Supabase/PostgREST client used by controller tests.

It emulates the query-builder surface the controllers use — enough to run
business logic end to end without a database — and counts round trips so tests
can pin an upper bound on the number of `.execute()` calls a code path makes
(the regression guard for the N+1 fixes).

Supported:

    table(t).select(cols, count=None, head=False)
        .eq/.neq/.in_/.ilike/.is_/.lt/.lte/.gt/.gte(col, v)
        .not_.eq/.in_/.is_(col, v)
        .or_("a.eq.1,b.in.(x,y),and(c.eq.2,d.is.null)")
        .order(col, desc=False).limit(n).range(a, b)
        .single() / .maybe_single()
        .execute()
    table(t).insert(dict | list).execute()
    table(t).upsert(dict | list, on_conflict="a,b", ignore_duplicates=False).execute()
        # a NULL in a conflict column never conflicts (SQL NULLs are distinct)
    table(t).update(dict, count="exact", returning="minimal" | "representation").<filters>.execute()
    table(t).delete().<filters>.execute()
    table(t).<write>.select(cols).single() / .maybe_single()   # see "A select on a write"
    rpc(name, params).execute()          # FakeSupabase(rpc={"name": callable})

Embedded selects (`select("id, project_members(user_id, role)")`,
`select("*, classes!projects_class_id_fkey(created_by)")`, nested embeds) need
the relationship declared up front, exactly like PostgREST needs a foreign key:

    FakeSupabase(..., relations={
        ("projects", "project_members"): ("id", "project_id", True),   # one-to-many
        ("projects", "classes"): ("class_id", "id", False),           # many-to-one
        ("project_join_requests", "profiles!project_join_requests_invited_by_fkey"):
            ("invited_by", "id", False),
    })

An embed without a registered relation raises, so a refactor cannot silently
get flat rows back. Filters on embedded columns (`.eq("projects.class_id", …)`)
are not supported and raise for the same reason.

`.maybe_single().execute()` returns ``None`` when no row matches — the real
supabase-py 2.x behaviour the controllers guard against.

A select on a write (`insert(row).select("id, sender:profiles!m_sender_fkey(name)")`)
shapes the rows the write returns, as PostgREST does. It keeps the write's
``count``, answers rows even after ``returning="minimal"``, and takes no
``count`` or ``head`` of its own (a ``TypeError``, like postgrest-py). PostgREST
runs a write and its select as one statement on one snapshot, so embedded rows
show the store as it was before the write, while the written rows' own columns
are the new ones. An unregistered embed refuses the write before anything is
stored. Without a select, a write answers its full rows, and ``single()`` and
``maybe_single()`` change nothing.

Triggers stand in for what the database does on an insert:

    FakeSupabase(..., triggers={("task_moves", "insert"): fn})

``fn(db, row)`` runs once per inserted row, before the row is stored (like a
BEFORE ROW trigger), and may change the row and other tables. Only insert
triggers exist.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from typing import Any

_SELECT_SEGMENT = re.compile(
    r"^(?:(?P<alias>[A-Za-z_]\w*):)?(?P<name>[A-Za-z_]\w*)(?:!(?P<hint>\w+))?(?:\((?P<inner>.*)\))?$",
    re.S,
)


class _Result:
    def __init__(self, data, count: int | None = None):
        self.data = data
        self.count = count


def _split_top(text: str, sep: str = ",") -> list[str]:
    """Split on ``sep`` at parenthesis depth 0."""
    out: list[str] = []
    depth = 0
    cur: list[str] = []
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == sep and depth == 0:
            out.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur).strip())
    return [s for s in out if s]


def _parse_select(
    select: str,
) -> tuple[list[tuple[str, str]] | None, list[tuple[str, str, str | None, str]]]:
    """Split a select string into plain columns and embeds.

    Returns ``(columns, embeds)`` where ``columns`` is a list of
    ``(output_key, source_column)`` pairs, or ``None`` when the select contains
    ``*`` (every column); ``embeds`` are ``(alias, target, fk_hint, inner)``.
    """
    columns: list[tuple[str, str]] = []
    star = False
    embeds = []
    for seg in _split_top(select):
        # PostgREST tolerates whitespace around the embed parentheses
        # (`projects ( id, name )`); normalise before matching.
        seg = re.sub(r"\s*\(\s*", "(", seg.strip())
        seg = re.sub(r"\s*\)$", ")", seg)
        if seg == "*":
            star = True
            continue
        m = _SELECT_SEGMENT.match(seg)
        if m is None:
            star = True  # unknown syntax (e.g. casts): be lenient
            continue
        alias = m.group("alias") or m.group("name")
        if m.group("inner") is not None:
            embeds.append((alias, m.group("name"), m.group("hint"), m.group("inner")))
        else:
            columns.append((alias, m.group("name")))
    return (None if star or not columns else columns), embeds


def _parse_value(raw: str) -> Any:
    raw = raw.strip()
    if raw == "null":
        return None
    if raw.startswith("(") and raw.endswith(")"):
        return [v.strip().strip('"') for v in raw[1:-1].split(",") if v.strip()]
    return raw.strip('"')


def _parse_or(expr: str) -> list[Any]:
    """Parse a PostgREST ``or=`` expression into a nested filter tree.

    Returns a list whose items are either ``(col, op, value)`` tuples or
    ``("and", [...])`` groups.
    """
    terms: list[Any] = []
    for part in _split_top(expr):
        if part.startswith("and(") and part.endswith(")"):
            terms.append(("and", _parse_or(part[4:-1])))
            continue
        col, op, raw = part.split(".", 2)
        terms.append((col, op, _parse_value(raw)))
    return terms


def _compare(cell: Any, op: str, val: Any) -> bool:
    if op == "eq":
        return cell == val or (cell is not None and val is not None and str(cell) == str(val))
    if op == "neq":
        return not _compare(cell, "eq", val)
    if op == "in":
        return cell in val or str(cell) in {str(v) for v in val}
    if op == "not.in":
        return not _compare(cell, "in", val)
    if op == "is":
        return cell is val if val is None else cell == val
    if op == "not.is":
        return not _compare(cell, "is", val)
    if op == "ilike":
        pattern = "^" + re.escape(str(val or "")).replace("%", ".*").replace("\\%", ".*") + "$"
        return re.match(pattern, str(cell or ""), re.I) is not None
    if op in {"lt", "lte", "gt", "gte"}:
        if cell is None:
            return False
        try:
            left, right = float(cell), float(val)
        except (TypeError, ValueError):
            left, right = str(cell), str(val)
        return {"lt": left < right, "lte": left <= right, "gt": left > right, "gte": left >= right}[
            op
        ]
    raise NotImplementedError(f"FakeSupabase: operator {op!r} is not supported")


class _Not:
    def __init__(self, query: _Query):
        self._q = query

    def eq(self, col, val):
        return self._q._add(col, "neq", val)

    def in_(self, col, vals):
        return self._q._add(col, "not.in", list(vals))

    def is_(self, col, val):
        return self._q._add(col, "not.is", _parse_value(val) if isinstance(val, str) else val)


class _Query:
    def __init__(self, db: FakeSupabase, table: str):
        self._db = db
        self._table = table
        self._op = "select"
        self._select = "*"
        self._count: str | None = None
        self._head = False
        self._payload: Any = None
        self._on_conflict: list[str] | None = None
        self._ignore_duplicates = False
        self._returning = "representation"
        self._filters: list[Any] = []
        self._order: list[tuple[str, bool]] = []
        self._limit: int | None = None
        self._range: tuple[int, int] | None = None
        self._single: str | None = None  # None | "single" | "maybe"
        self._shaped = False  # a select chained on a write

    # -- builders --------------------------------------------------------
    def select(self, columns: str = "*", count: str | None = None, head: bool = False):
        if self._op != "select":
            # On a write, select() shapes the rows the write returns. postgrest-py's
            # select(*columns) there takes no count or head: a count belongs to the write.
            if count is not None or head:
                raise TypeError("select() after a write takes no count or head")
            self._select, self._returning, self._shaped = columns, "representation", True
            return self
        self._select = columns
        self._count = count
        self._head = head
        return self

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def upsert(
        self, payload, on_conflict: str | None = None, ignore_duplicates: bool = False, **_k
    ):
        self._op, self._payload = "upsert", payload
        self._on_conflict = [c.strip() for c in on_conflict.split(",")] if on_conflict else ["id"]
        self._ignore_duplicates = ignore_duplicates
        return self

    def update(self, payload, count: str | None = None, returning: str = "representation", **_k):
        self._op, self._payload = "update", payload
        self._count = count
        self._returning = returning
        return self

    def delete(self):
        self._op = "delete"
        return self

    def _add(self, col, op, val):
        if "." in col:
            raise NotImplementedError(
                f"FakeSupabase: filters on embedded columns ({col!r}) are not supported"
            )
        self._filters.append((col, op, val))
        return self

    def eq(self, col, val):
        return self._add(col, "eq", val)

    def neq(self, col, val):
        return self._add(col, "neq", val)

    def in_(self, col, vals):
        return self._add(col, "in", list(vals))

    def ilike(self, col, val):
        return self._add(col, "ilike", val)

    def is_(self, col, val):
        return self._add(col, "is", _parse_value(val) if isinstance(val, str) else val)

    def lt(self, col, val):
        return self._add(col, "lt", val)

    def lte(self, col, val):
        return self._add(col, "lte", val)

    def gt(self, col, val):
        return self._add(col, "gt", val)

    def gte(self, col, val):
        return self._add(col, "gte", val)

    @property
    def not_(self) -> _Not:
        return _Not(self)

    def or_(self, expr: str):
        self._filters.append(("or", _parse_or(expr)))
        return self

    def order(self, col: str, desc: bool = False, **_k):
        self._order.append((col, desc))
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def range(self, start: int, end: int):
        self._range = (start, end)
        return self

    def single(self):
        self._single = "single"
        return self

    def maybe_single(self):
        self._single = "maybe"
        return self

    # -- evaluation ------------------------------------------------------
    @staticmethod
    def _eval_terms(row: dict, terms: list[Any]) -> bool:
        """OR across terms; each term is (col, op, val) or ("and", [...])."""
        for term in terms:
            if term[0] == "and" and len(term) == 2 and isinstance(term[1], list):
                if all(_compare(row.get(c), o, v) for c, o, v in term[1]):
                    return True
            else:
                col, op, val = term
                if _compare(row.get(col), op, val):
                    return True
        return False

    def _match(self, row: dict) -> bool:
        for f in self._filters:
            if f[0] == "or":
                if not self._eval_terms(row, f[1]):
                    return False
            else:
                col, op, val = f
                if not _compare(row.get(col), op, val):
                    return False
        return True

    def _sorted(self, rows: list[dict]) -> list[dict]:
        for col, desc in reversed(self._order):
            values = [r.get(col) for r in rows]
            numeric = all(isinstance(v, int | float) for v in values if v is not None)

            def key(r, col=col, numeric=numeric):
                v = r.get(col)
                return (v is None, v if numeric and v is not None else str(v))

            rows = sorted(rows, key=key, reverse=desc)
        return rows

    def _relation(self, table: str, target: str, hint: str | None) -> tuple[str, str, bool]:
        """The registered ``(local_col, remote_col, many)`` of an embed; raises without one."""
        rel_key = (table, f"{target}!{hint}" if hint else target)
        if rel_key not in self._db.relations:
            raise KeyError(
                f"FakeSupabase: no relation registered for {rel_key}; pass "
                f"relations={{{rel_key!r}: (local_col, remote_col, many)}}"
            )
        return self._db.relations[rel_key]

    def _check_embeds(self, table: str, select: str) -> None:
        """Raise for an unregistered embed anywhere in ``select``, nested ones included."""
        for _alias, target, hint, inner in _parse_select(select)[1]:
            self._relation(table, target, hint)
            self._check_embeds(target, inner)

    def _embed(self, table: str, row: dict, select: str, store: dict | None = None) -> dict:
        """Project ``row`` onto the selected columns and attach embedded rows.

        Like PostgREST, only the selected columns come back (``*`` = all). Embedded
        rows, and theirs, come from ``store`` (the live store by default).
        """
        store = self._db.store if store is None else store
        columns, embeds = _parse_select(select)
        out = dict(row) if columns is None else {key: row.get(src) for key, src in columns}
        for alias, target, hint, inner in embeds:
            local_col, remote_col, many = self._relation(table, target, hint)
            matches = [
                self._embed(target, r, inner, store)
                for r in store.get(target, [])
                if _compare(r.get(remote_col), "eq", row.get(local_col))
                and row.get(local_col) is not None
            ]
            out[alias] = matches if many else (matches[0] if matches else None)
        return out

    def _answer(self, data: list[dict], count: int | None):
        """``data`` as ``.single()``, ``.maybe_single()`` or a plain list returns it."""
        if self._single == "single":
            if len(data) != 1:
                raise RuntimeError(f"single(): expected exactly one row, got {len(data)}")
            return _Result(data[0])
        if self._single == "maybe":
            if not data:
                return None
            if len(data) > 1:
                raise RuntimeError(f"maybe_single(): expected at most one row, got {len(data)}")
            return _Result(data[0])
        return _Result(data, count=count)

    def _written(self, rows: list[dict], before: dict | None, count: int | None = None):
        """The answer to a write: its rows, shaped by a chained select whose embeds read
        ``before``, the store as it was before the write."""
        if not self._shaped:
            return _Result(rows, count=count)
        return self._answer(
            [self._embed(self._table, r, self._select, before) for r in rows], count
        )

    def _record(self):
        self._db.executes += 1
        self._db.queries.append(
            {"table": self._table, "op": self._op, "filters": list(self._filters)}
        )

    def execute(self):
        self._record()
        rows = self._db.store.setdefault(self._table, [])

        if self._op == "select":
            matched = self._sorted([r for r in rows if self._match(r)])
            total = len(matched)
            if self._range is not None:
                matched = matched[self._range[0] : self._range[1] + 1]
            if self._limit is not None:
                matched = matched[: self._limit]
            data = (
                [] if self._head else [self._embed(self._table, r, self._select) for r in matched]
            )
            return self._answer(data, total if self._count else None)

        before = None
        if self._shaped:
            self._check_embeds(self._table, self._select)
            before = {name: [dict(r) for r in stored] for name, stored in self._db.store.items()}

        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            trigger = self._db.triggers.get((self._table, "insert"))
            inserted = []
            for item in items:
                row = dict(item)
                row.setdefault("id", str(uuid.uuid4()))
                if trigger is not None:
                    trigger(self._db, row)
                rows.append(row)
                inserted.append(dict(row))
            return self._written(inserted, before)

        if self._op == "upsert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            written = []
            for item in items:
                # SQL NULLs are distinct: a NULL in any conflict column matches no row, so the
                # item is inserted (Postgres' ON CONFLICT never fires on it).
                existing = next(
                    (
                        r
                        for r in rows
                        if all(
                            item.get(c) is not None
                            and r.get(c) is not None
                            and str(r.get(c)) == str(item.get(c))
                            for c in self._on_conflict
                        )
                    ),
                    None,
                )
                if existing is not None:
                    if self._ignore_duplicates:
                        continue
                    existing.update(item)
                    written.append(dict(existing))
                else:
                    row = dict(item)
                    row.setdefault("id", str(uuid.uuid4()))
                    rows.append(row)
                    written.append(dict(row))
            return self._written(written, before)

        if self._op == "update":
            updated = []
            for r in rows:
                if self._match(r):
                    r.update(self._payload)
                    updated.append(dict(r))
            # "Prefer: return=minimal" gets no rows back; "count=exact" says how many changed.
            return self._written(
                [] if self._returning == "minimal" else updated,
                before,
                count=len(updated) if self._count else None,
            )

        if self._op == "delete":
            kept, removed = [], []
            for r in rows:
                (removed if self._match(r) else kept).append(r)
            self._db.store[self._table] = kept
            return self._written([dict(r) for r in removed], before)

        raise NotImplementedError(self._op)


class _Rpc:
    def __init__(self, db: FakeSupabase, name: str, params: dict):
        self._db, self._name, self._params = db, name, params

    def execute(self):
        self._db.executes += 1
        self._db.queries.append(
            {"table": f"rpc:{self._name}", "op": "rpc", "filters": [self._params]}
        )
        fn = self._db.rpcs.get(self._name)
        if fn is None:
            raise KeyError(f"FakeSupabase: no rpc registered for {self._name!r}; pass rpc={{...}}")
        return _Result(fn(self._params))


class FakeSupabase:
    def __init__(
        self,
        relations: dict[tuple[str, str], tuple[str, str, bool]] | None = None,
        rpc: dict[str, Callable[[dict], Any]] | None = None,
        triggers: dict[tuple[str, str], Callable[[FakeSupabase, dict], None]] | None = None,
        **tables: list[dict],
    ):
        # tables: name -> list[dict]
        self.store: dict[str, list[dict]] = {k: [dict(r) for r in v] for k, v in tables.items()}
        self.relations = dict(relations or {})
        self.rpcs = dict(rpc or {})
        self.triggers = dict(triggers or {})
        unsupported = [key for key in self.triggers if key[1] != "insert"]
        if unsupported:
            raise NotImplementedError(
                f"FakeSupabase: only insert triggers exist, not {unsupported}"
            )
        self.executes = 0
        self.queries: list[dict] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def rpc(self, name: str, params: dict | None = None) -> _Rpc:
        return _Rpc(self, name, params or {})

    def rows(self, name: str) -> list[dict]:
        return self.store.setdefault(name, [])

    def reset_counter(self) -> None:
        self.executes = 0
        self.queries = []
