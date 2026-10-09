"""A small in-process cache for composed dashboard payloads (spec D12).

One instance per process holds at most ``max_entries`` payloads for ``ttl_seconds`` each. Entries are
deep-copied on the way in and on the way out, so no caller ever shares a dict with the cache or with
another caller. The clock is injectable so tests can age entries without sleeping.
"""

from __future__ import annotations

import copy
import threading
import time
from collections.abc import Callable, Hashable


class PayloadCache:
    def __init__(
        self,
        ttl_seconds: float = 60.0,
        max_entries: int = 128,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl = ttl_seconds
        self._max = max_entries
        self._clock = clock
        self._lock = threading.Lock()
        self._entries: dict[Hashable, tuple[float, dict]] = {}

    def get(self, key: Hashable) -> dict | None:
        """A copy of the live entry under ``key``, or None (an expired entry is dropped on the way)."""
        with self._lock:
            hit = self._entries.get(key)
            if hit is None:
                return None
            expires_at, payload = hit
            if expires_at < self._clock():
                self._entries.pop(key, None)
                return None
            return copy.deepcopy(payload)

    def put(self, key: Hashable, payload: dict) -> None:
        """Store a copy of ``payload``; when the cache is full, the entry that expires soonest makes room."""
        with self._lock:
            if key not in self._entries and len(self._entries) >= self._max:
                soonest = min(self._entries, key=lambda k: self._entries[k][0])
                self._entries.pop(soonest, None)
            self._entries[key] = (self._clock() + self._ttl, copy.deepcopy(payload))

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)
