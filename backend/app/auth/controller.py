"""
Authentication business logic
"""
from app.database.client import service_client, supabase


def is_instructor_role(role: str | None) -> bool:
    """
    Check if the given role is an instructor
    
    Args:
        role: User role string
        
    Returns:
        True if role is instructor, False otherwise
    """
    return role == "instructor"


def get_user_role(user_id: str) -> str | None:
    """
    Fetch user role from the database
    
    Args:
        user_id: User's unique identifier
        
    Returns:
        User's role string or None if not found
    """
    try:
        client = service_client if service_client else supabase
        result = client.table('profiles').select('role').eq('id', user_id).execute()
        if result.data and len(result.data) > 0:
            return result.data[0].get('role')
    except Exception as e:
        print(f"Error fetching user role: {e}")
    return None
