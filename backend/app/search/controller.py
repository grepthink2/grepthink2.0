"""The signed-in user's search index: everything the ⌘K palette can open.

The palette ranks in the browser, so this module only decides *what* the caller may see
(the rules the pages already enforce) and *where* each item opens. Two ``fan_out`` waves,
at most eight PostgREST calls. Spec: docs/superpowers/specs/2026-10-13-global-search-design.md.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from urllib.parse import quote

from fastapi import HTTPException

from app.core.db import fan_out, get_client
from app.messages import controller as messages

logger = logging.getLogger(__name__)

#: Profile columns a person row is built from.
_PROFILE = "id, email, first_name, last_name"

#: A class with its owner and every enrollment's profile embedded (FK hints as in
#: ``app.messages.controller._CLASS_PEOPLE``) plus what class and assignment rows show.
_CLASS = (
    "id, name, term, year, description, created_by, created_at, "
    f"owner:profiles!classes_created_by_fkey({_PROFILE}), "
    "class_enrollments!class_enrollments_class_id_fkey("
    f"user_id, enrollment_role, profile:profiles!class_enrollments_user_id_fkey({_PROFILE}))"
)
#: The caller's enrollments, each with its class (and that class's people).
_ENROLLED_CLASS = f"class_id, enrollment_role, classes!class_enrollments_class_id_fkey({_CLASS})"
_TASK = "id, key, title, status, points, tags, project_id, story_id, updated_at"
_STORY = "id, key, title, points, project_id, sprint_id, updated_at, archived_at, sprints(name)"
_PROJECT = "id, name, class_id, created_at, project_members(user_id)"
_ASSIGNMENT = "id, Title, assignment_type, status, close_date, class_id"

_ROLE_LABEL = {"owner": "Instructor", "ta": "TA", "student": "Student"}
_CHANNEL_LABEL = {
    "team_members": "Team channel",
    "team_ta": "TA channel",
    "team_instructor": "Instructor channel",
}
_ASSIGNMENT_LABEL = {"tsr": "TSR", "feedback": "Feedback", "interest_form": "Interest form"}


def build_index(user_id: str) -> dict:
    """``{"items": [...], "generated_at": iso}`` for ``user_id``; empty for a caller in no class."""
    try:
        return {"items": _items_for(str(user_id)), "generated_at": datetime.now(UTC).isoformat()}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error building search index | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to build the search index")


def _items_for(uid: str) -> list[dict]:
    client = get_client()
    mine = f"assignee_id.eq.{uid},reporter_id.eq.{uid}"

    def rows(query) -> list[dict]:
        return query.execute().data or []

    # Wave 1: needs only the caller.
    first = fan_out(
        {
            "owned": lambda: rows(client.table("classes").select(_CLASS).eq("created_by", uid)),
            "enrolled": lambda: rows(
                client.table("class_enrollments").select(_ENROLLED_CLASS).eq("user_id", uid)
            ),
            "inbox": lambda: messages.list_inbox(caller_id=uid),
            "tasks": lambda: rows(client.table("tasks").select(_TASK).or_(mine)),
            "stories": lambda: rows(client.table("user_stories").select(_STORY).or_(mine)),
        }
    )

    classes: dict[str, dict] = {}  # class id -> row
    roles: dict[str, str] = {}  # class id -> owner | ta | student
    for cls in first["owned"]:
        classes[cls["id"]] = cls
        roles[cls["id"]] = "owner"
    for enrollment in first["enrolled"]:
        cls = enrollment.get("classes")
        if not cls or cls["id"] in classes:
            continue
        classes[cls["id"]] = cls
        roles[cls["id"]] = "ta" if enrollment.get("enrollment_role") == "ta" else "student"

    stories: dict[str, dict] = {s["id"]: s for s in first["stories"]}
    missing_story_ids = sorted(
        {
            t["story_id"]
            for t in first["tasks"]
            if t.get("story_id") and t["story_id"] not in stories
        }
    )
    class_ids = list(classes)

    # Wave 2: needs the class ids and story ids from wave 1. An empty input skips its read.
    second = fan_out(
        {
            "projects": lambda: (
                rows(client.table("projects").select(_PROJECT).in_("class_id", class_ids))
                if class_ids
                else []
            ),
            "assignments": lambda: (
                rows(client.table("assignments").select(_ASSIGNMENT).in_("class_id", class_ids))
                if class_ids
                else []
            ),
            "task_stories": lambda: (
                rows(client.table("user_stories").select(_STORY).in_("id", missing_story_ids))
                if missing_story_ids
                else []
            ),
        }
    )
    for s in second["task_stories"]:
        stories[s["id"]] = s

    projects = {p["id"]: p for p in second["projects"]}
    teammates: set[str] = set()
    # Boards the caller can open (the scrum board's rule): a project in one of the caller's
    # classes that they are on, or any project in a class they own or TA. Being a task's
    # assignee or reporter is not enough: a team they have left still names them.
    openable: set[str] = set()
    for p in projects.values():
        member_ids = {str(m["user_id"]) for m in p.get("project_members") or []}
        if uid in member_ids:
            teammates |= member_ids
        if uid in member_ids or roles.get(p.get("class_id")) in ("owner", "ta"):
            openable.add(p["id"])
    project_names = {pid: p.get("name") for pid, p in projects.items()}

    items: list[dict] = []
    items += _people(uid, classes, first["inbox"], teammates)
    items += _projects(projects, classes)
    items += _stories(stories, project_names, openable)
    items += _tasks(first["tasks"], stories, project_names, openable)
    items += _conversations(first["inbox"])
    items += _classes(classes, roles)
    items += _assignments(second["assignments"], roles)
    return items


def _name(profile: dict) -> str:
    first = (profile.get("first_name") or "").strip()
    last = (profile.get("last_name") or "").strip()
    return f"{first} {last}".strip() or (profile.get("email") or "").strip() or "Unknown user"


def _people(
    uid: str, classes: dict[str, dict], inbox: list[dict], teammates: set[str]
) -> list[dict]:
    """Everyone the caller may message (the ``list_contacts`` rule), each once. The role shown is
    the one in the most recently created shared class; up to two class names follow it."""
    seen: dict[str, dict] = {}
    newest_first = sorted(classes.values(), key=lambda c: c.get("created_at") or "", reverse=True)
    for cls in newest_first:
        members = [(cls["created_by"], cls.get("owner"), "owner")]
        members += [
            (
                e["user_id"],
                e.get("profile"),
                "ta" if e.get("enrollment_role") == "ta" else "student",
            )
            for e in cls.get("class_enrollments") or []
        ]
        for raw_id, profile, role in members:
            person_id = str(raw_id)
            if person_id == uid or not profile:
                continue  # self, or an enrollment whose profile row is missing (as list_contacts)
            entry = seen.setdefault(person_id, {"profile": profile, "role": role, "classes": []})
            if len(entry["classes"]) < 2:
                entry["classes"].append(cls.get("name"))
    dm_for = {
        r["other_user"]["id"]: r["id"] for r in inbox if r["type"] == "dm" and r.get("other_user")
    }
    out = []
    for person_id, entry in seen.items():
        name = _name(entry["profile"])
        email = (entry["profile"].get("email") or "").strip()
        href = (
            f"/app/messages/{dm_for[person_id]}"
            if person_id in dm_for
            else f"/app/messages/compose?to={person_id}&name={quote(name)}"
        )
        out.append(
            {
                "id": person_id,
                "type": "person",
                "title": name,
                "subtitle": " · ".join(
                    [_ROLE_LABEL[entry["role"]], *filter(None, entry["classes"])]
                ),
                "keywords": [email] if email else None,
                "same_project": person_id in teammates,
                "href": href,
            }
        )
    return out


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def _projects(projects: dict[str, dict], classes: dict[str, dict]) -> list[dict]:
    out = []
    for p in projects.values():
        cls = classes.get(p.get("class_id"))
        members = p.get("project_members") or []
        out.append(
            {
                "id": p["id"],
                "type": "project",
                "title": p.get("name") or "Untitled project",
                "subtitle": " · ".join(
                    filter(None, [cls.get("name") if cls else None, _count(len(members), "member")])
                ),
                "project_id": p["id"],
                "class_id": p.get("class_id"),
                "updated_at": p.get("created_at"),
                "href": f"/app/projects/{p['id']}",
            }
        )
    return out


def _board_href(project_id: str, sprint_id: str | None, **target: str) -> str:
    """``…/board?sprint=<id>&task=<id>``; backlog items say ``view=backlog`` instead of a sprint."""
    ((param, value),) = target.items()
    where = f"sprint={sprint_id}" if sprint_id else "view=backlog"
    return f"/app/projects/{project_id}/board?{where}&{param}={value}"


def _pts(points) -> str | None:
    return f"{points} pts" if points else None


def _stories(
    stories: dict[str, dict], project_names: dict[str, str | None], openable: set[str]
) -> list[dict]:
    out = []
    for s in stories.values():
        if s["project_id"] not in openable or s.get("archived_at"):
            continue
        sprint = (s.get("sprints") or {}).get("name")
        out.append(
            {
                "id": s["id"],
                "type": "story",
                "key": s.get("key"),
                "title": s["title"],
                "subtitle": " · ".join(
                    filter(
                        None, [sprint, _pts(s.get("points")), project_names.get(s["project_id"])]
                    )
                ),
                "project_id": s["project_id"],
                "points": s.get("points"),
                "sprint": sprint,
                "updated_at": s.get("updated_at"),
                "href": _board_href(s["project_id"], s.get("sprint_id"), story=s["id"]),
            }
        )
    return out


def _tasks(
    tasks: list[dict],
    stories: dict[str, dict],
    project_names: dict[str, str | None],
    openable: set[str],
) -> list[dict]:
    out = []
    for t in tasks:
        if t["project_id"] not in openable:
            continue
        story = stories.get(t.get("story_id"))
        if story is not None and story.get("archived_at"):
            continue  # the board shows these only in the archive
        out.append(
            {
                "id": t["id"],
                "type": "task",
                "key": t.get("key"),
                "title": t["title"],
                "subtitle": project_names.get(t["project_id"]),
                "project_id": t["project_id"],
                "status": t.get("status"),
                "tags": t.get("tags") or None,
                "points": t.get("points"),
                "updated_at": t.get("updated_at"),
                "href": _board_href(
                    t["project_id"], story.get("sprint_id") if story else None, task=t["id"]
                ),
            }
        )
    return out


def _conversations(inbox: list[dict]) -> list[dict]:
    out = []
    for r in inbox:
        if r["type"] == "dm":
            other = r.get("other_user") or {}
            title = other.get("name") or other.get("email") or "Direct message"
            subtitle = "Direct message"
        else:
            title = r.get("team_name") or "Team"
            subtitle = _CHANNEL_LABEL.get(r["type"], "Channel")
        out.append(
            {
                "id": r["id"],
                "type": "conversation",
                "title": title,
                "subtitle": subtitle,
                "keywords": [subtitle],
                "project_id": r.get("project_id"),
                "unread": r.get("unread_count") or 0,
                "last_message_at": r.get("last_message_at"),
                "href": f"/app/messages/{r['id']}",
            }
        )
    return out


def _classes(classes: dict[str, dict], roles: dict[str, str]) -> list[dict]:
    out = []
    for cid, cls in classes.items():
        year = cls.get("year")
        term = " ".join(filter(None, [cls.get("term"), str(int(year)) if year else None]))
        out.append(
            {
                "id": cid,
                "type": "class",
                "title": cls.get("name") or "Untitled class",
                "subtitle": term or cls.get("description") or None,
                "class_id": cid,
                "updated_at": cls.get("created_at"),
                "href": "/app/dashboard" if roles[cid] == "owner" else "/app/home",
            }
        )
    return out


def _short_date(iso: str) -> str:
    d = date.fromisoformat(iso[:10])
    return f"{d:%b} {d.day}"


def _assignment_href(role: str, kind: str | None, assignment_id: str) -> str:
    if role == "owner":
        if kind in ("tsr", "feedback"):
            return f"/app/modules/{kind}/{assignment_id}"
        return "/app/modules"
    if role == "ta":
        return f"/app/ta-review/{assignment_id}" if kind == "tsr" else "/app/ta-review"
    return f"/app/assignments/{assignment_id}"


def _assignments(assignments: list[dict], roles: dict[str, str]) -> list[dict]:
    out = []
    for a in assignments:
        role = roles.get(a.get("class_id"))
        published = a.get("status") == "publish"
        if role is None or (role != "owner" and not published):
            continue
        kind = a.get("assignment_type")
        bits = [_ASSIGNMENT_LABEL.get(kind, "Assignment")]
        if a.get("close_date"):
            bits.append(f"due {_short_date(a['close_date'])}")
        if not published:
            bits.append("Draft")
        out.append(
            {
                "id": a["id"],
                "type": "assignment",
                "title": a.get("Title") or "Untitled assignment",
                "subtitle": " · ".join(bits),
                "class_id": a.get("class_id"),
                "due_at": a.get("close_date"),
                "href": _assignment_href(role, kind, a["id"]),
            }
        )
    return out
