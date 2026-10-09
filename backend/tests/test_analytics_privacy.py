"""k-anonymity folding (spec 4.1 #16)."""

from app.analytics.privacy import fold_small_groups

ROWS = [
    {"id": "a", "name": "CSE 115A", "students": 41, "teams": 8, "team_messages": 228, "href": "/x"},
    {"id": "b", "name": "CSE 115B", "students": 3, "teams": 1, "team_messages": 10, "href": "/y"},
    {"id": "c", "name": "Pilot", "students": 2, "teams": 1, "team_messages": 5, "href": "/z"},
    {"id": "d", "name": "Seminar", "students": 1, "teams": 1, "team_messages": 7, "href": "/w"},
]


def test_fold_keeps_groups_of_exactly_k_and_sums_the_rest():
    out = fold_small_groups(ROWS, size_key="students", sum_keys=("teams", "team_messages"))
    assert [r["id"] for r in out] == ["a", "b", "folded"]
    assert all(r["kind"] == "row" for r in out[:2])
    folded = out[2]
    assert folded == {
        "id": "folded",
        "name": "Smaller groups (2)",
        "kind": "folded",
        "teams": 2,
        "team_messages": 12,
        "students": 3,
    }
    assert "href" not in folded


def test_folded_row_is_last_even_when_small_groups_come_first_and_inputs_are_untouched():
    rows = [ROWS[2], ROWS[0], ROWS[3], ROWS[1]]  # small, big, small, big
    out = fold_small_groups(rows, size_key="students", sum_keys=("teams",))
    assert [r["id"] for r in out] == ["a", "b", "folded"]
    assert out[2]["teams"] == 2 and out[2]["students"] == 3
    assert "kind" not in ROWS[0] and [r["id"] for r in rows] == ["c", "a", "d", "b"]


def test_fold_is_a_no_op_without_small_groups_and_folds_everything_when_all_are_small():
    big = [dict(r, students=10) for r in ROWS]
    assert [
        r["kind"] for r in fold_small_groups(big, size_key="students", sum_keys=("teams",))
    ] == ["row"] * 4
    tiny = [dict(r, students=1) for r in ROWS]
    out = fold_small_groups(tiny, size_key="students", sum_keys=("teams",))
    assert len(out) == 1 and out[0]["name"] == "Smaller groups (4)"
    assert (
        out[0]["teams"] == 11 and out[0]["students"] == 4
    )  # sums: 8+1+1+1 teams, four students of one


def test_fold_treats_a_missing_size_as_zero():
    out = fold_small_groups([{"id": "n", "name": "No size"}], size_key="members", sum_keys=())
    assert out[0]["kind"] == "folded" and out[0]["members"] == 0
