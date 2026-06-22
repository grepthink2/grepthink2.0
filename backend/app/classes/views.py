"""
Classes views — parameter handling and responses
"""
from uuid import UUID
from fastapi import HTTPException, Depends, UploadFile, File
from app.dependencies import require_user, require_instructor
from app.auth.controller import get_user_role
from app.classes.models import (
    BulkInviteRequest,
    CreateClassRequest,
    InviteStudentRequest,
    JoinClassRequest,
    UpdateClassStatusRequest,
)
from app.classes import controller


def create_class(data: CreateClassRequest, user_id: str = Depends(require_instructor)):
    result = controller.create_class(
        data.name, data.description, data.term, data.start_date, user_id,
        tsr_count=data.tsr_count,
    )
    return {"message": "Class created successfully", "class": result}


def get_classes(user_id: str = Depends(require_user)):
    role = get_user_role(user_id)
    classes = controller.get_classes_for_user(user_id, role)
    return {"classes": classes}


def get_class(class_id: UUID, user_id: str = Depends(require_user)):
    class_data = controller.get_class_by_id(class_id)
    return {"class": class_data}


def update_class_status(
    class_id: UUID,
    data: UpdateClassStatusRequest,
    user_id: str = Depends(require_instructor),
):
    """Set class lifecycle status to active or complete (instructor only)."""
    updated = controller.update_class_status(class_id, data.status, user_id)
    return {"message": "Class status updated", "class": updated}


def join_class(data: JoinClassRequest, user_id: str = Depends(require_user)):
    role = get_user_role(user_id)
    if role != "student":
        raise HTTPException(status_code=403, detail="Only students can join classes")
    return controller.join_class_by_code(data.course_code, user_id)


def invite_student(
    class_id: UUID,
    data: InviteStudentRequest,
    user_id: str = Depends(require_instructor),
):
    return controller.invite_student_to_class(class_id, data.student_email, user_id)


def get_class_students(class_id: UUID, user_id: str = Depends(require_user)):
    students = controller.get_class_students(class_id)
    return {"students": students}


def get_class_roster(class_id: UUID, user_id: str = Depends(require_user)):
    """Merged official roster + GrepThink enrollment status."""
    role = get_user_role(user_id)
    return controller.get_class_roster(class_id, user_id, role)


async def upload_class_roster(
    class_id: UUID,
    file: UploadFile = File(...),
    user_id: str = Depends(require_instructor),
):
    """Replace the class roster from a UCSC CSV export (instructor only)."""
    raw = await file.read()
    try:
        csv_text = raw.decode('utf-8-sig')
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded") from exc
    return controller.upload_class_roster(class_id, csv_text, user_id)


def get_class_projects(class_id: UUID, user_id: str = Depends(require_user)):
    """Get all projects for a class (visible to enrolled students and class teacher)."""
    role = get_user_role(user_id)
    projects = controller.get_class_projects(class_id, user_id, role)
    return {"projects": projects}


def get_class_turn_in_stats(
    class_id: UUID,
    user_id: str = Depends(require_instructor),
):
    """TSR turn-in stats for the class's current assignment (instructor only)."""
    turn_in = controller.get_class_turn_in_stats(class_id, user_id)
    return {"turn_in": turn_in}


def remove_student(
    class_id: UUID,
    student_id: str,
    user_id: str = Depends(require_instructor),
):
    """Remove a student from a class (instructor only)."""
    return controller.remove_student_from_class(class_id, student_id, user_id)


def bulk_invite(
    class_id: UUID,
    data: BulkInviteRequest,
    user_id: str = Depends(require_instructor),
):
    """Bulk-enroll students by email list (instructor only)."""
    return controller.bulk_invite_students(class_id, data.emails, user_id)


def leave_class(class_id: UUID, user_id: str = Depends(require_user)):
    """Leave a class you're enrolled in (acting student only)."""
    return controller.leave_class(class_id, user_id)
