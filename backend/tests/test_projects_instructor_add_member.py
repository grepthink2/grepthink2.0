"""Regression tests for the instructor_add_member bug cluster.

Two bugs lived here on the feat/messages branch:
  - BUG-1: the existing-membership pre-check was not scoped to project_id,
    so being a member of any project routed the caller through the
    role-update path.
  - BUG-2: that role-update path then updated requester_id's role instead
    of target_user_id's, demoting the instructor.

These tests mock the Supabase client chain and assert the corrected
query shape so the bugs can't silently regress.
"""
from __future__ import annotations
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.projects import controller


def _chain(execute_data):
    """One chained mock for `.select/.update/.insert/.eq/.neq/.execute`."""
    c = MagicMock()
    c.select.return_value = c
    c.update.return_value = c
    c.insert.return_value = c
    c.eq.return_value = c
    c.neq.return_value = c
    c.execute.return_value = MagicMock(data=execute_data)
    return c


def _client_with_chains(*chains_in_call_order):
    """Build a client whose successive `.table(...)` calls return the given chains."""
    client = MagicMock()
    client.table = MagicMock(side_effect=list(chains_in_call_order))
    return client


@patch("app.projects.controller._is_instructor", return_value=True)
@patch("app.projects.controller.service_client")
def test_membership_precheck_is_scoped_to_project_id(svc, _is_inst):
    """The pre-check must filter by project_id (regression of BUG-1).

    Calls in order:
      1. projects → fetch class_id
      2. project_members → membership check (this is the one we assert on)
      3. project_members → insert new member
      4. project_members → _auto_assign_scrum_master existing-SM check
         (returns an existing scrum master, so no promotion update runs)
      5. projects → fetch num_members
      6. projects → update num_members
    """
    project_lookup = _chain([{"class_id": "cls-1"}])
    membership_check = _chain([])
    insert_member = _chain([{}])
    scrum_master_check = _chain([{"user_id": "existing-sm"}])
    num_lookup = _chain([{"num_members": 0}])
    num_update = _chain([{}])

    client = _client_with_chains(
        project_lookup, membership_check, insert_member,
        scrum_master_check, num_lookup, num_update,
    )
    svc.table = client.table

    controller.instructor_add_member(
        project_id="proj-1",
        requester_id="instructor-1",
        target_user_id="alice",
        role="member",
    )

    eq_calls = [c.args for c in membership_check.eq.call_args_list]
    assert ("project_id", "proj-1") in eq_calls, (
        "membership pre-check is not scoped to project_id (BUG-1 regression)"
    )
    assert ("user_id", "alice") in eq_calls


@patch("app.projects.controller._is_instructor", return_value=True)
@patch("app.projects.controller.service_client")
def test_role_update_targets_the_target_not_the_requester(svc, _is_inst):
    """When the user is already a member, the role update must touch target_user_id (BUG-2)."""
    project_lookup = _chain([{"class_id": "cls-1"}])
    membership_check = _chain([{"user_id": "alice"}])  # already a member
    role_update = _chain([{}])

    client = _client_with_chains(project_lookup, membership_check, role_update)
    svc.table = client.table

    result = controller.instructor_add_member(
        project_id="proj-1",
        requester_id="instructor-1",
        target_user_id="alice",
        role="member",
    )

    eq_calls = [c.args for c in role_update.eq.call_args_list]
    assert ("user_id", "alice") in eq_calls, (
        "role update should target target_user_id (BUG-2 regression)"
    )
    assert ("user_id", "instructor-1") not in eq_calls, (
        "role update must not target requester_id (BUG-2 regression)"
    )
    assert result["member"] == "alice"


@patch("app.projects.controller._is_instructor", return_value=True)
@patch("app.projects.controller.service_client")
def test_owner_demotion_excludes_target_not_requester(svc, _is_inst):
    """Demoting other owners should exclude the new owner (target), not the instructor."""
    project_lookup = _chain([{"class_id": "cls-1"}])
    membership_check = _chain([{"user_id": "alice"}])
    role_update = _chain([{}])
    demote_others = _chain([{}])

    client = _client_with_chains(
        project_lookup, membership_check, role_update, demote_others,
    )
    svc.table = client.table

    controller.instructor_add_member(
        project_id="proj-1",
        requester_id="instructor-1",
        target_user_id="alice",
        role="scrum master",
    )

    neq_calls = [c.args for c in demote_others.neq.call_args_list]
    assert ("user_id", "alice") in neq_calls, (
        "demotion should exclude target_user_id (BUG-2 regression)"
    )


@patch("app.projects.controller.service_client")
def test_missing_project_raises_404_not_returns_false(svc):
    """The project-not-found branch used to `return False` (contract mismatch)."""
    not_found = _chain([])
    client = _client_with_chains(not_found)
    svc.table = client.table

    with pytest.raises(HTTPException) as exc:
        controller.instructor_add_member(
            project_id="missing",
            requester_id="instructor-1",
            target_user_id="alice",
            role="member",
        )
    assert exc.value.status_code == 404
