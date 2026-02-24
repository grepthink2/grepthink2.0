"""
Class management business logic
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from fastapi import HTTPException
from app.database.client import service_client, supabase
from app.utils.generators import generate_course_code


def create_class(name: str, description: Optional[str], term: str, user_id: str) -> dict:
    """
    Create a new class with a unique course code.

    Description is optional. Year is derived from the creator's profile
    (year or graduation_year) or current year as fallback.

    Args:
        name: Class name
        description: Optional class description
        user_id: ID of the instructor creating the class

    Returns:
        Dictionary containing class data

    Raises:
        HTTPException: If course code generation fails or database error occurs
    """
    try:
        client = service_client if service_client else supabase

        # Get year from creator's profile (year or graduation_year) or use current year
        year = datetime.now().year
        try:
            profile = client.table('profiles').select('*').eq('id', user_id).execute()
            if profile.data and len(profile.data) > 0:
                row = profile.data[0]
                raw = row.get('year') or row.get('graduation_year')
                if raw is not None:
                    year = int(raw)
        except Exception:
            pass

        # Generate unique course code
        course_code = None
        for _ in range(5):
            candidate = generate_course_code()
            existing = client.table('classes').select('id').ilike('course_code', candidate).execute()
            if not existing.data:
                course_code = candidate.upper()
                break

        if not course_code:
            raise HTTPException(status_code=500, detail="Failed to generate unique course code")

        # Create the class
        class_data = {
            "name": name,
            "created_by": user_id,
            "course_code": course_code,
            "year": year,
            "term": term,
        }
        if description is not None:
            class_data["description"] = description

        result = client.table('classes').insert(class_data).execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating class: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create class: {str(e)}")


def get_classes_for_user(user_id: str, role: str) -> list:
    """
    Get all classes for a user based on their role
    
    Args:
        user_id: User's unique identifier
        role: User's role (instructor or student)
        
    Returns:
        List of class dictionaries
        
    Raises:
        HTTPException: If database error occurs
    """
    try:
        client = service_client if service_client else supabase
        
        if role == "instructor":
            # Instructors see classes they created
            result = client.table('classes').select('*').eq('created_by', user_id).execute()
            return result.data
        else:
            # Students: fetch enrollments with joined class + instructor info
            enrollments = client.table('class_enrollments').select(
                'class_id, classes ( id, name, description, created_by, created_at, course_code )'
            ).eq('user_id', user_id).execute()

            if not enrollments.data:
                return []

            classes = []
            instructor_ids = []
            for row in enrollments.data:
                cls = row.get('classes')
                if not cls:
                    continue
                if cls.get('created_by'):
                    instructor_ids.append(cls['created_by'])
                classes.append(cls)

            # Fetch instructor emails
            instructor_emails = {}
            if instructor_ids:
                instructors = client.table('profiles').select('id, email').in_('id', instructor_ids).execute()
                for t in instructors.data or []:
                    instructor_emails[t['id']] = t.get('email')

            # Attach instructor email to each class
            for cls in classes:
                cls['instructor_email'] = instructor_emails.get(cls.get('created_by'))

            return classes
    except Exception as e:
        print(f"Error fetching classes: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch classes: {str(e)}")


def get_class_by_id(class_id: UUID) -> dict:
    """
    Get a specific class by ID
    
    Args:
        class_id: Class unique identifier
        
    Returns:
        Class dictionary
        
    Raises:
        HTTPException: If class not found or database error occurs
    """
    try:
        client = service_client if service_client else supabase
        result = client.table('classes').select('*').eq('id', str(class_id)).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching class: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch class: {str(e)}")


def join_class_by_code(course_code: str, user_id: str) -> dict:
    """
    Enroll a student in a class using a course code
    
    Args:
        course_code: Course code to join
        user_id: Student's unique identifier
        
    Returns:
        Dictionary with message and class data
        
    Raises:
        HTTPException: If course code is invalid or database error occurs
    """
    try:
        client = service_client if service_client else supabase

        # Find class by course code
        course_code = course_code.strip().upper()
        class_result = client.table('classes').select('*').ilike('course_code', course_code).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Invalid course code")

        class_row = class_result.data[0]

        # Check if already enrolled
        existing = client.table('class_enrollments').select('id').eq('class_id', class_row['id']).eq('user_id', user_id).execute()
        if existing.data and len(existing.data) > 0:
            return {"message": "Already enrolled", "class": class_row}

        # Create enrollment
        enrollment_data = {
            "class_id": class_row['id'],
            "user_id": user_id
        }
        client.table('class_enrollments').insert(enrollment_data).execute()

        return {"message": "Joined class successfully", "class": class_row}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error joining class: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to join class: {str(e)}")


def invite_student_to_class(class_id: UUID, student_email: str, instructor_id: str) -> dict:
    """
    Invite a student to a class
    
    Args:
        class_id: Class unique identifier
        student_email: Email of the student to invite
        instructor_id: ID of the instructor making the invitation
        
    Returns:
        Dictionary with success message
        
    Raises:
        HTTPException: If class not found, student not found, or database error occurs
    """
    try:
        client = service_client if service_client else supabase
        
        # Verify the class exists and belongs to this instructor
        class_result = client.table('classes').select('*').eq('id', str(class_id)).eq('created_by', instructor_id).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found or you don't have permission")
        
        # Find the student by email
        student_result = client.table('profiles').select('id, role').eq('email', student_email).execute()
        if not student_result.data or len(student_result.data) == 0:
            raise HTTPException(status_code=404, detail="Student not found")
        
        student = student_result.data[0]
        
        # Verify the user is actually a student
        if student['role'] != 'student':
            raise HTTPException(status_code=400, detail="User is not a student")
        
        # Check if already enrolled
        existing = client.table('class_enrollments').select('*').eq('class_id', str(class_id)).eq('user_id', student['id']).execute()
        if existing.data and len(existing.data) > 0:
            return {"message": "Student already enrolled in this class"}
        
        # Create enrollment
        enrollment_data = {
            "class_id": str(class_id),
            "user_id": student['id']
        }
        client.table('class_enrollments').insert(enrollment_data).execute()
        
        return {
            "message": "Student invited successfully",
            "student_email": student_email
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error inviting student: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to invite student: {str(e)}")


def get_class_students(class_id: UUID) -> list:
    """
    Get all students enrolled in a class
    
    Args:
        class_id: Class unique identifier
        
    Returns:
        List of student dictionaries
        
    Raises:
        HTTPException: If class not found or database error occurs
    """
    try:
        client = service_client if service_client else supabase
        
        # Verify the class exists
        class_result = client.table('classes').select('*').eq('id', str(class_id)).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")
        
        # Get enrolled students
        enrollments = client.table('class_enrollments').select('user_id').eq('class_id', str(class_id)).execute()
        
        if not enrollments.data or len(enrollments.data) == 0:
            return []
        
        user_ids = [e['user_id'] for e in enrollments.data]
        students = client.table('profiles').select('id, email, role').in_('id', user_ids).execute()
        
        return students.data
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching students: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch students: {str(e)}")

def get_class_projects(class_id: UUID, user_id: UUID, role: str):
    """Get all projects for a class (visible to enrolled students and class teacher)."""
    try:
        client = service_client if service_client else supabase

        class_result = (
            client.table('classes')
            .select('id, created_by')
            .eq('id', str(class_id))
            .execute()
        )
        if not class_result.data:
            raise HTTPException(status_code=404, detail='Class not found')

        class_row = class_result.data[0]

        has_access = False
        if role == "instructor" and class_row.get('created_by') == user_id:
            has_access = True

        if not has_access:
            enrollment_result = (
                client.table('class_enrollments')
                .select('id')
                .eq('class_id', str(class_id))
                .eq('user_id', user_id)
                .execute()
            )
            has_access = bool(enrollment_result.data)

        if not has_access:
            raise HTTPException(status_code=403, detail='You do not have access to this class projects list')

        projects_result = (
            client.table('projects')
            .select('id, class_id, name, description, created_by, created_at')
            .eq('class_id', str(class_id))
            .order('created_at', desc=True)
            .execute()
        )

        projects = projects_result.data or []

        creator_ids = list({project['created_by'] for project in projects if project.get('created_by')})
        creator_emails: dict[str, str | None] = {}
        if creator_ids:
            creators = client.table('profiles').select('id, email').in_('id', creator_ids).execute()
            for creator in creators.data or []:
                creator_emails[creator['id']] = creator.get('email')

        for project in projects:
            project['creator_email'] = creator_emails.get(project.get('created_by'))

        return projects
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching projects: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")