"""Teaching Assistant (TA) views — parameter handling and responses."""
from uuid import UUID
from fastapi import Depends
from app.dependencies import require_user, require_instructor
from app.tas.models import (
    TaUserRequest,
    SetReviewWindowRequest,
    SetReviewTaRequest,
    SetReviewZoomRequest,
    SetFinalReviewTimeRequest,
    SaveFinalReviewScoresRequest,
    SaveFinalReviewNotesRequest,
)
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


def list_project_tas(
    project_id: UUID,
    user_id: str = Depends(require_user),
):
    return {"tas": controller.list_project_tas(user_id, project_id)}


# ----- End-of-quarter review (additional reviewer) --------------------------

def set_review_window(
    class_id: UUID,
    data: SetReviewWindowRequest,
    user_id: str = Depends(require_instructor),
):
    return controller.set_review_window(user_id, class_id, data.open)


def list_project_review_tas(
    project_id: UUID,
    user_id: str = Depends(require_user),
):
    return controller.list_project_review_tas(user_id, project_id)


def set_review_ta(
    project_id: UUID,
    data: SetReviewTaRequest,
    user_id: str = Depends(require_user),
):
    return controller.set_review_ta(user_id, project_id, data.user_id)


def release_review_ta(
    project_id: UUID,
    target_user_id: UUID,
    user_id: str = Depends(require_user),
):
    return controller.release_review_ta(user_id, project_id, target_user_id)


# ----- Final Reviews: schedule + shared Zoom --------------------------------

def set_review_zoom(
    class_id: UUID,
    data: SetReviewZoomRequest,
    user_id: str = Depends(require_instructor),
):
    return controller.set_review_zoom(user_id, class_id, data.zoom_url)


def set_final_review_time(
    project_id: UUID,
    data: SetFinalReviewTimeRequest,
    user_id: str = Depends(require_instructor),
):
    return controller.set_final_review_time(user_id, project_id, data.scheduled_at)


def get_final_review_schedule(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    return controller.get_final_review_schedule(user_id, class_id)


# ----- Final Reviews: per-team scoring + Review-TA notes ---------------------
# Role-specific authz (Home TA / Review TA / instructor) lives in the
# controller — these callers are class TAs, not platform instructors.

def get_final_review_detail(
    project_id: UUID,
    user_id: str = Depends(require_user),
):
    return controller.get_final_review_detail(user_id, project_id)


def save_final_review_scores(
    project_id: UUID,
    data: SaveFinalReviewScoresRequest,
    user_id: str = Depends(require_user),
):
    # exclude_unset preserves the "was this key even sent" distinction the
    # controller relies on to tell an explicit null (clear this score) apart
    # from a field the client never mentioned (400, same as always) — the
    # default model_dump() fills in every Optional field's None default and
    # erases that distinction, which would make an absent key look identical
    # to an explicit clear.
    entries = [
        {**e.model_dump(exclude_unset=True), "student_id": str(e.student_id)}
        for e in data.scores
    ]
    return controller.save_final_review_scores(user_id, project_id, data.role, entries)


def save_final_review_notes(
    project_id: UUID,
    data: SaveFinalReviewNotesRequest,
    user_id: str = Depends(require_user),
):
    return controller.save_final_review_notes(user_id, project_id, data.content, data.template_version)
