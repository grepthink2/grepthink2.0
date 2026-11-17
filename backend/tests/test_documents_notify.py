"""Who hears that a team finalized a document, and what the email says (``app.documents.notify``)."""

from __future__ import annotations

import pytest

from app.core.db import get_client
from app.documents import notify
from app.notifications.controller import NOTIFICATION_TYPES
from app.outbox.kinds import get_kind
from tests.documents_support import CLASS, MEETING_TA, PID, REVIEW_TA, SM, documents_db

PROJECT = {"id": PID, "name": "Trailhead", "class_id": CLASS, "assigned_ta_id": MEETING_TA}


@pytest.mark.parametrize(
    ("assigned", "review", "finalizer", "expected"),
    [
        (MEETING_TA, [REVIEW_TA], SM, [MEETING_TA, REVIEW_TA]),
        (MEETING_TA, [MEETING_TA], SM, [MEETING_TA]),  # one TA in both seats hears once
        (MEETING_TA, [REVIEW_TA], MEETING_TA, [REVIEW_TA]),  # never the finalizer
        (MEETING_TA.upper(), [], MEETING_TA, []),  # ids compare in any case
        (None, [], SM, []),
    ],
)
def test_the_recipients_are_the_teams_tas_once_without_the_finalizer(
    assigned, review, finalizer, expected
):
    project = {**PROJECT, "assigned_ta_id": assigned}
    assert notify.recipients(project, review, finalizer) == expected


def test_a_team_without_tas_costs_one_read_and_tells_nobody(monkeypatch):
    db = documents_db(monkeypatch, project_review_tas=[])
    notify.notify_finalized(
        get_client(),
        project={**PROJECT, "assigned_ta_id": None},
        document_id="d1",
        document_title="Release summary",
        revision=1,
        finalizer_id=SM,
    )
    assert db.executes == 1
    assert db.rows("notifications") == [] and db.rows("email_outbox") == []


def test_a_ta_without_an_email_address_is_told_in_the_app_only(monkeypatch):
    db = documents_db(monkeypatch)
    next(p for p in db.rows("profiles") if p["id"] == REVIEW_TA)["email"] = None

    notify.notify_finalized(
        get_client(),
        project=PROJECT,
        document_id="d1",
        document_title="Release summary",
        revision=3,
        finalizer_id=SM,
    )

    assert sorted(n["user_id"] for n in db.rows("notifications")) == sorted([MEETING_TA, REVIEW_TA])
    assert [e["user_id"] for e in db.rows("email_outbox")] == [MEETING_TA]


def test_a_retried_notice_names_the_same_keys(monkeypatch):
    """The outbox turns away a dedupe key it holds (its unique key, an upsert that ignores duplicates):
    a second notice of one revision names the same keys, so it queues nothing new."""
    documents_db(monkeypatch)
    queued: list[list[str]] = []

    def enqueue(client, rows, **options):
        queued.append(sorted(row.dedupe_key for row in rows))

    monkeypatch.setattr("app.outbox.controller.enqueue", enqueue)
    for _ in range(2):
        notify.notify_finalized(
            get_client(),
            project=PROJECT,
            document_id="d1",
            document_title="Release summary",
            revision=3,
            finalizer_id=SM,
        )
    assert (
        queued
        == [
            sorted(
                [f"document_finalized:d1:3:{MEETING_TA}", f"document_finalized:d1:3:{REVIEW_TA}"]
            )
        ]
        * 2
    )


def test_the_email_names_the_team_and_the_document_and_links_to_it():
    rendered = notify.render_document_finalized(
        {
            "project_name": "Trail<head>",
            "document_title": "Sprint 2 report",
            "link": "https://grepthink.example/app/projects/p/documents/d?x=1&y=2",
        }
    )
    assert rendered.subject == "Trail<head> finalized its Sprint 2 report"
    assert "https://grepthink.example/app/projects/p/documents/d?x=1&y=2" in rendered.text
    assert "Trail&lt;head&gt;" in rendered.html and "Trail<head>" not in rendered.html
    assert (
        'href="https://grepthink.example/app/projects/p/documents/d?x=1&amp;y=2"' in rendered.html
    )


def test_a_line_break_in_a_name_stays_out_of_the_subject():
    rendered = notify.render_document_finalized(
        {"project_name": "Trail\nhead", "document_title": "Release summary", "link": "https://x"}
    )
    assert rendered.subject == "Trail head finalized its Release summary"


def test_the_email_is_a_transactional_outbox_kind_and_the_notice_a_known_type():
    kind = get_kind("document_finalized")
    assert kind is not None and kind.category is None
    assert kind.render is notify.render_document_finalized
    assert "document_finalized" in NOTIFICATION_TYPES
