"""A team's one-off meetings: ``/api/projects/{project_id}/meetings``.

The team's Product Owner adds, edits and deletes them; every member, the class instructor and the
team's assigned TA read them. They are ``meetings`` rows with ``kind = 'team_meeting'`` and
``cadence = 'once'`` next to the weekly TA slots, which this module never touches.

Who is refused, and how, is pinned in ``test_authz_status_policy.py`` (404 for a missing project,
403 for an outsider and for everyone who may read but not write). What is here: what each call
returns and costs, what a request may contain, and the rules that table cannot see: a member
whose ``role`` is NULL, a meeting that belongs to another team or is a TA slot, and the clock.
"""

from __future__ import annotations

import copy
import json
from datetime import UTC, datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.team_meetings import controller
from app.team_meetings.models import TeamMeetingCreate, TeamMeetingUpdate
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

INSTR = "10000000-0000-0000-0000-000000000001"
TA1 = "20000000-0000-0000-0000-000000000001"  # P1's assigned (meeting) TA
PO = "30000000-0000-0000-0000-000000000001"  # P1's Product Owner
MEMBER = "30000000-0000-0000-0000-000000000002"
MEMBER_NULL_ROLE = "30000000-0000-0000-0000-000000000003"  # project_members.role is nullable
OTHER_PO = "30000000-0000-0000-0000-000000000004"  # P2's Product Owner
CLASS = "c0000000-0000-0000-0000-000000000001"
P1 = "d0000000-0000-0000-0000-000000000001"
P2 = "d0000000-0000-0000-0000-000000000002"

TM1 = "e0000000-0000-0000-0000-000000000001"  # P1, Tue Oct 20, 22:00 UTC
TM_MID = "e0000000-0000-0000-0000-000000000002"  # P1, Thu Oct 22, 18:00 UTC
TM_LATE = "e0000000-0000-0000-0000-000000000003"  # P1, Thu Oct 29
TM_P2 = "e0000000-0000-0000-0000-0000000000b1"  # P2's meeting
SLOT = "e0000000-0000-0000-0000-0000000000f1"  # P1's weekly TA meeting slot
ONE_OFF_TA_ROW = "e0000000-0000-0000-0000-0000000000f2"  # P1, cadence "once" but a TA meeting
NO_SUCH_MEETING = "e0000000-0000-0000-0000-00000000dead"

#: The clock every test starts from: the day before TM1.
NOW = datetime(2026, 10, 19, 17, 0, tzinfo=UTC)
ONLY_PRODUCT_OWNER = "Only the team's Product Owner can change meetings."
OUTPUT_KEYS = {
    "id",
    "project_id",
    "title",
    "starts_at",
    "duration_minutes",
    "location",
    "zoom_url",
    "note",
    "created_by",
    "updated_at",
}

#: A complete request body, as the web client sends it.
BODY = {
    "title": "Sprint 3 planning",
    "starts_at": "2026-10-20T22:00:00.000Z",
    "duration_minutes": 60,
    "location": "Baskin 361",
    "zoom_url": "https://ucsc.zoom.us/j/1",
    "note": "Bring the backlog.",
}


def _meeting(meeting_id: str, project_id: str, title: str, at: str, **extra) -> dict:
    """A ``meetings`` row as PostgREST holds a team meeting."""
    return {
        "id": meeting_id,
        "class_id": CLASS,
        "project_id": project_id,
        "kind": "team_meeting",
        "cadence": "once",
        "title": title,
        "scheduled_at": at,
        "duration_minutes": 60,
        "sequence": 1,
        "location": None,
        "zoom_url": None,
        "note": None,
        "created_by": PO,
        "created_at": "2026-10-18T09:00:00+00:00",
        "updated_at": "2026-10-18T09:00:00+00:00",
        **extra,
    }


@pytest.fixture
def db(monkeypatch):
    """P1 (assigned TA: TA1) has a Product Owner, a plain member and a member with no role; P2 has
    a Product Owner of its own. P1 has three team meetings, stored out of order, a weekly TA slot
    and a one-off TA row (``cadence = 'once'`` alone does not make a team meeting); P2 has one
    team meeting. The clock stands at NOW."""
    fake = FakeSupabase(
        classes=[{"id": CLASS, "created_by": INSTR}],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha", "assigned_ta_id": TA1},
            {"id": P2, "class_id": CLASS, "name": "Beta", "assigned_ta_id": None},
        ],
        project_members=[
            {"project_id": P1, "user_id": PO, "role": "product owner"},
            {"project_id": P1, "user_id": MEMBER, "role": "member"},
            {"project_id": P1, "user_id": MEMBER_NULL_ROLE, "role": None},
            {"project_id": P2, "user_id": OTHER_PO, "role": "product owner"},
        ],
        meetings=[
            _meeting(TM_LATE, P1, "Final demo", "2026-10-29T18:00:00+00:00"),
            _meeting(
                TM1,
                P1,
                "Sprint 3 planning",
                "2026-10-20T22:00:00+00:00",
                location="Baskin 361",
                zoom_url="https://ucsc.zoom.us/j/1",
                note="Bring the backlog.",
            ),
            _meeting(TM_MID, P1, "Standup", "2026-10-22T18:00:00+00:00"),
            _meeting(TM_P2, P2, "Their sync", "2026-10-21T20:00:00+00:00", created_by=OTHER_PO),
            {
                "id": SLOT,
                "class_id": CLASS,
                "project_id": P1,
                "kind": "ta_meeting",
                "cadence": "weekly",
                "title": None,
                "scheduled_at": None,
                "sequence": 1,
                "day_of_week": "tuesday",
                "start_time": "15:00:00",
                "duration_minutes": 30,
                "zoom_url": "https://ucsc.zoom.us/j/ta",
            },
            _meeting(ONE_OFF_TA_ROW, P1, "Make-up TA meeting", "2026-10-21T10:00:00+00:00")
            | {"kind": "ta_meeting"},
        ],
        relations={("projects", "classes"): ("class_id", "id", False)},
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    monkeypatch.setattr("app.assignments.deadlines.now_utc", lambda: NOW)
    return fake


def _as(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=user_id)}"}


def _stored(db: FakeSupabase, meeting_id: str) -> dict:
    return next(m for m in db.rows("meetings") if m["id"] == meeting_id)


def _new(**fields) -> TeamMeetingCreate:
    fields.setdefault("title", "Sprint 3 planning")
    fields.setdefault("starts_at", datetime(2026, 10, 20, 22, tzinfo=UTC))
    return TeamMeetingCreate(**fields)


# ----------------------------------------------------------------- adding a meeting


def test_the_product_owner_adds_a_meeting_in_three_round_trips(db):
    row = controller.create_team_meeting(
        P1, PO, _new(title="  Sprint 4 planning ", zoom_url="https://ucsc.zoom.us/j/2")
    )

    assert row == {
        "id": row["id"],
        "project_id": P1,
        "title": "Sprint 4 planning",  # stripped once: what is checked is what is stored
        "starts_at": "2026-10-20T22:00:00+00:00",
        "duration_minutes": 60,
        "location": None,
        "zoom_url": "https://ucsc.zoom.us/j/2",
        "note": None,
        "created_by": PO,
        "updated_at": NOW.isoformat(),
    }
    stored = db.rows("meetings")[-1]
    assert (stored["kind"], stored["cadence"], stored["class_id"]) == (
        "team_meeting",
        "once",
        CLASS,
    )
    assert (stored["title"], stored["scheduled_at"]) == (row["title"], row["starts_at"])
    json.dumps(stored)  # an id or a timestamp object would fail on its way to PostgREST
    assert db.executes <= 3  # the project, the caller's membership, the insert


def test_a_start_in_another_zone_is_stored_as_the_same_instant_in_utc(db):
    pacific = timezone(timedelta(hours=-7))

    row = controller.create_team_meeting(
        P1, PO, _new(starts_at=datetime(2026, 10, 20, 15, 0, tzinfo=pacific))
    )

    assert row["starts_at"] == "2026-10-20T22:00:00+00:00"


def test_a_meeting_may_start_this_very_moment_but_not_a_second_before(db):
    controller.create_team_meeting(P1, PO, _new(starts_at=NOW))

    with pytest.raises(HTTPException) as err:
        controller.create_team_meeting(P1, PO, _new(starts_at=NOW - timedelta(seconds=1)))
    assert err.value.status_code == 400


def test_a_past_start_is_refused_on_create_but_kept_on_edit(db, monkeypatch):
    monkeypatch.setattr(
        "app.assignments.deadlines.now_utc", lambda: datetime(2026, 10, 21, tzinfo=UTC)
    )
    stored_before = len(db.rows("meetings"))

    with pytest.raises(HTTPException) as err:
        controller.create_team_meeting(P1, PO, _new())  # Tue Oct 20, 22:00 UTC: yesterday
    assert (err.value.status_code, err.value.detail) == (400, "That time has already passed.")
    assert len(db.rows("meetings")) == stored_before

    # TM1 started then. Fixing its title, or moving it to another time that has passed, is fine.
    renamed = controller.update_team_meeting(P1, TM1, PO, TeamMeetingUpdate(title="Sprint 3 retro"))
    assert (renamed["title"], renamed["starts_at"]) == (
        "Sprint 3 retro",
        "2026-10-20T22:00:00+00:00",
    )
    moved = controller.update_team_meeting(
        P1, TM1, PO, TeamMeetingUpdate(starts_at=datetime(2026, 10, 19, 15, tzinfo=UTC))
    )
    assert moved["starts_at"] == "2026-10-19T15:00:00+00:00"


# ---------------------------------------------------------------- editing a meeting


def test_an_edit_changes_only_the_fields_it_names(db):
    row = controller.update_team_meeting(
        P1, TM1, PO, TeamMeetingUpdate(title=" Sprint 3 kickoff ", duration_minutes=90)
    )

    assert row == {
        "id": TM1,
        "project_id": P1,
        "title": "Sprint 3 kickoff",
        "starts_at": "2026-10-20T22:00:00+00:00",
        "duration_minutes": 90,
        "location": "Baskin 361",
        "zoom_url": "https://ucsc.zoom.us/j/1",
        "note": "Bring the backlog.",
        "created_by": PO,
        "updated_at": NOW.isoformat(),
    }
    assert db.executes <= 3  # the project, the membership, the update


def test_an_edit_moves_the_start_to_the_same_instant_in_utc(db):
    pacific = timezone(timedelta(hours=-7))

    row = controller.update_team_meeting(
        P1, TM1, PO, TeamMeetingUpdate(starts_at=datetime(2026, 10, 21, 9, 0, tzinfo=pacific))
    )

    assert row["starts_at"] == "2026-10-21T16:00:00+00:00"
    assert _stored(db, TM1)["scheduled_at"] == "2026-10-21T16:00:00+00:00"


def test_null_or_blank_clears_an_optional_field(db):
    update = TeamMeetingUpdate.model_validate({"location": None, "zoom_url": "", "note": "   "})

    row = controller.update_team_meeting(P1, TM1, PO, update)

    assert (row["location"], row["zoom_url"], row["note"]) == (None, None, None)
    assert (row["title"], row["starts_at"]) == ("Sprint 3 planning", "2026-10-20T22:00:00+00:00")


@pytest.mark.parametrize(
    "body",
    [{}, {"colour": "teal", "starts": "soon"}],
    ids=["an empty body", "only fields the API does not know"],
)
def test_an_edit_that_names_no_field_is_400_and_writes_nothing(client: TestClient, db, body):
    before = copy.deepcopy(db.rows("meetings"))

    response = client.patch(f"/api/projects/{P1}/meetings/{TM1}", json=body, headers=_as(PO))

    assert (response.status_code, response.json()["detail"]) == (
        400,
        "Provide at least one field to update",
    )
    assert db.executes == 0  # refused before anything was read or written
    assert db.rows("meetings") == before  # updated_at included


@pytest.mark.parametrize(
    "meeting_id",
    [TM_P2, SLOT, ONE_OFF_TA_ROW, NO_SUCH_MEETING],
    ids=[
        "another team's meeting",
        "the team's weekly TA slot",
        "the team's one-off TA row",
        "no such meeting",
    ],
)
def test_editing_another_projects_meeting_or_a_ta_slot_is_404(db, meeting_id):
    before = copy.deepcopy(db.rows("meetings"))

    with pytest.raises(HTTPException) as err:
        controller.update_team_meeting(P1, meeting_id, PO, TeamMeetingUpdate(title="Mine now"))
    assert (err.value.status_code, err.value.detail) == (404, "Meeting not found")
    with pytest.raises(HTTPException) as err:
        controller.delete_team_meeting(P1, meeting_id, PO)
    assert (err.value.status_code, err.value.detail) == (404, "Meeting not found")

    assert db.rows("meetings") == before


# --------------------------------------------------------------- deleting a meeting


def test_the_product_owner_deletes_a_meeting_in_three_round_trips(db):
    assert controller.delete_team_meeting(P1, TM1, PO) is None

    assert {m["id"] for m in db.rows("meetings")} == {TM_MID, TM_LATE, TM_P2, SLOT, ONE_OFF_TA_ROW}
    assert db.executes <= 3  # the project, the membership, the delete


# ------------------------------------------------------------------ reading the list


@pytest.mark.parametrize(
    ("reader", "can_manage"),
    [
        (PO, True),
        (MEMBER, False),
        (MEMBER_NULL_ROLE, False),
        (INSTR, False),  # the class instructor
        (TA1, False),  # the team's assigned TA
    ],
    ids=["product owner", "member", "member without a role", "instructor", "assigned TA"],
)
def test_the_list_is_sorted_and_carries_can_manage(db, reader, can_manage):
    out = controller.list_team_meetings(P1, reader)

    # Ascending by start. Another team's meeting and the team's TA rows are not in it.
    assert [m["id"] for m in out["meetings"]] == [TM1, TM_MID, TM_LATE]
    assert out["can_manage"] is can_manage
    assert out["meetings"][0] == {
        "id": TM1,
        "project_id": P1,
        "title": "Sprint 3 planning",
        "starts_at": "2026-10-20T22:00:00+00:00",
        "duration_minutes": 60,
        "location": "Baskin 361",
        "zoom_url": "https://ucsc.zoom.us/j/1",
        "note": "Bring the backlog.",
        "created_by": PO,
        "updated_at": "2026-10-18T09:00:00+00:00",
    }
    assert db.executes <= 3  # the project, then the membership and the meetings together


def test_the_list_says_cadence_once_so_the_partial_index_serves_it(db):
    controller.list_team_meetings(P1, PO)

    [read] = [q for q in db.queries if q["table"] == "meetings"]
    assert set(read["filters"]) >= {
        ("project_id", "eq", P1),
        ("kind", "eq", "team_meeting"),
        ("cadence", "eq", "once"),
    }


def test_a_team_with_no_meetings_gets_an_empty_list(db):
    db.store["meetings"] = [m for m in db.rows("meetings") if m["kind"] != "team_meeting"]

    assert controller.list_team_meetings(P1, PO) == {"meetings": [], "can_manage": True}


def test_a_member_without_a_role_can_read_but_not_write(db):
    before = copy.deepcopy(db.rows("meetings"))

    assert controller.list_team_meetings(P1, MEMBER_NULL_ROLE)["can_manage"] is False
    with pytest.raises(HTTPException) as err:
        controller.delete_team_meeting(P1, TM1, MEMBER_NULL_ROLE)
    # Told what only the Product Owner may do, not that they are off the team: they are on it.
    assert (err.value.status_code, err.value.detail) == (403, ONLY_PRODUCT_OWNER)

    assert db.rows("meetings") == before


# -------------------------------------------------------------- what a request may hold

ZOOM_ACCEPTED = [
    ("https://ucsc.zoom.us/j/123456789?pwd=AbC", "https://ucsc.zoom.us/j/123456789?pwd=AbC"),
    ("http://zoom.example.org/j/1", "http://zoom.example.org/j/1"),
    ("HTTPS://UCSC.ZOOM.US/j/1", "HTTPS://UCSC.ZOOM.US/j/1"),  # a scheme is case-insensitive
    ("https://ucsc.zoom.us:8443/j/1", "https://ucsc.zoom.us:8443/j/1"),
    ("  https://ucsc.zoom.us/j/1\n", "https://ucsc.zoom.us/j/1"),  # surrounding space dropped
    ("https://ucsc.zoom.us/" + "a" * 479, "https://ucsc.zoom.us/" + "a" * 479),  # 500 characters
]
#: Not a full http(s) address, or one that would be unsafe or unreadable as a link or a feed entry.
ZOOM_REFUSED = [
    "ucsc.zoom.us/j/1",
    "zoom.us",
    "//ucsc.zoom.us/j/1",
    "https:ucsc.zoom.us/j/1",
    "https://",
    "javascript:alert(document.cookie)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "ftp://ucsc.zoom.us/j/1",
    "mailto:someone@ucsc.edu",
    "https://ucsc.zoom.us/j/1 and more",
    "https://ucsc.zoom.us/j/1\r\nBEGIN:VEVENT",
    "https://ucsc.zoom.us/\u202ej/1",  # a right-to-left override
    "https://ucsc.zoom.us:99999/j/1",
    "https://ucsc.zoom.us:abc/j/1",
    "https://[::1/j/1",
    "https://ucsc.zoom.us/" + "a" * 480,  # 501 characters
]


@pytest.mark.parametrize(("raw", "kept"), ZOOM_ACCEPTED)
def test_a_full_http_address_is_a_zoom_link(raw, kept):
    assert _new(zoom_url=raw).zoom_url == kept


@pytest.mark.parametrize("raw", ZOOM_REFUSED)
def test_anything_but_a_full_http_address_is_not_a_zoom_link(raw):
    with pytest.raises(ValidationError) as exc:
        _new(zoom_url=raw)
    assert [error["loc"] for error in exc.value.errors()] == [("zoom_url",)]


def test_a_blank_text_field_means_none_and_a_title_is_stripped():
    meeting = _new(title="  Sprint 3  ", location="   ", zoom_url="\n", note="\t ")

    assert (meeting.title, meeting.location, meeting.zoom_url, meeting.note) == (
        "Sprint 3",
        None,
        None,
        None,
    )


@pytest.mark.parametrize(("field", "length"), [("title", 80), ("location", 120), ("note", 500)])
def test_a_text_field_may_be_as_long_as_the_database_allows_once_stripped(field, length):
    meeting = _new(**{field: f" {'x' * length} "})

    assert getattr(meeting, field) == "x" * length


@pytest.mark.parametrize("minutes", [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240])
def test_each_length_the_form_offers_is_accepted(minutes):
    assert _new(duration_minutes=minutes).duration_minutes == minutes


@pytest.mark.parametrize("minutes", [0, -15, 10, 50, 135, 165, 255, 300])
def test_a_length_the_form_does_not_offer_is_refused(minutes):
    # 135 and 165 are multiples of 15 the database allows; the API offers the shorter list.
    with pytest.raises(ValidationError):
        _new(duration_minutes=minutes)


#: Fields the API refuses, whether a meeting is added or edited.
REFUSED_FIELDS = [
    ("title", ""),
    ("title", "   "),
    ("title", "x" * 81),
    ("title", None),
    ("starts_at", None),
    ("starts_at", "2026-10-20T22:00:00"),  # no time zone
    ("starts_at", "next Tuesday"),
    ("duration_minutes", 50),
    ("duration_minutes", None),
    ("zoom_url", "ucsc.zoom.us/j/1"),
    ("zoom_url", "javascript:alert(1)"),
    ("zoom_url", "https://ucsc.zoom.us/" + "a" * 480),
    ("note", "x" * 501),
    ("location", "x" * 121),
]


@pytest.mark.parametrize(("field", "value"), REFUSED_FIELDS)
@pytest.mark.parametrize("method", ["post", "patch"])
def test_invalid_fields_are_422(client: TestClient, db, method, field, value):
    if method == "post":
        response = client.post(
            f"/api/projects/{P1}/meetings", json={**BODY, field: value}, headers=_as(PO)
        )
    else:
        response = client.patch(
            f"/api/projects/{P1}/meetings/{TM1}", json={field: value}, headers=_as(PO)
        )

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", field]]
    assert db.executes == 0  # refused before anything was read or written


def test_a_start_is_kept_as_the_same_instant_in_utc():
    pacific = timezone(timedelta(hours=-7))
    start = datetime(2026, 10, 20, 15, 0, tzinfo=pacific)

    for model in (_new(starts_at=start), TeamMeetingUpdate(starts_at=start)):
        assert model.starts_at == start
        assert model.starts_at.utcoffset() == timedelta(0)


#: Starts an offset carries past the calendar's ends (years 1 and 9999) once they are moved to UTC.
OUT_OF_RANGE_STARTS = [
    ("post", "9999-12-31T23:59:59-05:00"),
    ("patch", "9999-12-31T23:59:59-05:00"),
    ("patch", "0001-01-01T00:00:00+05:00"),
    ("post", "0001-01-01T00:00:00+05:00"),  # 422 before the past-start check could answer 400
]


@pytest.mark.parametrize(("method", "starts_at"), OUT_OF_RANGE_STARTS)
def test_a_start_with_no_utc_instant_is_422_and_writes_nothing(
    client: TestClient, db, method, starts_at
):
    before = copy.deepcopy(db.rows("meetings"))

    if method == "post":
        response = client.post(
            f"/api/projects/{P1}/meetings", json={**BODY, "starts_at": starts_at}, headers=_as(PO)
        )
    else:
        response = client.patch(
            f"/api/projects/{P1}/meetings/{TM1}", json={"starts_at": starts_at}, headers=_as(PO)
        )

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "starts_at"]]
    assert db.executes == 0
    assert db.rows("meetings") == before


def test_the_body_cannot_choose_whose_meeting_it_is_or_what_kind(client: TestClient, db):
    claim = {
        "project_id": P2,
        "class_id": "c0000000-0000-0000-0000-00000000dead",
        "kind": "ta_meeting",
        "cadence": "weekly",
        "sequence": 7,
        "created_by": INSTR,
    }

    created = client.post(f"/api/projects/{P1}/meetings", json={**BODY, **claim}, headers=_as(PO))
    edited = client.patch(
        f"/api/projects/{P1}/meetings/{TM1}", json={"title": "Edited", **claim}, headers=_as(PO)
    )
    assert (created.status_code, edited.status_code) == (200, 200)

    new, old = _stored(db, created.json()["id"]), _stored(db, TM1)
    assert (new["project_id"], new["class_id"], new["created_by"]) == (P1, CLASS, PO)
    assert (new["kind"], new["cadence"]) == ("team_meeting", "once")
    assert "sequence" not in new
    assert (old["project_id"], old["class_id"], old["created_by"]) == (P1, CLASS, PO)
    assert (old["kind"], old["cadence"], old["sequence"]) == ("team_meeting", "once", 1)
    assert old["title"] == "Edited"


# --------------------------------------------------------------------- the routes


def test_the_routes_answer_the_way_the_web_client_reads_them(client: TestClient, db):
    headers = _as(PO)
    base = f"/api/projects/{P1}/meetings"

    created = client.post(base, json=BODY | {"title": "Retro"}, headers=headers)
    assert created.status_code == 200
    meeting = created.json()
    assert set(meeting) == OUTPUT_KEYS
    assert (meeting["title"], meeting["starts_at"]) == ("Retro", "2026-10-20T22:00:00+00:00")

    listed = client.get(base, headers=headers)
    assert listed.status_code == 200
    assert set(listed.json()) == {"meetings", "can_manage"}
    assert listed.json()["can_manage"] is True
    assert meeting in listed.json()["meetings"]

    patched = client.patch(f"{base}/{meeting['id']}", json={"note": "New room"}, headers=headers)
    assert patched.status_code == 200
    assert patched.json() == {**meeting, "note": "New room"}

    deleted = client.delete(f"{base}/{meeting['id']}", headers=headers)
    assert (deleted.status_code, deleted.content) == (204, b"")
    still_there = {m["id"] for m in client.get(base, headers=headers).json()["meetings"]}
    assert meeting["id"] not in still_there


# ------------------------------------------- the TA slot's Zoom link shares the column cap


@pytest.mark.parametrize(("length", "status"), [(500, 200), (501, 422)])
def test_the_ta_slots_zoom_link_is_capped_where_the_database_caps_it(
    client: TestClient, db, length, status
):
    """meetings_zoom_url_length is table-wide: past it, the TA slot's PATCH would end as a 500."""
    prefix = "https://ucsc.zoom.us/j/"
    link = prefix + "1" * (length - len(prefix))

    response = client.patch(
        f"/api/projects/{P1}/meeting", json={"zoom_url": link}, headers=_as(INSTR)
    )

    assert response.status_code == status
    if status == 422:
        assert db.executes == 0
        assert _stored(db, SLOT)["zoom_url"] == "https://ucsc.zoom.us/j/ta"
