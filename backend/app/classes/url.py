"""
Class management endpoints
"""
from uuid import UUID
from fastapi import APIRouter, HTTPException, Depends
from app.dependencies import verify_supabase_token
from app.classes.models import CreateClassRequest, InviteStudentRequest, JoinClassRequest
from app.auth.controller import get_user_role, is_instructor_role
from app.classes import controller

router = APIRouter(prefix="/api/classes", tags=["classes"])


@router.post('')
def create_class_endpoint(data: CreateClassRequest, payload: dict = Depends(verify_supabase_token)):
    """Create a new class (instructors only)"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    
    # Check if user is an instructor
    if not is_instructor_role(role):
        raise HTTPException(status_code=403, detail="Only instructors can create classes")
    
    result = controller.create_class(data.name, data.description, data.term, user_id)
    return {
        "message": "Class created successfully",
        "class": result
    }


@router.get('')
def get_classes_endpoint(payload: dict = Depends(verify_supabase_token)):
    """Get all classes for the current user"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    
    classes = controller.get_classes_for_user(user_id, role)
    return {"classes": classes}


@router.get('/{class_id}')
def get_class_endpoint(class_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Get details of a specific class"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    class_data = controller.get_class_by_id(class_id)
    return {"class": class_data}


@router.post('/join')
def join_class_endpoint(data: JoinClassRequest, payload: dict = Depends(verify_supabase_token)):
    """Join a class using a course code (students only)"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = payload.get('sub')
    role = get_user_role(user_id)

    if role != "student":
        raise HTTPException(status_code=403, detail="Only students can join classes")

    return controller.join_class_by_code(data.course_code, user_id)


@router.post('/{class_id}/invite')
def invite_student_endpoint(class_id: UUID, data: InviteStudentRequest, payload: dict = Depends(verify_supabase_token)):
    """Invite a student to a class (instructors only)"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    
    # Check if user is an instructor
    if not is_instructor_role(role):
        raise HTTPException(status_code=403, detail="Only instructors can invite students")
    
    return controller.invite_student_to_class(class_id, data.student_email, user_id)


@router.get('/{class_id}/students')
def get_class_students_endpoint(class_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Get all students enrolled in a class"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    students = controller.get_class_students(class_id)
    return {"students": students}
