"""Behavioural tests for the in-memory Supabase double itself."""

from __future__ import annotations

import pytest

from tests.fake_supabase import FakeSupabase


def _db() -> FakeSupabase:
    return FakeSupabase(
        projects=[
            {"id": "p1", "class_id": "c1", "name": "Alpha", "num_members": 2},
            {"id": "p2", "class_id": "c1", "name": "Beta", "num_members": 0},
            {"id": "p3", "class_id": "c2", "name": "Gamma", "num_members": 5},
        ],
        project_members=[
            {"id": "m1", "project_id": "p1", "user_id": "u1", "role": "member"},
            {"id": "m2", "project_id": "p1", "user_id": "u2", "role": "product owner"},
        ],
        classes=[{"id": "c1", "created_by": "instr"}, {"id": "c2", "created_by": "instr2"}],
        profiles=[{"id": "u1", "email": "a@ucsc.edu"}, {"id": "u2", "email": "b@ucsc.edu"}],
        relations={
            ("projects", "project_members"): ("id", "project_id", True),
            ("projects", "classes"): ("class_id", "id", False),
            ("project_members", "profiles"): ("user_id", "id", False),
        },
        rpc={"count_members": lambda p: [{"n": p["expected"]}]},
    )


def test_order_limit_and_range():
    db = _db()
    names = [
        r["name"]
        for r in db.table("projects").select("*").order("num_members", desc=True).execute().data
    ]
    assert names == ["Gamma", "Alpha", "Beta"]
    assert len(db.table("projects").select("*").limit(2).execute().data) == 2
    assert [
        r["id"] for r in db.table("projects").select("*").order("id").range(1, 2).execute().data
    ] == ["p2", "p3"]


def test_count_exact():
    res = db = _db().table("projects").select("id", count="exact").eq("class_id", "c1").execute()
    assert res.count == 2 and len(db.data) == 2


def test_single_and_maybe_single():
    db = _db()
    assert (
        db.table("projects").select("*").eq("id", "p1").single().execute().data["name"] == "Alpha"
    )
    assert db.table("projects").select("*").eq("id", "nope").maybe_single().execute() is None
    with pytest.raises(RuntimeError):
        db.table("projects").select("*").eq("id", "nope").single().execute()


def test_or_and_not_filters():
    db = _db()
    ids = {
        r["id"]
        for r in db.table("projects").select("*").or_("id.eq.p1,num_members.in.(5)").execute().data
    }
    assert ids == {"p1", "p3"}
    ids = {
        r["id"]
        for r in db.table("projects")
        .select("*")
        .or_("and(class_id.eq.c1,num_members.eq.0)")
        .execute()
        .data
    }
    assert ids == {"p2"}
    db.rows("projects")[0]["assigned_ta_id"] = "ta"
    assert [
        r["id"]
        for r in db.table("projects").select("*").is_("assigned_ta_id", "null").execute().data
    ] == ["p2", "p3"]
    assert [
        r["id"]
        for r in db.table("projects").select("*").not_.is_("assigned_ta_id", "null").execute().data
    ] == ["p1"]
    assert [
        r["id"]
        for r in db.table("projects").select("*").not_.in_("id", ["p1", "p2"]).execute().data
    ] == ["p3"]


def test_comparison_filters():
    db = _db()
    assert [
        r["id"]
        for r in db.table("projects").select("*").gte("num_members", 2).order("id").execute().data
    ] == ["p1", "p3"]
    assert [
        r["id"] for r in db.table("projects").select("*").lt("num_members", 2).execute().data
    ] == ["p2"]


def test_upsert_updates_on_conflict_and_inserts_otherwise():
    db = _db()
    res = (
        db.table("project_members")
        .upsert(
            [
                {"project_id": "p1", "user_id": "u1", "role": "scrum master"},
                {"project_id": "p2", "user_id": "u9", "role": "member"},
            ],
            on_conflict="project_id,user_id",
        )
        .execute()
    )
    assert len(res.data) == 2
    rows = db.rows("project_members")
    assert len(rows) == 3
    assert next(r for r in rows if r["user_id"] == "u1")["role"] == "scrum master"
    assert next(r for r in rows if r["user_id"] == "u1")["id"] == "m1"  # updated in place


def test_upsert_ignore_duplicates():
    db = _db()
    res = (
        db.table("project_members")
        .upsert(
            {"project_id": "p1", "user_id": "u1", "role": "admin"},
            on_conflict="project_id,user_id",
            ignore_duplicates=True,
        )
        .execute()
    )
    assert res.data == []
    assert next(r for r in db.rows("project_members") if r["user_id"] == "u1")["role"] == "member"


@pytest.mark.parametrize("ignore_duplicates", [True, False])
def test_upsert_never_matches_a_null_conflict_key_like_postgres(ignore_duplicates):
    # SQL NULLs are distinct: a row with NULL in an on_conflict column conflicts with nothing
    # (not a stored NULL, not another row of the same request), so it is always inserted.
    db = FakeSupabase(outbox=[{"id": "o1", "dedupe_key": None}])
    res = (
        db.table("outbox")
        .upsert(
            [{"id": "o2", "dedupe_key": None}, {"id": "o3", "dedupe_key": None}],
            on_conflict="dedupe_key",
            ignore_duplicates=ignore_duplicates,
        )
        .execute()
    )
    assert [r["id"] for r in res.data] == ["o2", "o3"]
    assert [r["id"] for r in db.rows("outbox")] == ["o1", "o2", "o3"]


def test_upsert_with_a_null_in_a_composite_key_inserts_while_a_set_key_conflicts():
    db = FakeSupabase(
        prefs=[
            {"user_id": "u1", "category": "digests", "enabled": True},
            {"user_id": "u1", "category": None, "enabled": True},
        ]
    )
    db.table("prefs").upsert(
        [
            {"user_id": "u1", "category": None, "enabled": False},  # NULL in the key: a new row
            {"user_id": "u1", "category": "digests", "enabled": False},  # updated in place
        ],
        on_conflict="user_id,category",
    ).execute()
    assert [(r["category"], r["enabled"]) for r in db.rows("prefs")] == [
        ("digests", False),
        (None, True),
        (None, False),
    ]


def test_upsert_does_not_match_a_stored_null_with_the_text_none():
    db = FakeSupabase(outbox=[{"id": "o1", "dedupe_key": None}])
    res = (
        db.table("outbox")
        .upsert(
            {"id": "o2", "dedupe_key": "None"}, on_conflict="dedupe_key", ignore_duplicates=True
        )
        .execute()
    )
    assert [r["id"] for r in res.data] == ["o2"]


@pytest.mark.parametrize("returning", ["minimal", "representation"])
def test_update_with_count_exact_answers_how_many_rows_it_changed(returning):
    # PostgREST reports the count in Content-Range, with or without the rows.
    db = _db()
    res = (
        db.table("projects")
        .update({"num_members": 7}, count="exact", returning=returning)
        .eq("class_id", "c1")
        .execute()
    )
    assert res.count == 2
    assert len(res.data) == (0 if returning == "minimal" else 2)
    missed = db.table("projects").update({"num_members": 1}, count="exact").eq("id", "nope")
    assert missed.execute().count == 0
    # Without count, none is reported.
    assert db.table("projects").update({"num_members": 1}).eq("id", "p1").execute().count is None


def test_update_with_returning_minimal_writes_and_answers_no_rows():
    # PostgREST answers "Prefer: return=minimal" with no body.
    db = _db()
    res = (
        db.table("projects")
        .update({"num_members": 1}, returning="minimal")
        .eq("id", "p1")
        .execute()
    )
    assert res.data == []
    assert next(r for r in db.rows("projects") if r["id"] == "p1")["num_members"] == 1


def test_embedded_selects_one_to_many_many_to_one_and_nested():
    db = _db()
    rows = (
        db.table("projects")
        .select("id, name, project_members(user_id, role, profiles(email)), classes(created_by)")
        .eq("id", "p1")
        .execute()
        .data
    )
    assert rows[0]["classes"] == {"created_by": "instr"}  # projected like PostgREST
    members = rows[0]["project_members"]
    assert {m["user_id"] for m in members} == {"u1", "u2"}
    assert next(m for m in members if m["user_id"] == "u1")["profiles"]["email"] == "a@ucsc.edu"
    empty = (
        db.table("projects").select("id, project_members(user_id)").eq("id", "p2").execute().data
    )
    assert empty[0]["project_members"] == []


def test_embedded_select_alias_and_fk_hint():
    db = FakeSupabase(
        project_join_requests=[{"id": "r1", "invited_by": "u2", "user_id": "u1"}],
        profiles=[{"id": "u1", "email": "a@x"}, {"id": "u2", "email": "b@x"}],
        relations={
            ("project_join_requests", "profiles!project_join_requests_invited_by_fkey"): (
                "invited_by",
                "id",
                False,
            )
        },
    )
    rows = (
        db.table("project_join_requests")
        .select("id, inviter:profiles!project_join_requests_invited_by_fkey(email)")
        .execute()
        .data
    )
    assert rows[0]["inviter"] == {"email": "b@x"}


def test_unregistered_embed_raises_instead_of_returning_flat_rows():
    db = _db()
    with pytest.raises(KeyError):
        db.table("projects").select("id, attendance(id)").execute()


def test_embedded_column_filter_raises():
    with pytest.raises(NotImplementedError):
        _db().table("projects").select("*").eq("classes.created_by", "x")


def test_rpc_and_execute_counter():
    db = _db()
    assert db.rpc("count_members", {"expected": 7}).execute().data == [{"n": 7}]
    db.table("projects").select("*").execute()
    db.table("projects").update({"name": "x"}).eq("id", "p1").execute()
    assert db.executes == 3
    assert [q["op"] for q in db.queries] == ["rpc", "select", "update"]
    db.reset_counter()
    assert db.executes == 0


def test_delete_returns_removed_rows_and_update_returns_updated():
    db = _db()
    removed = db.table("project_members").delete().eq("project_id", "p1").execute().data
    assert {r["user_id"] for r in removed} == {"u1", "u2"}
    assert db.rows("project_members") == []
    assert (
        db.table("projects")
        .update({"num_members": 9})
        .eq("class_id", "c1")
        .execute()
        .data[0]["num_members"]
        == 9
    )


def test_embed_syntax_tolerates_whitespace_like_postgrest():
    db = FakeSupabase(
        project_members=[{"id": "m1", "project_id": "p1", "user_id": "u1", "role": "member"}],
        projects=[{"id": "p1", "name": "Alpha"}],
        relations={("project_members", "projects"): ("project_id", "id", False)},
    )
    rows = (
        db.table("project_members")
        .select("project_id, role, projects ( id, name )")
        .eq("user_id", "u1")
        .execute()
        .data
    )
    assert rows[0]["projects"] == {"id": "p1", "name": "Alpha"}


# ------------------------------------------------------------ select on a write


def _write_db() -> FakeSupabase:
    """Messages whose sender is a profile, embedded over a named foreign key."""
    return FakeSupabase(
        profiles=[{"id": "u1", "first_name": "Ada"}, {"id": "u2", "first_name": "Bo"}],
        messages=[{"id": "m1", "sender_id": "u2", "body": "old"}],
        relations={("messages", "profiles!m_sender_fkey"): ("sender_id", "id", False)},
    )


def test_select_after_insert_projects_columns_and_embeds():
    db = _write_db()
    res = (
        db.table("messages")
        .insert({"id": "m2", "sender_id": "u1", "body": "hi"})
        .select("id, body, sender:profiles!m_sender_fkey(first_name)")
        .execute()
    )
    assert res.data == [{"id": "m2", "body": "hi", "sender": {"first_name": "Ada"}}]
    # Only the answer is shaped: the stored row keeps every column.
    assert db.rows("messages")[-1] == {"id": "m2", "sender_id": "u1", "body": "hi"}


def test_select_after_update_and_delete_shape_the_written_rows():
    db = _write_db()
    updated = (
        db.table("messages")
        .update({"body": "edited"})
        .eq("id", "m1")
        .select("id, body, sender:profiles!m_sender_fkey(first_name)")
        .execute()
    )
    assert updated.data == [{"id": "m1", "body": "edited", "sender": {"first_name": "Bo"}}]
    removed = (
        db.table("messages")
        .delete()
        .eq("id", "m1")
        .select("id, sender:profiles!m_sender_fkey(first_name)")
        .execute()
    )
    assert removed.data == [{"id": "m1", "sender": {"first_name": "Bo"}}]
    assert db.rows("messages") == []


def test_embeds_on_a_write_see_the_store_before_the_write():
    # PostgREST sends a write and its select as one statement, on one snapshot: a BEFORE
    # trigger's change to another table is in that table afterwards, but not in the embed.
    calls = []

    def apply_move(db, row):
        calls.append(row["task_id"])
        task = next(t for t in db.rows("tasks") if t["id"] == row["task_id"])
        row["from_status"] = task["status"]
        task["status"] = row["to_status"]

    db = FakeSupabase(
        tasks=[{"id": "t1", "status": "todo"}, {"id": "t2", "status": "in_progress"}],
        relations={("moves", "tasks"): ("task_id", "id", False)},
        triggers={("moves", "insert"): apply_move},
    )
    res = (
        db.table("moves")
        .insert([{"task_id": "t1", "to_status": "done"}, {"task_id": "t2", "to_status": "done"}])
        .select("task_id, from_status, tasks(status)")
        .execute()
    )
    assert res.data == [
        {"task_id": "t1", "from_status": "todo", "tasks": {"status": "todo"}},
        {"task_id": "t2", "from_status": "in_progress", "tasks": {"status": "in_progress"}},
    ]
    assert calls == ["t1", "t2"]  # once per row
    assert [t["status"] for t in db.rows("tasks")] == ["done", "done"]
    # An insert with no select runs its trigger too.
    db.table("moves").insert({"task_id": "t1", "to_status": "todo"}).execute()
    assert (calls[-1], db.rows("tasks")[0]["status"]) == ("t1", "todo")


def test_select_after_a_write_keeps_count_and_overrides_minimal():
    db = _write_db()
    res = (
        db.table("messages")
        .update({"body": "x"}, count="exact", returning="minimal")
        .eq("id", "m1")
        .select("id")
        .execute()
    )
    assert (res.data, res.count) == ([{"id": "m1"}], 1)


def test_select_after_a_write_refuses_count_and_head():
    # postgrest-py's write builder takes select(*columns) only: a count belongs to the write.
    db = _write_db()
    with pytest.raises(TypeError):
        db.table("messages").insert({"body": "x"}).select("id", count="exact")
    with pytest.raises(TypeError):
        db.table("messages").update({"body": "x"}).eq("id", "m1").select("id", head=True)


def test_single_and_maybe_single_after_a_write():
    db = _write_db()
    missed = db.table("messages").update({"body": "x"}).eq("id", "nope").select("id")
    with pytest.raises(RuntimeError):
        missed.single().execute()
    missed = db.table("messages").update({"body": "x"}).eq("id", "nope").select("id")
    assert missed.maybe_single().execute() is None
    one = db.table("messages").update({"body": "x"}).eq("id", "m1").select("id, body")
    assert one.single().execute().data == {"id": "m1", "body": "x"}
    several = db.table("messages").insert([{"body": "a"}, {"body": "b"}]).select("body")
    with pytest.raises(RuntimeError):
        several.maybe_single().execute()


def test_unregistered_embed_on_a_write_raises():
    # PostgREST refuses the whole write (PGRST200), not just its answer.
    db = _write_db()
    with pytest.raises(KeyError):
        db.table("messages").insert({"sender_id": "u1"}).select(
            "id, profiles(first_name)"
        ).execute()
    with pytest.raises(KeyError):  # a nested embed is checked too
        db.table("messages").update({"body": "x"}).eq("id", "m1").select(
            "id, sender:profiles!m_sender_fkey(id, classes(name))"
        ).execute()
    assert db.rows("messages") == [{"id": "m1", "sender_id": "u2", "body": "old"}]


def test_writes_without_select_are_unchanged():
    db = _write_db()
    inserted = db.table("messages").insert({"id": "m2", "sender_id": "u1", "body": "hi"}).execute()
    assert inserted.data == [{"id": "m2", "sender_id": "u1", "body": "hi"}]
    minimal = (
        db.table("messages").update({"body": "x"}, returning="minimal").eq("id", "m1").execute()
    )
    assert minimal.data == []


def test_only_insert_triggers_are_supported():
    with pytest.raises(NotImplementedError):
        FakeSupabase(triggers={("tasks", "update"): lambda db, row: None})
