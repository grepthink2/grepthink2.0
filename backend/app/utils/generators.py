"""
Generator utilities for creating unique identifiers
"""
import secrets
import string


def generate_course_code(length: int = 8) -> str:
    """
    Generate a random course code using uppercase letters and digits
    
    Args:
        length: Length of the course code (default: 8)
        
    Returns:
        Random course code string
    """
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))
