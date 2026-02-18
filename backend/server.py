from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database.client import supabase, get_authenticated_client, service_client
import os
import uvicorn
import jwt
from jwt import PyJWKClient, PyJWK
import json
from uuid import UUID
from pathlib import Path
from dotenv import load_dotenv
import secrets
import string

from services.projects import (
    send_project_join_request, 
    get_project_join_requests, 
    review_project_join_request, 
    set_project_role,
    ReviewRequest,
    RoleRequest,
)

env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

app = FastAPI()

# Enable CORS for all routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
if not SUPABASE_JWT_SECRET:
    print("WARNING: SUPABASE_JWT_SECRET not set in .env. JWT verification will fail.")

SUPABASE_JWK_JSON = os.environ.get("SUPABASE_JWK_JSON")
_static_jwk: PyJWK | None = None
if SUPABASE_JWK_JSON:
    try:
        _static_jwk = PyJWK.from_dict(json.loads(SUPABASE_JWK_JSON))
    except Exception as e:
        print(f"WARNING: Invalid SUPABASE_JWK_JSON: {e}")

_jwks_client: PyJWKClient | None = None
if SUPABASE_URL:
    _jwks_client = PyJWKClient(f"{SUPABASE_URL}/auth/v1/keys")

def verify_supabase_token(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header:
         # For testing endpoints that don't strictly require it yet, or pass None
         # But safer to return None
         return None
    
    parts = auth_header.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = parts[1]

    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")

        if alg == "HS256":
            if not SUPABASE_JWT_SECRET:
                raise Exception("Missing SUPABASE_JWT_SECRET")
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload

        if alg in {"RS256", "ES256"}:
            if not _jwks_client:
                raise Exception("Missing SUPABASE_URL for JWKS")
            try:
                signing_key = _jwks_client.get_signing_key_from_jwt(token).key
            except Exception as jwks_error:
                if _static_jwk:
                    signing_key = _static_jwk.key
                else:
                    raise jwks_error
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                options={"verify_aud": False},
            )
            return payload

        raise Exception(f"Unsupported JWT alg: {alg}")
    except Exception as e:
        print(f"Token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")

def normalize_role(role: str | None) -> str | None:
    if not role:
        return None
    role_normalized = role.strip().lower()
    if role_normalized == "instructor":
        return "teacher"
    return role_normalized

def is_teacher_role(role: str | None) -> bool:
    return normalize_role(role) == "teacher"

def get_user_role(user_id: str) -> str | None:
    try:
        client = service_client if service_client else supabase
        result = client.table('profiles').select('role').eq('id', user_id).execute()
        if result.data and len(result.data) > 0:
            return normalize_role(result.data[0].get('role'))
    except Exception as e:
        print(f"Error fetching user role: {e}")
    return None

def generate_course_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))

class SignupRequest(BaseModel):
    email: str
    userId: str  # Changed from password
    userType: str = None

class CreateClassRequest(BaseModel):
    name: str
    description: str = None

class InviteStudentRequest(BaseModel):
    student_email: str

class JoinClassRequest(BaseModel):
    course_code: str

class CreateProjectRequest(BaseModel):
    name: str
    description: str | None = None

@app.get('/health')
def health_check():
    return {"status": "healthy", "service": "backend"}

@app.get('/api/test-auth')
def test_auth(payload: dict = Depends(verify_supabase_token)):
    if payload:
        return {
            "message": f"Backend connected & Authenticated. Hello {payload.get('sub')}",
            "user_id": payload.get('sub')
        }
    else:
         # Fallback if no token provided during simple browser test
        return {
            "message": "Backend is reachable. No token provided."
        }

@app.get('/api/login-check')
def login_check(payload: dict = Depends(verify_supabase_token)):
    if payload:
        user_id = payload.get('sub')
        role = get_user_role(user_id) if user_id else None
        return {
            "message": f"Backend connected & Authenticated. Hello {user_id}",
            "user_id": user_id,
            "role": role
        }
    else:
        return {
            "message": "User not authenticated."
        }

@app.post('/api/create-user')
def create_user(request: Request, data: SignupRequest, payload: dict = Depends(verify_supabase_token)):
    # This endpoint is called AFTER Supabase authenticates the user
    if not payload:
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")
    
    email = data.email
    user_id = data.userId
    user_type = data.userType 
    
    # Security check: Ensure the caller is the user they claim to be
    if payload.get('sub') != user_id:
         raise HTTPException(status_code=403, detail="User ID mismatch between Token and Body")

    print(f"Creating DB record for: {email} (ID: {user_id}), type: {user_type}")

    try:
        # Create entry in profiles table
        user_data = {
            "id": user_id,
            "email": email,
            "role": user_type
        }
        
        # Try to use Service Role Client first (unrestricted access)
        if service_client:
            try:
                print(f"Attempting to create user record using Service Role Client for {email}")
                service_client.table('profiles').upsert(user_data, on_conflict="id").execute()
                print(f"Created user record for {email} (via Service Role)")
                return {
                    "message": "User record created successfully.",
                    "email": email,
                    "role": user_type
                }
            except Exception as e:
                print(f"Service Role insert failed: {e}")
                # Fall through to try authenticated client
        
        # Fallback: Use authenticated client (Right user, but subject to RLS)
        token = request.headers.get("Authorization").split(" ")[1]
        auth_client = get_authenticated_client(token)
        
        try:
             print(f"Attempting to create user record using Authenticated Client for {email}")
             auth_client.table('profiles').upsert(user_data, on_conflict="id").execute()
             print(f"Created user record for {email} (via RLS)")
        except Exception as e:
            print(f"User record creation failed: {e}")
            print("HINT: Ensure RLS policy allows INSERT for authenticated users.")
            raise HTTPException(status_code=500, detail=f"Database Insert Failed: {str(e)}")

        return {
            "message": "User record created successfully.",
            "email": email,
            "role": user_type
        }

    except Exception as e:
        print(f"Unexpected error: {e}")
        # We don't want to block sign up success on frontend if DB sync fails non-critically
        # But for now return 500
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CLASS MANAGEMENT ENDPOINTS ====================

@app.post('/api/classes')
def create_class(data: CreateClassRequest, payload: dict = Depends(verify_supabase_token)):
    """Create a new class (teachers only)"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    
    # Check if user is a teacher
    if not is_teacher_role(role):
        raise HTTPException(status_code=403, detail="Only teachers can create classes")
    
    try:
        client = service_client if service_client else supabase

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
            "name": data.name,
            "description": data.description,
            "created_by": user_id,
            "course_code": course_code
        }

        result = client.table('classes').insert(class_data).execute()

        return {
            "message": "Class created successfully",
            "class": result.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating class: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create class: {str(e)}")

@app.get('/api/classes')
def get_classes(payload: dict = Depends(verify_supabase_token)):
    """Get all classes for the current user"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    
    try:
        client = service_client if service_client else supabase
        
        if is_teacher_role(role):
            # Teachers see classes they created
            result = client.table('classes').select('*').eq('created_by', user_id).execute()
        else:
            # Students: fetch enrollments with joined class + teacher in one call
            enrollments = client.table('class_enrollments').select(
                'class_id, classes ( id, name, description, created_by, created_at, course_code )'
            ).eq('user_id', user_id).execute()

            if not enrollments.data:
                return {"classes": []}

            classes = []
            teacher_ids = []
            for row in enrollments.data:
                cls = row.get('classes')
                if not cls:
                    continue
                if cls.get('created_by'):
                    teacher_ids.append(cls['created_by'])
                classes.append(cls)

            teacher_emails = {}
            if teacher_ids:
                teachers = client.table('profiles').select('id, email').in_('id', teacher_ids).execute()
                for t in teachers.data or []:
                    teacher_emails[t['id']] = t.get('email')

            for cls in classes:
                cls['teacher_email'] = teacher_emails.get(cls.get('created_by'))

            return {"classes": classes}
        
        return {"classes": result.data}
    except Exception as e:
        print(f"Error fetching classes: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch classes: {str(e)}")

@app.get('/api/classes/{class_id}')
def get_class(class_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Get details of a specific class"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        client = service_client if service_client else supabase
        result = client.table('classes').select('*').eq('id', str(class_id)).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")
        
        return {"class": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching class: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch class: {str(e)}")

@app.post('/api/classes/join')
def join_class(data: JoinClassRequest, payload: dict = Depends(verify_supabase_token)):
    """Join a class using a course code (students only)"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = payload.get('sub')
    role = get_user_role(user_id)

    if normalize_role(role) != "student":
        raise HTTPException(status_code=403, detail="Only students can join classes")

    try:
        client = service_client if service_client else supabase

        course_code = data.course_code.strip().upper()
        class_result = client.table('classes').select('*').ilike('course_code', course_code).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Invalid course code")

        class_row = class_result.data[0]

        existing = client.table('class_enrollments').select('id').eq('class_id', class_row['id']).eq('user_id', user_id).execute()
        if existing.data and len(existing.data) > 0:
            return {"message": "Already enrolled", "class": class_row}

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

@app.post('/api/classes/{class_id}/invite')
def invite_student(class_id: UUID, data: InviteStudentRequest, payload: dict = Depends(verify_supabase_token)):
    """Invite a student to a class (teachers only)"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    role = get_user_role(user_id)
    
    # Check if user is a teacher
    if not is_teacher_role(role):
        raise HTTPException(status_code=403, detail="Only teachers can invite students")
    
    try:
        client = service_client if service_client else supabase
        
        # Verify the class exists and belongs to this teacher
        class_result = client.table('classes').select('*').eq('id', str(class_id)).eq('created_by', user_id).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found or you don't have permission")
        
        # Find the student by email
        student_result = client.table('profiles').select('id, role').eq('email', data.student_email).execute()
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
            "student_email": data.student_email
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error inviting student: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to invite student: {str(e)}")

@app.get('/api/classes/{class_id}/students')
def get_class_students(class_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Get all students enrolled in a class"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        client = service_client if service_client else supabase
        
        # Verify the class exists
        class_result = client.table('classes').select('*').eq('id', str(class_id)).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")
        
        # Get enrolled students
        enrollments = client.table('class_enrollments').select('user_id').eq('class_id', str(class_id)).execute()
        
        if not enrollments.data or len(enrollments.data) == 0:
            return {"students": []}
        
        user_ids = [e['user_id'] for e in enrollments.data]
        students = client.table('profiles').select('id, email, role').in_('id', user_ids).execute()
        
        return {"students": students.data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching students: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch students: {str(e)}")

@app.post('/api/classes/{class_id}/join')
def join_class_by_id(class_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Allows a user to join a class"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    role = get_user_role(user_id)

    # Check if user is a not a teacher
    if is_teacher_role(role):
        raise HTTPException(status_code=403, detail="Only students or guests can join")
    
    try:
        client = service_client if service_client else supabase
        
        # Check if user in table
        # user_result = client.table('users').select('id').eq('user_id', user_id).execute()
        # if not user_result.data or len(user_result.data) == 0:
        #     raise HTTPException(status_code=404, detail="User not found in database")

        # Verify the class exists
        class_result = client.table('classes').select('*').eq('id', str(class_id)).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found or you don't have permission")
                
        # Check if already enrolled
        existing = client.table('class_enrollments').select('*').eq('class_id', str(class_id)).eq('user_id', user_id).execute()
        if existing.data and len(existing.data) > 0:
            return {"message": "Already enrolled in this class"}
        
        # Create enrollment
        enrollment_data = {
            "class_id": str(class_id),
            "user_id": user_id
        }
        client.table('class_enrollments').insert(enrollment_data).execute()
        
        return {
            "message": "User sucessfully enrolled",
            "class_id": str(class_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error joining class: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to join: {str(e)}")

@app.post('/api/classes/{class_id}/projects')
def create_project_for_class(
    class_id: UUID,
    data: CreateProjectRequest,
    payload: dict = Depends(verify_supabase_token),
):
    """Create a project in a class (students only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = payload.get('sub')
    role = get_user_role(user_id)

    if normalize_role(role) != 'student':
        raise HTTPException(status_code=403, detail="Only students can create projects")

    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")

    try:
        client = service_client if service_client else supabase

        class_result = client.table('classes').select('id').eq('id', str(class_id)).execute()
        if not class_result.data:
            raise HTTPException(status_code=404, detail="Class not found")

        enrollment_result = (
            client.table('class_enrollments')
            .select('id')
            .eq('class_id', str(class_id))
            .eq('user_id', user_id)
            .execute()
        )
        if not enrollment_result.data:
            raise HTTPException(status_code=403, detail="Join the class before creating a project")

        project_result = (
            client.table('projects')
            .insert(
                {
                    'class_id': str(class_id),
                    'name': name,
                    'description': data.description,
                    'created_by': user_id,
                }
            )
            .execute()
        )

        if not project_result.data:
            raise HTTPException(status_code=500, detail="Failed to create project")

        project = project_result.data[0]

        try:
            client.table('project_members').insert(
                {
                    'project_id': project['id'],
                    'user_id': user_id,
                    'role': 'owner',
                }
            ).execute()
        except Exception as membership_error:
            print(f"Error adding creator as project member: {membership_error}")
            try:
                client.table('projects').delete().eq('id', project['id']).execute()
            except Exception as rollback_error:
                print(f"Error rolling back project creation: {rollback_error}")
            raise HTTPException(status_code=500, detail="Failed to assign project membership")

        return {
            'message': 'Project created successfully',
            'project': project,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating project: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")

@app.get('/api/classes/{class_id}/projects')
def get_class_projects(class_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Get all projects for a class (visible to enrolled students and class teacher)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = payload.get('sub')
    role = get_user_role(user_id)

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
        if is_teacher_role(role) and class_row.get('created_by') == user_id:
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

        return {'projects': projects}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching projects: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")

@app.get('/api/projects/{project_id}/requests')
def get_join_requests(project_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """
    See all join requests for a project if you are teacher or project owner
    View only your join request if regular user
    """
    return get_project_join_requests(project_id, payload)

@app.post('/api/projects/{project_id}/send_request')
def send_join_request(project_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Send a join request to the project"""
    return send_project_join_request(project_id, payload)

@app.post('/api/projects/{request_id}/review_request')
def review_request(request_id: UUID, data: ReviewRequest, payload: dict = Depends(verify_supabase_token)):
    """Review a project join request"""
    return review_project_join_request(request_id, data, payload)

@app.post('/api/projects/{project_id}/update_role')
def update_role(project_id: UUID, data: RoleRequest, payload: dict = Depends(verify_supabase_token)):
    """Update role of a project member"""
    return set_project_role(project_id, data, payload)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host='0.0.0.0', port=port)
