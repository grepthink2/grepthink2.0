"""
Class management business logic
"""
import datetime
from typing import Optional
from uuid import UUID
from fastapi import HTTPException
from app.database.client import service_client, supabase
from app.utils.generators import generate_course_code


# Terms that run a full semester (8 TSR weeks); summer runs 3 weeks.
_FULL_TERM_NAMES = {"fall", "winter", "spring"}
_SUMMER_TSR_COUNT = 3
_FULL_TSR_COUNT = 8


def _generate_tsr_assignments(client, class_id: str, term: str, start_date: datetime.date) -> None:
    """
    Auto-create TSR assignments for a new class.

    Assignments open after the first 2 weeks of class (start_date + 14 days)
    and are each one week long, one per sprint week.

    Fall / Winter / Spring  →  8 TSR assignments (weeks 3–10)
    Summer                  →  3 TSR assignments (weeks 3–5)
    """
    term_lower = (term or "").strip().lower()
    count = _FULL_TSR_COUNT if term_lower in _FULL_TERM_NAMES else _SUMMER_TSR_COUNT

    first_open = start_date + datetime.timedelta(days=14)

    assignments = []
    for week in range(1, count + 1):
        open_date = first_open + datetime.timedelta(weeks=week - 1)
        close_date = open_date + datetime.timedelta(days=6)
        assignments.append({
            "Title": f"TSR Week {week + 2}",
            "open_date": open_date.isoformat(),
            "close_date": close_date.isoformat(),
            "status": "publish",
            "class_id": class_id,
            "assignment_type": "tsr",
        })

    try:
        client.table('assignments').insert(assignments).execute()
    except Exception as e:
        # Log but don't block class creation
        print(f"Warning: failed to auto-create TSR assignments for class {class_id}: {e}")


def create_class(
    name: str,
    description: Optional[str],
    term: str,
    start_date: datetime.date,
    user_id: str,
) -> dict:
    """
    Create a new class with a unique course code and auto-generate TSR assignments.

    After the class is created, TSR assignments are automatically generated
    starting after the first 2 weeks of class:
      - Fall / Winter / Spring  →  8 weekly TSR assignments
      - Summer                  →  3 weekly TSR assignments
    """
    try:
        client = service_client if service_client else supabase

        year = start_date.year

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

        class_data: dict = {
            "name": name,
            "created_by": user_id,
            "course_code": course_code,
            "year": year,
            "term": term,
            "start_date": start_date.isoformat(),
        }
        if description is not None:
            class_data["description"] = description

        result = client.table('classes').insert(class_data).execute()
        new_class = result.data[0]

        # Auto-generate TSR assignments for this class
        _generate_tsr_assignments(client, new_class['id'], term, start_date)

        return new_class
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

def get_class_projects(class_id: UUID, user_id: str, role: str) -> list:
    """
    Get all projects for a class.

    Access rules:
    - Instructors who own the class see all projects.
    - Students enrolled in the class see all projects.

    Each project returns:
    - name, team_size, sentiment
    - product_owner_name, product_owner_email
    - scrum_master_name, scrum_master_email (None if no scrum master assigned)
    """
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

        has_access = role == 'instructor' and class_row.get('created_by') == user_id
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
        if role == 'instructor':
            projects_result = (
                client.table('projects')
                .select('id, name, team_size, sentiment')
                .eq('class_id', str(class_id))
                .order('created_at', desc=True)
                .execute()
            )
        else:
            projects_result = (
                client.table('projects')
                .select('id, name, team_size')
                .eq('class_id', str(class_id))
                .order('created_at', desc=True)
                .execute()
            )

        projects = projects_result.data or []
        if not projects:
            return []

        project_ids = [p['id'] for p in projects]

        # Fetch all product owner and scrum master memberships for these projects in one query
        memberships_result = (
            client.table('project_members')
            .select('project_id, user_id, role')
            .in_('project_id', project_ids)
            .in_('role', ['product owner', 'owner', 'scrum master'])
            .execute()
        )

        # Collect all user IDs we need to look up
        member_user_ids = list({m['user_id'] for m in (memberships_result.data or []) if m.get('user_id')})
        profile_map: dict[str, dict] = {}
        if member_user_ids:
            profiles_result = (
                client.table('profiles')
                .select('id, email, name')
                .in_('id', member_user_ids)
                .execute()
            )
            for p in profiles_result.data or []:
                profile_map[p['id']] = p

        # Build a lookup: project_id -> {role -> profile}
        project_member_map: dict[str, dict] = {}
        for m in memberships_result.data or []:
            pid = m['project_id']
            if pid not in project_member_map:
                project_member_map[pid] = {}
            project_member_map[pid][m['role']] = profile_map.get(m['user_id'], {})

        def _name(profile: dict) -> str | None:
            if not profile:
                return None
            return profile.get('name') or profile.get('email')

        results = []
        for project in projects:
            pid = project['id']
            members = project_member_map.get(pid, {})

            # Product owner stored as 'product owner' or 'owner' depending on creation path
            owner_profile = members.get('product owner') or members.get('owner') or {}
            scrum_profile = members.get('scrum master') or {}

            results.append({
                'id': pid,
                'name': project.get('name'),
                'team_size': project.get('team_size'),
                'sentiment': project.get('sentiment'),
                'product_owner_name': _name(owner_profile),
                'product_owner_email': owner_profile.get('email'),
                'scrum_master_name': _name(scrum_profile) if scrum_profile else None,
                'scrum_master_email': scrum_profile.get('email') if scrum_profile else None,
            })

        return results
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching projects: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")
