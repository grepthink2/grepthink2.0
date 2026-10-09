"""k-anonymity for analytics breakdowns (spec 4.1 #16, decision 16).

A class row with fewer than ``K_ANONYMITY`` students, or a team row with fewer members, is never shown
on its own: the small rows are summed into one trailing ``kind: 'folded'`` row. Institution totals are
left as they are, so the fold hides how the small groups split between them, not that they exist.
"""

from __future__ import annotations

K_ANONYMITY = 3  # decision 16
FOLDED_LABEL = "Smaller groups"


def fold_small_groups(
    rows: list[dict],
    *,
    size_key: str,
    sum_keys: tuple[str, ...],
    k: int = K_ANONYMITY,
    label: str = FOLDED_LABEL,
) -> list[dict]:
    """Rows whose ``size_key`` is below ``k`` become one trailing ``kind: 'folded'`` row.

    Kept rows get ``kind: 'row'`` and keep their order. The folded row carries ``id``, ``name``
    ("Smaller groups (n)"), the summed ``sum_keys`` and the summed ``size_key``; nothing else (so never
    an ``href``). A missing size counts as 0, so the row is folded rather than shown. Inputs are copied,
    never mutated.
    """
    kept: list[dict] = []
    small: list[dict] = []
    for row in rows:
        if (row.get(size_key) or 0) < k:
            small.append(row)
        else:
            kept.append({**row, "kind": "row"})
    if not small:
        return kept
    folded: dict = {"id": "folded", "name": f"{label} ({len(small)})", "kind": "folded"}
    for key in (*sum_keys, size_key):
        folded[key] = sum((r.get(key) or 0) for r in small)
    return kept + [folded]
