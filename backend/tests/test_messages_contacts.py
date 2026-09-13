"""Server-side messageable-users list.

Scenario tests against FakeSupabase. Round-trip budgets and the exact response
shape and ordering are pinned in test_messages_batching.py. The foreign keys
list_contacts embeds over are declared here, just as PostgREST needs them.
"""

from __future__ import annotations

import pytest

from app.messages.controller import list_contacts
from tests.fake_supabase import FakeSupabase

RELATIONS = {
    ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
    ("classes", "class_enrollments!class_enrollments_class_id_fkey"): ("id", "class_id", True),
    ("class_enrollments", "classes!class_enrollments_class_id_fkey"): ("class_id", "id", False),
    ("class_enrollments", "profiles!class_enrollments_user_id_fkey"): ("user_id", "id", False),
}


def _profile(uid, role, email, first, last):
    return {
        "id": uid,
        "role": role,
        "email": email,
        "first_name": first,
        "last_name": last,
        "image_url": None,
    }


@pytest.fixture
def seed(monkeypatch):
    """Install a FakeSupabase holding the given tables as the service client."""

    def install(**tables):
        fake = FakeSupabase(relations=RELATIONS, **tables)
        monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
        return fake

    return install


def test_contacts_excludes_self_and_instructor_pairs(seed):
    # prof (instructor) owns cls1 and is enrolled in it too; prof2 (instructor)
    # owns cls2, where prof is a TA.
    seed(
        classes=[{"id": "cls1", "created_by": "prof"}, {"id": "cls2", "created_by": "prof2"}],
        class_enrollments=[
            {"class_id": "cls1", "user_id": "stu1"},
            {"class_id": "cls1", "user_id": "prof"},
            {"class_id": "cls2", "user_id": "prof", "enrollment_role": "ta"},
        ],
        profiles=[
            _profile("prof", "instructor", "p@u.e", "Pat", "Prof"),
            _profile("prof2", "instructor", "p2@u.e", "Pam", "Prof"),
            _profile("stu1", "student", "s@u.e", "Sam", "Stu"),
        ],
    )
    contacts = list_contacts(caller_id="prof")
    ids = {c["id"] for c in contacts}
    assert "stu1" in ids  # student peer included
    assert "prof" not in ids  # never include self
    assert "prof2" not in ids  # instructor↔instructor excluded


def test_contacts_query_filters_by_name(seed):
    seed(
        classes=[{"id": "cls1", "created_by": "prof"}],
        class_enrollments=[
            {"class_id": "cls1", "user_id": "me"},
            {"class_id": "cls1", "user_id": "stu1"},
            {"class_id": "cls1", "user_id": "stu2"},
        ],
        profiles=[
            _profile("prof", "instructor", "p@u.e", "Pat", "Prof"),
            _profile("me", "student", "me@u.e", "Me", "M"),
            _profile("stu1", "student", "s@u.e", "Samantha", "Stone"),
            _profile("stu2", "student", "j@u.e", "Jo", "Jones"),
        ],
    )
    contacts = list_contacts(caller_id="me", query="stone")
    assert [c["id"] for c in contacts] == ["stu1"]


def test_contacts_drops_peers_without_profiles_row(seed):
    """Pin the documented decision: a peer id present in class_enrollments
    but absent from profiles (orphaned enrollment / auth-glue gap) is
    silently omitted — never an error, never an unnameable contact."""
    seed(
        # The owner has no profiles row either, so stu1 is the only nameable peer.
        classes=[{"id": "cls1", "created_by": "ghost-owner"}],
        class_enrollments=[
            {"class_id": "cls1", "user_id": "me"},
            {"class_id": "cls1", "user_id": "stu1"},
            {"class_id": "cls1", "user_id": "ghost"},  # no profiles row
        ],
        profiles=[
            _profile("me", "student", "me@u.e", "Me", "M"),
            _profile("stu1", "student", "s@u.e", "Sam", "Stu"),
        ],
    )
    contacts = list_contacts(caller_id="me")
    assert [c["id"] for c in contacts] == ["stu1"]  # ghost dropped, no 500
