"""Teaching Assistant (TA) views — parameter handling and responses."""
from uuid import UUID
from fastapi import Depends
from app.dependencies import require_user, require_instructor
from app.tas.models import TaUserRequest
from app.tas import controller


def promote_to_ta(
    class_id: UUID,
    data: TaUserRequest,
    user_id: str = Depends(require_instructor),
):
    return controller.promote_to_ta(user_id, class_id, data.user_id)


def demote_ta(
    class_id: UUID,
    data: TaUserRequest,
    user_id: str = Depends(require_instructor),
):
    return controller.demote_ta(user_id, class_id, data.user_id)


def list_class_tas(
    class_id: UUID,
    user_id: str = Depends(require_instructor),
):
    return {"tas": controller.list_class_tas(user_id, class_id)}


def get_my_enrollment_role(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    return controller.get_my_enrollment_role(user_id, class_id)


def get_ta_review_targets(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    return controller.get_ta_review_targets(user_id, class_id)


def assign_ta_to_project(
    project_id: UUID,
    data: TaUserRequest,
    user_id: str = Depends(require_instructor),
):
    return controller.assign_ta_to_project(user_id, project_id, data.user_id)


def remove_ta_from_project(
    project_id: UUID,
    target_user_id: UUID,
    user_id: str = Depends(require_instructor),
):
    return controller.remove_ta_from_project(user_id, project_id, target_user_id)


def list_project_tas(
    project_id: UUID,
    user_id: str = Depends(require_user),
):
    return {"tas": controller.list_project_tas(user_id, project_id)}
