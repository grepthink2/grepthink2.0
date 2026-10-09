"""The dashboard payload cache: copies, expiry, the entry cap (spec D12)."""

from app.analytics.cache import PayloadCache


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_get_and_put_hand_out_copies_never_the_stored_dict():
    cache = PayloadCache(ttl_seconds=60, max_entries=2, clock=Clock())
    payload = {"overview": {"teams": 10}}
    cache.put("k", payload)
    payload["overview"]["teams"] = -1  # the caller's dict, after the put
    first = cache.get("k")
    assert first == {"overview": {"teams": 10}}
    first["overview"]["teams"] = -2  # a hit's dict
    assert cache.get("k") == {"overview": {"teams": 10}}
    assert cache.get("missing") is None


def test_an_entry_expires_after_the_ttl():
    clock = Clock()
    cache = PayloadCache(ttl_seconds=60, max_entries=2, clock=clock)
    cache.put("k", {"n": 1})
    clock.now += 59
    assert cache.get("k") == {"n": 1}
    clock.now += 2
    assert cache.get("k") is None and len(cache) == 0


def test_a_full_cache_drops_the_entry_that_expires_soonest_and_a_re_put_drops_nothing():
    clock = Clock()
    cache = PayloadCache(ttl_seconds=60, max_entries=2, clock=clock)
    cache.put("a", {"n": 1})
    clock.now += 10
    cache.put("b", {"n": 2})
    cache.put("b", {"n": 3})  # the same key is replaced in place; nothing is evicted
    assert len(cache) == 2 and cache.get("a") == {"n": 1} and cache.get("b") == {"n": 3}
    cache.put("c", {"n": 4})  # full: "a" expires first and goes
    assert cache.get("a") is None and cache.get("b") == {"n": 3} and cache.get("c") == {"n": 4}


def test_clear_empties_the_cache():
    cache = PayloadCache(clock=Clock())
    cache.put("k", {"n": 1})
    cache.clear()
    assert cache.get("k") is None and len(cache) == 0
