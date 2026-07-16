"""Server-side messageable-users list."""
from __future__ import annotations
from unittest.mock import MagicMock, patch


def _wire(client, *, owned, enrolled, class_enrollments, class_owners, profiles):
    """Route table() calls to canned data by table + call order."""
    def table(name):
        m = MagicMock()
        chain = m.select.return_value
        if name == "classes":
            # 1st: caller-owned classes (.eq); 2nd: owners of class ids (.in_)
            chain.eq.return_value.execute.return_value = MagicMock(data=owned)
            chain.in_.return_value.execute.return_value = MagicMock(data=class_owners)
        elif name == "class_enrollments":
            chain.eq.return_value.execute.return_value = MagicMock(data=enrolled)
            chain.in_.return_value.execute.return_value = MagicMock(data=class_enrollments)
        elif name == "profiles":
            chain.in_.return_value.execute.return_value = MagicMock(data=profiles)
        return m
    client.table.side_effect = table


@patch("app.messages.controller.service_client")
def test_contacts_excludes_self_and_instructor_pairs(client):
    from app.messages.controller import list_contacts
    _wire(
        client,
        owned=[{"id": "cls1", "created_by": "prof"}],   # caller owns cls1
        enrolled=[],
        class_enrollments=[
            {"class_id": "cls1", "user_id": "stu1"},
            {"class_id": "cls1", "user_id": "prof"},
        ],
        class_owners=[{"id": "cls1", "created_by": "prof2"}],
        profiles=[
            {"id": "prof", "role": "instructor", "email": "p@u.e",
             "first_name": "Pat", "last_name": "Prof", "image_url": None},
            {"id": "prof2", "role": "instructor", "email": "p2@u.e",
             "first_name": "Pam", "last_name": "Prof", "image_url": None},
            {"id": "stu1", "role": "student", "email": "s@u.e",
             "first_name": "Sam", "last_name": "Stu", "image_url": None},
        ],
    )
    contacts = list_contacts(caller_id="prof")
    ids = {c["id"] for c in contacts}
    assert "stu1" in ids          # student peer included
    assert "prof" not in ids      # never include self
    assert "prof2" not in ids     # instructor↔instructor excluded


@patch("app.messages.controller.service_client")
def test_contacts_query_filters_by_name(client):
    from app.messages.controller import list_contacts
    _wire(
        client,
        owned=[],
        enrolled=[{"class_id": "cls1"}],
        class_enrollments=[
            {"class_id": "cls1", "user_id": "stu1"},
            {"class_id": "cls1", "user_id": "stu2"},
        ],
        class_owners=[],
        profiles=[
            {"id": "me", "role": "student", "email": "me@u.e",
             "first_name": "Me", "last_name": "M", "image_url": None},
            {"id": "stu1", "role": "student", "email": "s@u.e",
             "first_name": "Samantha", "last_name": "Stone", "image_url": None},
            {"id": "stu2", "role": "student", "email": "j@u.e",
             "first_name": "Jo", "last_name": "Jones", "image_url": None},
        ],
    )
    contacts = list_contacts(caller_id="me", query="stone")
    assert [c["id"] for c in contacts] == ["stu1"]
