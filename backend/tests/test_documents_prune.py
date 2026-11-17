"""The pruning rule of ``prune_document_revisions`` (2026-11-17_project_documents.sql), as the documents
tests' fake imitates it: a document keeps its head and finalized revisions, and loses the others once its
sprint ended 7 days ago (a sprint's document) or its class's last day was 30 days ago (a project's). The
SQL itself is checked by the migration's rehearsal on DEV; this pins what the rehearsal must show.
"""

from __future__ import annotations

from datetime import date

import pytest

from tests.documents_support import (
    S2,
    add_document,
    board_tables,
    documents_db,
    pin_today,
    revisions,
)

SPRINT_2_ENDS = date(2026, 9, 27)


def _prune(db) -> int:
    return db.rpcs["prune_document_revisions"]({})


@pytest.mark.parametrize(
    ("today", "kept"),
    [(date(2026, 10, 3), [1, 2, 3, 4]), (date(2026, 10, 4), [2, 4])],
    ids=["6 days after the sprint", "7 days after"],
)
def test_a_sprints_document_keeps_its_head_and_finalized_revisions(monkeypatch, today, kept):
    pin_today(monkeypatch, SPRINT_2_ENDS)
    db = documents_db(monkeypatch, **board_tables())
    doc = add_document(db, "sprint_report", sprint_id=S2, saves=1, finalize=True)
    for _ in range(2):  # revisions 3 and 4, saved after the finalize at 2
        db.rpcs["document_save"](
            {"p_document_id": doc, "p_body": {}, "p_user": "u", "p_source": "edit", "p_base": None}
        )
    pin_today(monkeypatch, today)

    assert _prune(db) == 4 - len(kept)
    assert [r["number"] for r in revisions(db, doc)] == kept


@pytest.mark.parametrize(
    ("end_date", "kept"),
    [("2026-09-02", [3]), ("2026-09-03", [1, 2, 3]), (None, [1, 2, 3])],
    ids=["30 days after the class", "29 days after", "a class with no last day"],
)
def test_a_projects_document_waits_for_its_class_to_end(monkeypatch, end_date, kept):
    pin_today(monkeypatch, date(2026, 10, 2))
    db = documents_db(monkeypatch, **board_tables())
    db.rows("classes")[0]["end_date"] = end_date
    doc = add_document(db, "release_summary", saves=2)

    _prune(db)

    assert [r["number"] for r in revisions(db, doc)] == kept
