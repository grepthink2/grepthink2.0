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
