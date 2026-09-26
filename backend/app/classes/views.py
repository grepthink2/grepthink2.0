"""
Classes views — parameter handling and responses
"""

from uuid import UUID

from fastapi import Depends, File, HTTPException, UploadFile

from app.auth.controller import get_user_role
from app.classes import controller
from app.classes.models import (
    AddManualRosterStudentRequest,
    BulkInviteRequest,
    CancelInviteResponse,
    CreateClassRequest,
    InviteStudentRequest,
    JoinClassRequest,
    QueueInviteRequest,
    QueueInviteResponse,
    UpdateClassStatusRequest,
)
from app.dependencies import require_instructor, require_user


def create_class(data: CreateClassRequest, user_id: str = Depends(require_instructor)):
    result = controller.create_class(
        data.name,
        data.description,
        data.term,
        data.start_date,
        user_id,
        tsr_count=data.tsr_count,
        institution_id=data.institution_id,
    )
    return {"message": "Class created successfully", "class": result}


def get_classes(user_id: str = Depends(require_user)):
    """Every class the caller created or is enrolled in, each with the caller's ``my_role``."""
    return {"classes": controller.get_classes_for_user(user_id)}


def get_class(class_id: UUID, user_id: str = Depends(require_user)):
    class_data = controller.get_class_by_id(class_id)
    return {"class": class_data}


def update_class_status(
    class_id: UUID,
    data: UpdateClassStatusRequest,
    user_id: str = Depends(require_user),
):
    """Set class lifecycle status to active or complete (the class instructor; checked in
    the controller)."""
    updated = controller.update_class_status(class_id, data.status, user_id)
    return {"message": "Class status updated", "class": updated}


def join_class(data: JoinClassRequest, user_id: str = Depends(require_user)):
    """Join a class with its course code. Any account that has picked a role may join (as a
    student; the instructor can then make them a TA). The class instructor cannot join their own
    class (409, checked in the controller)."""
    if get_user_role(user_id) is None:
        raise HTTPException(
            status_code=403, detail="Choose whether you are a student or an instructor first"
        )
    return controller.join_class_by_code(data.course_code, user_id)


def invite_student(
    class_id: UUID,
    data: InviteStudentRequest,
    user_id: str = Depends(require_user),
):
    """Invite a student to the class by email (the class instructor; checked in the
    controller)."""
    return controller.invite_student_to_class(class_id, data.student_email, user_id)


def get_class_students(class_id: UUID, user_id: str = Depends(require_user)):
    """Enrolled students with their team (class instructor or enrolled members)."""
    students = controller.get_class_students(class_id, user_id)
    return {"students": students}


def get_class_roster(class_id: UUID, user_id: str = Depends(require_user)):
    """Merged official roster + GrepThink enrollment status."""
    return controller.get_class_roster(class_id, user_id)


def get_attention_summary(user_id: str = Depends(require_user)):
    """Roster upload date and registered-but-not-on-roster count for every class the
    caller created (instructor home page)."""
    return controller.get_attention_summary(user_id=user_id)


def get_class_roster_timeline(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Enrollment, team-join, and drop dates for each roster student (the class instructor;
    checked in the controller)."""
    return controller.get_class_roster_timeline(class_id, user_id)


async def upload_class_roster(
    class_id: UUID,
    file: UploadFile = File(...),
    user_id: str = Depends(require_user),
):
    """Replace the class roster from a UCSC CSV export (the class instructor; checked in the
    controller)."""
    raw = await file.read()
    try:
        csv_text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded") from exc
    return controller.upload_class_roster(class_id, csv_text, user_id)


def add_manual_roster_student(
    class_id: UUID,
    data: AddManualRosterStudentRequest,
    user_id: str = Depends(require_user),
):
    """Manually add a student to the roster (the class instructor; checked in the controller)."""
    return controller.add_manual_roster_student(
        class_id,
        data.first_name,
        data.last_name,
        data.email,
        user_id,
    )


def delete_manual_roster_entry(
    class_id: UUID,
    entry_id: str,
    user_id: str = Depends(require_user),
):
    """Delete a manually-added roster row (the class instructor; checked in the controller)."""
    return controller.delete_manual_roster_entry(class_id, entry_id, user_id)


def get_class_projects(class_id: UUID, user_id: str = Depends(require_user)):
    """Get all projects for a class (visible to enrolled students and class teacher).

    Sentiment visibility is this class's instructor relationship, not the caller's account-wide
    role — the controller decides it from the access check, not from ``get_user_role``.
    """
    projects = controller.get_class_projects(class_id, user_id)
    return {"projects": projects}


def get_class_projects_overview(class_id: UUID, user_id: str = Depends(require_user)):
    """Projects + enrolled-student list for the Projects page in a single call."""
    return controller.get_class_projects_overview(class_id, user_id)


def get_class_turn_in_stats(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """TSR turn-in stats for the class's current assignment (the class instructor; checked
    in the controller)."""
    turn_in = controller.get_class_turn_in_stats(class_id, user_id)
    return {"turn_in": turn_in}


def remove_student(
    class_id: UUID,
    student_id: str,
    user_id: str = Depends(require_user),
):
    """Remove a student from a class (the class instructor; checked in the controller)."""
    return controller.remove_student_from_class(class_id, student_id, user_id)


def bulk_invite(
    class_id: UUID,
    data: BulkInviteRequest,
    user_id: str = Depends(require_user),
):
    """Bulk-enroll students by email list (the class instructor; checked in the controller)."""
    return controller.bulk_invite_students(class_id, data.emails, user_id)


def leave_class(class_id: UUID, user_id: str = Depends(require_user)):
    """Leave a class you're enrolled in (acting student only)."""
    return controller.leave_class(class_id, user_id)


def queue_invite(
    class_id: UUID,
    data: QueueInviteRequest,
    user_id: str = Depends(require_user),
) -> QueueInviteResponse:
    """Queue an invite batch for delayed delivery (the class instructor; checked in the
    controller)."""
    return controller.queue_invite(
        class_id,
        data.emails,
        user_id,
        cc=data.cc,
        bcc=data.bcc,
        custom_subject=data.custom_subject,
        custom_body=data.custom_body,
        custom_body_html=data.custom_body_html,
    )


def cancel_invite(
    class_id: UUID,
    job_id: UUID,
    user_id: str = Depends(require_user),
) -> CancelInviteResponse:
    """Cancel a queued invite batch before it is sent (the class instructor; checked in the
    controller). ``job_id`` is a ``pending_invites`` id: anything but a UUID answers 422 here
    instead of failing in the database."""
    return controller.cancel_invite(class_id, str(job_id), user_id)
