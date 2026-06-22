"""
A tiny in-memory stand-in for the Supabase/PostgREST client, supporting only
the query-builder surface the controllers use:

    table(name).select(cols).eq(c, v).in_(c, [..]).neq(c, v).order(c).execute()
    table(name).insert(dict|list).execute()
    table(name).update(dict).eq(...).execute()
    table(name).delete().eq(...).execute()

It is deliberately small — enough to test the TA-management controllers end to
end without a real database. (The repo's `mem` fixture references a
`memory_supabase` module that does not exist; this is a self-contained
replacement scoped to these tests.)
"""
from __future__ import annotations

import uuid
from typing import Any


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store: dict, table: str):
        self._store = store
        self._table = table
        self._op = "select"
        self._payload: Any = None
        self._filters: list[tuple[str, str, Any]] = []

    # -- builders --
    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._filters.append((col, "eq", val))
        return self

    def neq(self, col, val):
        self._filters.append((col, "neq", val))
        return self

    def in_(self, col, vals):
        self._filters.append((col, "in", list(vals)))
        return self

    def ilike(self, col, val):
        self._filters.append((col, "ilike", val))
        return self

    def order(self, *_a, **_k):
        return self

    def maybe_single(self):
        self._single = True
        return self

    # -- execution --
    def _match(self, row) -> bool:
        for col, op, val in self._filters:
            cell = row.get(col)
            if op == "eq" and cell != val:
                return False
            if op == "neq" and cell == val:
                return False
            if op == "in" and cell not in val:
                return False
            if op == "ilike" and str(cell or "").lower() != str(val or "").lower():
                return False
        return True

    def execute(self):
        rows = self._store.setdefault(self._table, [])
        if self._op == "select":
            return _Result([dict(r) for r in rows if self._match(r)])
        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for item in items:
                row = dict(item)
                row.setdefault("id", str(uuid.uuid4()))
                rows.append(row)
                inserted.append(dict(row))
            return _Result(inserted)
        if self._op == "update":
            updated = []
            for r in rows:
                if self._match(r):
                    r.update(self._payload)
                    updated.append(dict(r))
            return _Result(updated)
        if self._op == "delete":
            kept, removed = [], []
            for r in rows:
                (removed if self._match(r) else kept).append(r)
            self._store[self._table] = kept
            return _Result([dict(r) for r in removed])
        return _Result([])


class FakeSupabase:
    def __init__(self, **tables):
        # tables: name -> list[dict]
        self.store: dict[str, list[dict]] = {k: [dict(r) for r in v] for k, v in tables.items()}

    def table(self, name: str) -> _Query:
        return _Query(self.store, name)

    def rows(self, name: str) -> list[dict]:
        return self.store.setdefault(name, [])
