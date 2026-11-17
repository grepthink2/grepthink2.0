"""Business logic for a team's project documents.

Permission model, the board's (the service-role client bypasses RLS, so every check is here):

* Team members (a ``project_members`` row, whatever its role) read every document of their team, create
  documents and save them.
* Class staff (the class instructor, its TAs, the team's meeting TA) read them and never write.
* Finalizing and deleting a document also take a team role: Scrum Master, Product Owner, owner or admin.
* Anyone else gets the board's 403, and never a document's contents. A document that does not exist is
  404; so is the project behind a list or a new document.
* A class's list of documents is for its instructor and its TAs.

Every save is a revision and the last writer wins (``document_save``, which also says when a save replaced
a revision the saver never saw). A document's derived sections, what the board says, are worked out live
until finalize freezes them: ``document_finalize`` stores them on the head revision (its snapshot, with when
and by whom), and whoever reads a revision that carries a snapshot gets the snapshot. Every hand-in is kept,
so a document finalized twice answers each hand-in as it was. A finalized document stays final when it is
saved again, at its finalized revision, and says it was edited since. The SQL functions
``document_create``, ``document_save`` and ``document_finalize`` are the only writers of revisions.

Logs and exception messages carry ids only: never a document's text, a name or an address.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import ValidationError

from app.core import authz, events
from app.core.db import fan_out, get_client
from app.core.errors import DatabaseConflictError, DatabaseError
from app.documents import derive, notify
from app.documents.derive import Ctx
from app.documents.kinds import KINDS, ORDER, Kind, title_of
from app.documents.markdown import Heading
from app.institutions.controller import institution_timezone
from app.projects.controller import ROLE_ADMIN, ROLE_OWNER, ROLE_PRODUCT_OWNER, ROLE_SCRUM_MASTER
from app.scrum.controller import (
    MEMBERS_ONLY,
    SPRINT_NOT_FOUND,
    board_access,
    board_place,
    school_day,
    school_today,
    sprint_days,
)
from app.scrum.schedule import sprint_status
from app.utils.profiles import profile_display_name
from app.utils.urls import frontend_url

#: 404: no document by that id.
DOCUMENT_NOT_FOUND = "Document not found"
#: 404: the document has no revision by that number (never saved, or pruned).
REVISION_NOT_FOUND = "Revision not found"
#: 409: the team already has this document (one per sprint and kind, one per project and kind).
DOCUMENT_EXISTS = "This document already exists"
#: 409: a revision was saved after the one the caller finalizes.
DOCUMENT_CHANGED = "The document changed; reload and try again"
#: 409: a document that was ever finalized stays.
DOCUMENT_FINAL = "A finalized document can't be deleted"
#: 403: finalizing and deleting take a team role.
FINALIZE_DENIED = "Only the Scrum Master or the Product Owner can finalize a document"
DELETE_DENIED = "Only the Scrum Master or the Product Owner can delete a document"
#: 422: a kind the database allows that the API does not serve yet (a sprint plan, a release plan).
KIND_NOT_AVAILABLE = "That document is not available yet"
#: 422: a project's document names no sprint.
NO_SPRINT_FOR_KIND = "This document belongs to the project, not to a sprint"
#: 422: a body names a story that is not on the team's board.
STORY_NOT_IN_PROJECT = "A story is not on this team's board"
#: 403: a class's list of documents is for its staff.
CLASS_STAFF_ONLY = "Only the instructor or a class TA can read the class's documents"
#: 422 for a body, 409 for a finalize's snapshot: more than a revision can hold.
DOCUMENT_TOO_LONG = "This document is too long"

#: The team roles that finalize and delete a document.
FINALIZE_ROLES = frozenset({ROLE_SCRUM_MASTER, ROLE_PRODUCT_OWNER, ROLE_OWNER, ROLE_ADMIN})

_DOCUMENT_COLUMNS = (
    "id, project_id, kind, sprint_id, status, head_revision, finalized_revision, finalized_at, "
    "finalized_by, created_by, created_at, updated_at"
)
#: A revision's saver. The revisions table has two foreign keys to profiles (its saver and its
#: finalizer), so the embed names its own.
_SAVER = "saver:profiles!project_document_revisions_saved_by_fkey(first_name, last_name, email)"
#: A document with the profile of whoever finalized it (project_documents has two foreign keys to
#: profiles, so the embed names its own).
_DOCUMENT_SELECT = (
    f"{_DOCUMENT_COLUMNS}, "
    "finalizer:profiles!project_documents_finalized_by_fkey(first_name, last_name, email)"
)
_REVISION_COLUMNS = (
    f"number, body, snapshot, source, saved_by, saved_at, finalized_at, finalized_by, {_SAVER}"
)
#: Postgres' code for "no such row", raised by document_create, document_save and document_finalize.
_NO_DATA_FOUND = "P0002"
#: Postgres' code for a CHECK that failed: on a revision, project_document_revisions_size.
_CHECK_VIOLATION = "23514"
#: The most a body or a snapshot may take as compact UTF-8 JSON. The database holds each to 256 kB in its
#: stored form (project_document_revisions_size); this leaves room for jsonb's own overhead.
_SIZE_MAX = 200_000


# --------------------------------------------------------------------------- reads ----


def _load_document(client, document_id) -> dict:
    """The document row, with its finalizer's profile; 404 :data:`DOCUMENT_NOT_FOUND` when there is
    none."""
    rows = (
        client.table("project_documents")
        .select(_DOCUMENT_SELECT)
        .eq("id", str(document_id))
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        raise HTTPException(status_code=404, detail=DOCUMENT_NOT_FOUND)
    return rows[0]


def _kind_of(document: dict) -> Kind:
    """The document's kind; 422 :data:`KIND_NOT_AVAILABLE` for one the API does not serve."""
    kind = KINDS.get(document["kind"])
    if kind is None:
        raise HTTPException(status_code=422, detail=KIND_NOT_AVAILABLE)
    return kind


def _revision(client, document_id, number: int) -> dict | None:
    """One revision, with its saver's profile embedded; None when there is no such revision."""
    rows = (
        client.table("project_document_revisions")
        .select(_REVISION_COLUMNS)
        .eq("document_id", str(document_id))
        .eq("number", number)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def _names(client, user_ids: list[str]) -> dict[str, str]:
    """Display names by id."""
    rows = (
        client.table("profiles")
        .select("id, first_name, last_name, email")
        .in_("id", [str(u) for u in user_ids])
        .execute()
    ).data or []
    return {str(r["id"]): profile_display_name(r) or "Unknown" for r in rows}


def _context_jobs(client, document: dict, kind: Kind, *, board: bool = True) -> dict:
    """The board reads behind a document's derived sections; with ``board`` False only its sprints
    (enough to name the document when its derived sections are frozen)."""
    jobs = derive.context_jobs(
        client,
        document["project_id"],
        document.get("sprint_id"),
        burnup=kind.reads_burnup,
        repos=kind.reads_repos,
    )
    return jobs if board else {"sprints": jobs["sprints"]}


def _context(reads: dict, document: dict, zone: ZoneInfo) -> Ctx:
    return derive.build_context(
        reads,
        project_id=document["project_id"],
        sprint_id=document.get("sprint_id"),
        today=school_today(zone),
        zone=zone,
    )


def _too_long(value) -> bool:
    """Whether ``value`` takes more than :data:`_SIZE_MAX` bytes as compact UTF-8 JSON."""
    encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return len(encoded) > _SIZE_MAX


def _require_member(access: str) -> None:
    if access != "member":
        raise HTTPException(status_code=403, detail=MEMBERS_ONLY)


# -------------------------------------------------------------------------- shapes ----


def _sprint_out(sprint: dict | None, today: date) -> dict | None:
    if sprint is None:
        return None
    return {
        "id": sprint["id"],
        "name": sprint["name"],
        "starts_at": str(sprint["starts_at"]),
        "ends_at": str(sprint["ends_at"]),
        "status": sprint_status(*sprint_days(sprint), today),
    }


def _edited_since(document: dict) -> bool:
    """A final document saved again after its finalized revision."""
    final = document.get("finalized_revision")
    return (
        document.get("status") == "final"
        and final is not None
        and document["head_revision"] > final
    )


def _document_out(document: dict, kind: Kind, sprint: dict | None, today: date) -> dict:
    finalized_by = document.get("finalized_by")
    return {
        "id": document["id"],
        "project_id": document["project_id"],
        "kind": document["kind"],
        "title": title_of(kind, sprint),
        "sprint": _sprint_out(sprint, today),
        "status": document["status"],
        "head_revision": document["head_revision"],
        "finalized_revision": document.get("finalized_revision"),
        "finalized_at": document.get("finalized_at"),
        "finalized_by": finalized_by,
        "finalized_by_name": (profile_display_name(document.get("finalizer")) or "Unknown")
        if finalized_by
        else None,
        "edited_since": _edited_since(document),
        "created_at": document.get("created_at"),
        "updated_at": document.get("updated_at"),
    }


def _saver_name(revision: dict) -> str | None:
    if not revision.get("saved_by"):
        return None
    return profile_display_name(revision.get("saver")) or "Unknown"


def _revision_out(revision: dict) -> dict:
    return {
        "number": revision["number"],
        "saved_by": revision.get("saved_by"),
        "saved_by_name": _saver_name(revision),
        "saved_at": revision.get("saved_at"),
        "source": revision.get("source"),
        #: When the revision was handed in; None for one that never was.
        "finalized_at": revision.get("finalized_at"),
    }


def _view(
    document: dict,
    kind: Kind,
    ctx: Ctx,
    revision: dict,
    derived: dict,
    *,
    frozen: bool,
    access: str,
    role: str | None,
) -> dict:
    """A document as ``GET /documents/{id}`` answers it."""
    return {
        "document": _document_out(document, kind, ctx.sprint, ctx.today),
        "revision": _revision_out(revision),
        "body": revision["body"],
        "derived": derived,
        "derived_frozen": frozen,
        "access": access,
        "can_write": access == "member",
        "can_finalize": access == "member" and role in FINALIZE_ROLES,
    }


def _derived(
    client, document: dict, kind: Kind, revision: dict, ctx: Ctx, *, board_read: bool
) -> tuple[dict, bool]:
    """The revision's derived sections: its snapshot when it was handed in (whichever hand-in is the
    document's latest), else worked out from the board, read now unless ``board_read``. And whether they
    are the snapshot."""
    if revision.get("snapshot") is not None:
        return revision["snapshot"], True
    if not board_read:
        ctx = derive.load_context(
            client,
            document["project_id"],
            document.get("sprint_id"),
            today=ctx.today,
            zone=ctx.zone,
            burnup=kind.reads_burnup,
            repos=kind.reads_repos,
        )
    return kind.derive(ctx, revision["body"]), False


# ------------------------------------------------------------------- the endpoints ----


def list_project_documents(project_id: UUID, user_id: str) -> dict:
    """The team's Documents tab: one slot per document the team can have, made or not.

    Who can call: team members and class staff. Returns ``{"documents": [slot]}``: a sprint report for
    each sprint (by start), then the release summary, then the test plan and report. A slot is
    ``{kind, title, sprint, document}``; ``document`` is None until the team makes it, else its id,
    status, revisions, whether it was edited since it was finalized, and who saved it last.
    Raises 404 for no such project, 403 for anyone else. Round trips: the access check; the sprints and
    the documents together; the head revisions with their savers when there are documents.
    """
    client = get_client()
    pid = str(project_id)
    _, institution_id = board_access(client, project_id=pid, user_id=user_id)
    today = school_today(institution_timezone(institution_id))
    reads = fan_out(
        {
            "sprints": lambda: (
                (
                    client.table("sprints")
                    .select("id, name, starts_at, ends_at")
                    .eq("project_id", pid)
                    .order("starts_at")
                    .execute()
                ).data
                or []
            ),
            "documents": lambda: (
                (
                    client.table("project_documents")
                    .select(_DOCUMENT_COLUMNS)
                    .eq("project_id", pid)
                    .execute()
                ).data
                or []
            ),
        }
    )
    documents = [d for d in reads["documents"] if d["kind"] in KINDS]
    savers: dict[str, str | None] = {}
    if documents:
        heads = ",".join(
            f"and(document_id.eq.{d['id']},number.eq.{d['head_revision']})" for d in documents
        )
        rows = (
            client.table("project_document_revisions")
            .select(f"document_id, saved_by, {_SAVER}")
            .or_(heads)
            .execute()
        ).data or []
        savers = {str(r["document_id"]): _saver_name(r) for r in rows}

    by_slot = {(d["kind"], d.get("sprint_id")): d for d in documents}

    def slot(kind: Kind, sprint: dict | None) -> dict:
        found = by_slot.get((kind.name, sprint["id"] if sprint else None))
        return {
            "kind": kind.name,
            "title": title_of(kind, sprint),
            "sprint": _sprint_out(sprint, today),
            "document": None
            if found is None
            else {
                "id": found["id"],
                "status": found["status"],
                "head_revision": found["head_revision"],
                "finalized_revision": found.get("finalized_revision"),
                "edited_since": _edited_since(found),
                "updated_at": found.get("updated_at"),
                "saved_by_name": savers.get(str(found["id"])),
            },
        }

    slots = []
    for name in ORDER:
        kind = KINDS[name]
        if kind.per_sprint:
            slots += [slot(kind, s) for s in reads["sprints"]]
        else:
            slots.append(slot(kind, None))
    return {"documents": slots}


def create_document(project_id: UUID, user_id: str, kind_name: str, sprint_id) -> dict:
    """Make one of the team's documents: a draft whose first revision is the kind's seed.

    Who can call: team members. Returns the document as :func:`get_document` does. Raises 422
    :data:`KIND_NOT_AVAILABLE` for a kind the API does not serve and :data:`NO_SPRINT_FOR_KIND` for a
    project's document given a sprint; 404 for no such project, or for a sprint's document without a
    sprint of this project; 403 as the board's writes; 409 :data:`DOCUMENT_EXISTS` when the team has it.
    """
    kind = KINDS.get(kind_name)
    if kind is None:
        raise HTTPException(status_code=422, detail=KIND_NOT_AVAILABLE)
    if not kind.per_sprint and sprint_id is not None:
        raise HTTPException(status_code=422, detail=NO_SPRINT_FOR_KIND)
    client = get_client()
    pid = str(project_id)
    access, institution_id, class_id = board_place(client, project_id=pid, user_id=user_id)
    _require_member(access)
    if kind.per_sprint and sprint_id is None:
        raise HTTPException(status_code=404, detail=SPRINT_NOT_FOUND)
    zone = institution_timezone(institution_id)
    jobs = derive.context_jobs(
        client, pid, sprint_id, burnup=kind.reads_burnup, repos=kind.reads_repos
    )
    jobs["role"] = lambda: authz.get_project_role(client, pid, user_id)
    reads = fan_out(jobs)
    ctx = derive.build_context(
        reads, project_id=pid, sprint_id=sprint_id, today=school_today(zone), zone=zone
    )
    if kind.per_sprint and ctx.sprint is None:
        raise HTTPException(status_code=404, detail=SPRINT_NOT_FOUND)

    body = kind.body_model.model_validate(kind.seed(ctx)).model_dump(mode="json")
    if _too_long(body):
        raise HTTPException(status_code=422, detail=DOCUMENT_TOO_LONG)
    try:
        created = client.rpc(
            "document_create",
            {
                "p_project_id": pid,
                "p_kind": kind.name,
                "p_sprint_id": str(sprint_id) if sprint_id else None,
                "p_body": body,
                "p_user": str(user_id),
            },
            operation="write",
        ).execute()
    except DatabaseConflictError as exc:
        raise HTTPException(status_code=409, detail=DOCUMENT_EXISTS) from exc
    except DatabaseError as exc:
        if exc.pg_code == _NO_DATA_FOUND:  # the sprint left the project since the read
            raise HTTPException(status_code=404, detail=SPRINT_NOT_FOUND) from exc
        raise
    document_id = created.data if isinstance(created.data, str) else (created.data or [None])[0]

    back = fan_out(
        {
            "document": lambda: _load_document(client, document_id),
            "revision": lambda: _revision(client, document_id, 1),
        }
    )
    events.record(
        "document_created",
        actor_id=str(user_id),
        class_id=str(class_id) if class_id else None,
        project_id=pid,
        meta={"kind": kind.name},
    )
    return _view(
        back["document"],
        kind,
        ctx,
        back["revision"],
        kind.derive(ctx, body),
        frozen=False,
        access=access,
        role=reads["role"],
    )


def get_document(document_id: UUID, user_id: str, revision: int | None = None) -> dict:
    """One document, at one revision, with its derived sections.

    Who can call: team members and class staff. ``revision`` picks one; by default a member reads the
    head, and staff read the finalized revision of a final document, else the head. ``derived`` is the
    revision's snapshot when it is the finalized revision (``derived_frozen``), else worked out from the
    board now. Returns ``{document, revision, body, derived, derived_frozen, access, can_write,
    can_finalize}``. Raises 404 for no such document or revision, 403 for anyone else.
    """
    client = get_client()
    document = _load_document(client, document_id)
    access, institution_id = board_access(
        client, project_id=document["project_id"], user_id=user_id
    )
    kind = _kind_of(document)
    zone = institution_timezone(institution_id)
    final = document.get("finalized_revision")
    if revision is None:
        revision = final if access == "staff" and final is not None else document["head_revision"]
    frozen = revision == final

    jobs = {"revision": lambda: _revision(client, document["id"], revision)}
    if access == "member":
        jobs["role"] = lambda: authz.get_project_role(client, document["project_id"], user_id)
    jobs.update(_context_jobs(client, document, kind, board=not frozen))
    reads = fan_out(jobs)
    found = reads["revision"]
    if found is None:
        raise HTTPException(status_code=404, detail=REVISION_NOT_FOUND)
    ctx = _context(reads, document, zone)
    derived, is_frozen = _derived(client, document, kind, found, ctx, board_read=not frozen)
    return _view(
        document,
        kind,
        ctx,
        found,
        derived,
        frozen=is_frozen,
        access=access,
        role=reads.get("role"),
    )


def _story_ids_known(client, project_id: str, story_ids: set[str]) -> None:
    """422 :data:`STORY_NOT_IN_PROJECT` unless every id is a story of the project. One read."""
    found = (
        client.table("user_stories")
        .select("id")
        .eq("project_id", project_id)
        .in_("id", sorted(story_ids))
        .execute()
    ).data or []
    if {str(r["id"]).lower() for r in found} != story_ids:
        raise HTTPException(status_code=422, detail=STORY_NOT_IN_PROJECT)


def save_document(document_id: UUID, user_id: str, body: dict, base_revision: int | None) -> dict:
    """Save a new revision of the document: the last writer wins.

    Who can call: team members. ``body`` must be the document's kind (422 with the field errors, which
    never echo what was typed), and every story it names must be on the team's board (422
    :data:`STORY_NOT_IN_PROJECT`). ``base_revision`` is the revision the edit started from. Returns
    ``{"revision": n, "overwrote": {"number", "by", "by_name"} | None}``; ``overwrote`` names the
    revision this save replaced when it is not ``base_revision``. A final document stays final.
    Raises 404 for no such document, 403 for staff and anyone else. Round trips: the document, the
    access check, the board's stories when the body names some, the save, and a name when it
    overwrote someone.
    """
    client = get_client()
    document = _load_document(client, document_id)
    access, _ = board_access(client, project_id=document["project_id"], user_id=user_id)
    _require_member(access)
    kind = _kind_of(document)
    try:
        checked = kind.body_model.model_validate(body)
    except ValidationError as exc:
        errors = exc.errors(include_url=False, include_context=False, include_input=False)
        raise HTTPException(
            status_code=422,
            detail=[{**e, "loc": ["body", "body", *e["loc"]]} for e in errors],
        ) from None
    stored = checked.model_dump(mode="json")
    if _too_long(stored):
        raise HTTPException(status_code=422, detail=DOCUMENT_TOO_LONG)
    story_ids = {str(i).lower() for i in checked.story_ids()}
    if story_ids:
        _story_ids_known(client, str(document["project_id"]), story_ids)
    try:
        saved = client.rpc(
            "document_save",
            {
                "p_document_id": str(document["id"]),
                "p_body": stored,
                "p_user": str(user_id),
                "p_source": "edit",
                "p_base": base_revision,
            },
            operation="write",
        ).execute()
    except DatabaseError as exc:
        if exc.pg_code == _NO_DATA_FOUND:
            raise HTTPException(status_code=404, detail=DOCUMENT_NOT_FOUND) from exc
        if exc.pg_code == _CHECK_VIOLATION:
            raise HTTPException(status_code=422, detail=DOCUMENT_TOO_LONG) from exc
        raise
    row = saved.data[0] if isinstance(saved.data, list) else saved.data
    overwrote = None
    if row.get("overwrote_number") is not None:
        by = row.get("overwrote_by")
        overwrote = {
            "number": row["overwrote_number"],
            "by": by,
            "by_name": _names(client, [by]).get(str(by), "Unknown") if by else None,
        }
    return {"revision": row["number"], "overwrote": overwrote}


def list_revisions(document_id: UUID, user_id: str) -> dict:
    """The document's revisions, newest first, without their bodies or snapshots.

    Who can call: team members and class staff. Returns ``{"revisions": [{number, source, saved_by,
    saved_by_name, saved_at, finalized, finalized_at}]}``; ``finalized`` marks every revision that was
    handed in, and ``finalized_at`` says when. Raises 404 for no such document, 403 for anyone else.
    """
    client = get_client()
    document = _load_document(client, document_id)
    board_access(client, project_id=document["project_id"], user_id=user_id)
    _kind_of(document)
    rows = (
        client.table("project_document_revisions")
        .select(f"number, source, saved_by, saved_at, finalized_at, {_SAVER}")
        .eq("document_id", str(document["id"]))
        .order("number", desc=True)
        .execute()
    ).data or []
    return {
        "revisions": [
            {
                "number": r["number"],
                "source": r.get("source"),
                "saved_by": r.get("saved_by"),
                "saved_by_name": _saver_name(r),
                "saved_at": r.get("saved_at"),
                "finalized": r.get("finalized_at") is not None,
                "finalized_at": r.get("finalized_at"),
            }
            for r in rows
        ]
    }


def _require_team_role(client, document: dict, user_id: str, denied: str) -> tuple[str | None, str]:
    """Finalizing and deleting: 403 :data:`MEMBERS_ONLY` for staff and ``denied`` for a member
    without a finalizing role (a stranger gets the board's 403). Returns the project's school and the
    caller's role."""
    access, institution_id = board_access(
        client, project_id=document["project_id"], user_id=user_id
    )
    _require_member(access)
    role = authz.get_project_role(client, document["project_id"], user_id)
    if role not in FINALIZE_ROLES:
        raise HTTPException(status_code=403, detail=denied)
    return institution_id, role


def finalize_document(document_id: UUID, user_id: str, revision: int) -> dict:
    """Hand in the document at ``revision``, which must still be the head: its derived sections are
    worked out from the board, checked, and frozen on that revision (its snapshot); the document turns
    final; the team's TAs are told (``notify.py``).

    Who can call: the team's Scrum Master, Product Owner, owner or admin. Returns the document as
    :func:`get_document` does. Finalizing the revision that is already the finalized one changes and
    tells nothing, also when another finalizer got there first (``document_finalize`` answers NULL):
    the answer is then what was handed in. Raises 404 for no such document, 403 (see
    :func:`_require_team_role`), 409
    :data:`DOCUMENT_CHANGED` when another revision was saved since, and 409 with the first of the
    kind's blocking checks that fails.
    """
    client = get_client()
    document = _load_document(client, document_id)
    institution_id, role = _require_team_role(client, document, user_id, FINALIZE_DENIED)
    kind = _kind_of(document)
    if revision != document["head_revision"]:
        raise HTTPException(status_code=409, detail=DOCUMENT_CHANGED)
    zone = institution_timezone(institution_id)
    already = document.get("finalized_revision") == revision
    pid = str(document["project_id"])

    jobs = {"revision": lambda: _revision(client, document["id"], revision)}
    if not already:
        jobs["project"] = lambda: authz.load_project(
            client, pid, columns="id, name, class_id, assigned_ta_id"
        )
    jobs.update(_context_jobs(client, document, kind, board=not already))
    reads = fan_out(jobs)
    found = reads["revision"]
    if found is None:
        raise HTTPException(status_code=404, detail=REVISION_NOT_FOUND)
    ctx = _context(reads, document, zone)
    if already:
        derived, frozen = _derived(client, document, kind, found, ctx, board_read=False)
        return _view(
            document,
            kind,
            ctx,
            found,
            derived,
            frozen=frozen,
            access="member",
            role=role,
        )

    derived = kind.derive(ctx, found["body"])
    failures = kind.blocking_checks(ctx, found["body"], derived)
    if failures:
        raise HTTPException(status_code=409, detail=failures[0])
    if _too_long(derived):
        raise HTTPException(status_code=409, detail=DOCUMENT_TOO_LONG)
    try:
        handed_in = client.rpc(
            "document_finalize",
            {
                "p_document_id": str(document["id"]),
                "p_revision": revision,
                "p_snapshot": derived,
                "p_user": str(user_id),
            },
            operation="write",
        ).execute()
    except DatabaseConflictError as exc:
        raise HTTPException(status_code=409, detail=DOCUMENT_CHANGED) from exc
    except DatabaseError as exc:
        if exc.pg_code == _NO_DATA_FOUND:
            raise HTTPException(status_code=404, detail=DOCUMENT_NOT_FOUND) from exc
        if exc.pg_code == _CHECK_VIOLATION:
            raise HTTPException(status_code=409, detail=DOCUMENT_TOO_LONG) from exc
        raise
    if handed_in.data is None:
        # Another finalizer handed this revision in after our read: nothing was written. Answer what
        # they handed in, and tell nobody twice.
        stored = fan_out(
            {
                "document": lambda: _load_document(client, document["id"]),
                "revision": lambda: _revision(client, document["id"], revision),
            }
        )
        found = stored["revision"] or found
        derived, frozen = _derived(client, stored["document"], kind, found, ctx, board_read=True)
        return _view(
            stored["document"], kind, ctx, found, derived, frozen=frozen, access="member", role=role
        )

    project = reads["project"]
    title = title_of(kind, ctx.sprint)
    notify.notify_finalized(
        client,
        project=project,
        document_id=str(document["id"]),
        document_title=title,
        revision=revision,
        finalizer_id=str(user_id),
    )
    after = _load_document(client, document["id"])
    class_id = project.get("class_id")
    events.record(
        "document_finalized",
        actor_id=str(user_id),
        class_id=str(class_id) if class_id else None,
        project_id=pid,
        meta={"kind": kind.name},
    )
    return _view(
        after,
        kind,
        ctx,
        {**found, "snapshot": derived, "finalized_at": after.get("finalized_at")},
        derived,
        frozen=True,
        access="member",
        role=role,
    )


def delete_document(document_id: UUID, user_id: str) -> None:
    """Delete a document that was never finalized, with its revisions.

    Who can call: the team's Scrum Master, Product Owner, owner or admin. Raises 404 for no such
    document, 403 (see :func:`_require_team_role`, with :data:`DELETE_DENIED`), and 409
    :data:`DOCUMENT_FINAL` for one that was finalized, also when that happened just before.
    """
    client = get_client()
    document = _load_document(client, document_id)
    _require_team_role(client, document, user_id, DELETE_DENIED)
    if document.get("finalized_revision") is not None:
        raise HTTPException(status_code=409, detail=DOCUMENT_FINAL)
    deleted = (
        client.table("project_documents")
        .delete()
        .eq("id", str(document["id"]))
        .is_("finalized_revision", "null")
        .execute()
    ).data
    if not deleted:
        # Finalized, or deleted, since the read above.
        still = (
            client.table("project_documents")
            .select("id")
            .eq("id", str(document["id"]))
            .limit(1)
            .execute()
        ).data
        if still:
            raise HTTPException(status_code=409, detail=DOCUMENT_FINAL)
        raise HTTPException(status_code=404, detail=DOCUMENT_NOT_FOUND)


def _slug(*parts: str) -> str:
    """ASCII words joined by hyphens, for a file name."""
    text = unicodedata.normalize("NFKD", " ".join(parts)).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:80].rstrip("-") or "document"


def _board_url(project_id: str, sprint_id: str) -> str:
    return f"{frontend_url()}/app/projects/{project_id}/board?view=burnup&sprint={sprint_id}"


def document_markdown(document_id: UUID, user_id: str) -> tuple[str, str]:
    """The document as Markdown, in its template's order: the finalized revision of a final document
    (with its snapshot and its finalized date), else the head (derived from the board now, dated today).

    Who can call: team members and class staff. Returns ``(file name, text)``. Raises 404 for no such
    document, 403 for anyone else.
    """
    client = get_client()
    document = _load_document(client, document_id)
    _, institution_id = board_access(client, project_id=document["project_id"], user_id=user_id)
    kind = _kind_of(document)
    zone = institution_timezone(institution_id)
    today = school_today(zone)
    final = document.get("finalized_revision")
    number = final if final is not None else document["head_revision"]
    pid = str(document["project_id"])
    jobs = {
        "revision": lambda: _revision(client, document["id"], number),
        "project": lambda: authz.load_project(client, pid, columns="id, name"),
    }
    jobs.update(_context_jobs(client, document, kind, board=final is None))
    reads = fan_out(jobs)
    found = reads["revision"]
    if found is None:
        raise HTTPException(status_code=404, detail=REVISION_NOT_FOUND)
    ctx = _context(reads, document, zone)
    derived, _ = _derived(client, document, kind, found, ctx, board_read=final is None)
    finalized_at = document.get("finalized_at")
    project_name = reads["project"].get("name") or ""
    heading = Heading(
        project_name=project_name,
        date=school_day(finalized_at, zone) if final is not None and finalized_at else today,
        sprint_name=ctx.sprint["name"] if ctx.sprint else None,
        board_url=_board_url(pid, ctx.sprint["id"]) if kind.per_sprint and ctx.sprint else None,
    )
    text = kind.render(heading, found["body"], derived)
    return f"{_slug(project_name, title_of(kind, ctx.sprint))}.md", text


def list_class_documents(class_id: UUID, user_id: str) -> dict:
    """Every document of the class's teams, for its staff.

    Who can call: the class instructor and its TAs. Returns ``{"documents": [{id, kind, title,
    project_id, project_name, sprint_name, status, head_revision, finalized_revision, edited_since,
    updated_at}]}``, team by team (by name), each team's in the order of its Documents tab. Raises 404
    for no such class, 403 :data:`CLASS_STAFF_ONLY` for anyone else. Round trips: the class (and the
    caller's enrollment, for a TA), then the teams with their documents in one read.
    """
    client = get_client()
    access = authz.get_class_access(client, user_id, class_id)
    if access is None:
        raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
    if not access["is_instructor"] and access["enrollment_role"] != authz.ROLE_TA:
        raise HTTPException(status_code=403, detail=CLASS_STAFF_ONLY)
    teams = (
        client.table("projects")
        .select(
            "id, name, project_documents(id, kind, sprint_id, status, head_revision, "
            "finalized_revision, updated_at, sprints(name, starts_at))"
        )
        .eq("class_id", str(class_id))
        .order("name")
        .execute()
    ).data or []

    def place(doc: dict) -> tuple:
        sprint = doc.get("sprints") or {}
        return ORDER.index(doc["kind"]), str(sprint.get("starts_at") or ""), str(doc["id"])

    rows = []
    for team in teams:
        documents = [d for d in team.get("project_documents") or [] if d["kind"] in KINDS]
        for doc in sorted(documents, key=place):
            sprint = doc.get("sprints")
            rows.append(
                {
                    "id": doc["id"],
                    "kind": doc["kind"],
                    "title": title_of(KINDS[doc["kind"]], sprint),
                    "project_id": team["id"],
                    "project_name": team.get("name"),
                    "sprint_name": sprint["name"] if sprint else None,
                    "status": doc["status"],
                    "head_revision": doc["head_revision"],
                    "finalized_revision": doc.get("finalized_revision"),
                    "edited_since": _edited_since(doc),
                    "updated_at": doc.get("updated_at"),
                }
            )
    return {"documents": rows}
