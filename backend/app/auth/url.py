"""
Authentication endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from app.dependencies import verify_supabase_token
from app.auth.models import SignupRequest
from app.auth.controller import get_user_role
from app.database.client import service_client, get_authenticated_client

router = APIRouter(prefix="/api", tags=["auth"])


@router.get('/test-auth')
def test_auth(payload: dict = Depends(verify_supabase_token)):
    """Test authentication endpoint"""
    if payload:
        return {
            "message": f"Backend connected & Authenticated. Hello {payload.get('sub')}",
            "user_id": payload.get('sub')
        }
    else:
        return {
            "message": "Backend is reachable. No token provided."
        }


@router.get('/login-check')
def login_check(payload: dict = Depends(verify_supabase_token)):
    """Check login status and return user info"""
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


@router.post('/create-user')
def create_user(request: Request, data: SignupRequest, payload: dict = Depends(verify_supabase_token)):
    """
    Create user profile in database after Supabase authentication
    
    This endpoint is called AFTER Supabase authenticates the user
    """
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
        raise HTTPException(status_code=500, detail=str(e))
