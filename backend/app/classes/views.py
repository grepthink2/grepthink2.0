"""
Classes views — parameter handling and responses
"""
from uuid import UUID
from fastapi import HTTPException, Depends
from app.dependencies import verify_supabase_token
from app.auth.controller import get_user_role, is_instructor_role
from app.classes.models import CreateClassRequest, InviteStudentRequest, JoinClassRequest
from app.classes import controller


def create_class(data: CreateClassRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    if not is_instructor_role(role):
        raise HTTPException(status_code=403, detail="Only instructors can create classes")
    result = controller.create_class(data.name, data.description, data.term, user_id)
    return {"message": "Class created successfully", "class": result}


def get_classes(payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    classes = controller.get_classes_for_user(user_id, role)
    return {"classes": classes}


def get_class(class_id: UUID, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    class_data = controller.get_class_by_id(class_id)
    return {"class": class_data}


def join_class(data: JoinClassRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    if role != "student":
        raise HTTPException(status_code=403, detail="Only students can join classes")
    return controller.join_class_by_code(data.course_code, user_id)


def invite_student(class_id: UUID, data: InviteStudentRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    if not is_instructor_role(role):
        raise HTTPException(status_code=403, detail="Only instructors can invite students")
    return controller.invite_student_to_class(class_id, data.student_email, user_id)


def get_class_students(class_id: UUID, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    students = controller.get_class_students(class_id)
    return {"students": students}
