from fastapi import FastAPI, HTTPException, Body, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database.auth import auth_service
from database.client import supabase, get_authenticated_client, service_client
import os
import uvicorn
import jwt
import requests
from jwt.algorithms import RSAAlgorithm
import json

app = FastAPI()

# Enable CORS for all routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CLERK_ISSUER = os.environ.get("CLERK_ISSUER_URL")
if not CLERK_ISSUER:
    print("WARNING: CLERK_ISSUER_URL not set in .env. JWT verification will fail.")

def get_jwks():
    if not CLERK_ISSUER:
        return None
    try:
        jwks_url = f"{CLERK_ISSUER}/.well-known/jwks.json"
        response = requests.get(jwks_url)
        return response.json()
    except Exception as e:
        print(f"Error fetching JWKS: {e}")
        return None

def verify_clerk_token(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header:
         # For testing endpoints that don't strictly require it yet, or pass None
         # But safer to return None
         return None
    
    token = auth_header.split(" ")[1]
    
    try:
        jwks = get_jwks()
        if not jwks:
            raise Exception("Could not fetch JWKS")

        public_keys = {}
        for jwk in jwks['keys']:
            kid = jwk['kid']
            public_keys[kid] = RSAAlgorithm.from_jwk(json.dumps(jwk))

        kid = jwt.get_unverified_header(token)['kid']
        key = public_keys.get(kid)
        
        payload = jwt.decode(token, key=key, algorithms=['RS256'])
        return payload
    except Exception as e:
        print(f"Token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")

class SignupRequest(BaseModel):
    email: str
    userId: str  # Changed from password
    userType: str = None

@app.get('/health')
def health_check():
    return {"status": "healthy", "service": "backend"}

@app.get('/api/test-auth')
def test_auth(payload: dict = Depends(verify_clerk_token)):
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

@app.post('/api/create-user')
def create_user(request: Request, data: SignupRequest, payload: dict = Depends(verify_clerk_token)):
    # This endpoint is called AFTER Clerk verifies the user
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
        # Create entry in users table
        user_data = {
            "user_id": user_id,
            "email": email,
            "role": user_type
        }
        
        # Try to use Service Role Client first (unrestricted access)
        if service_client:
            try:
                print(f"Attempting to create user record using Service Role Client for {email}")
                service_client.table('users').insert(user_data).execute()
                print(f"Created user record for {email} (via Service Role)")
                return {
                    "message": "User record created successfully.",
                    "email": email
                }
            except Exception as e:
                print(f"Service Role insert failed: {e}")
                # Fall through to try authenticated client
        
        # Fallback: Use authenticated client (Right user, but subject to RLS)
        token = request.headers.get("Authorization").split(" ")[1]
        auth_client = get_authenticated_client(token)
        
        try:
             print(f"Attempting to create user record using Authenticated Client for {email}")
             auth_client.table('users').insert(user_data).execute()
             print(f"Created user record for {email} (via RLS)")
        except Exception as e:
            print(f"User record creation failed: {e}")
            print("HINT: Ensure RLS policy allows INSERT for authenticated users.")
            raise HTTPException(status_code=500, detail=f"Database Insert Failed: {str(e)}")

        return {
            "message": "User record created successfully.",
            "email": email
        }

    except Exception as e:
        print(f"Unexpected error: {e}")
        # We don't want to block sign up success on frontend if DB sync fails non-critically
        # But for now return 500
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/api/logout')
def logout(payload: dict = Depends(verify_clerk_token)):
    # In a stateless JWT setup, "logout" is mostly a frontend action (deleting the token).
    # However, we can use this endpoint to invalidating sessions if we were tracking them,
    # or simply to log the logout event.
    if payload:
        user_id = payload.get('sub')
        print(f"User {user_id} logged out.")
        return {"message": "Logged out successfully"}
    return {"message": "Logged out (no active session found)"}

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host='0.0.0.0', port=port)
