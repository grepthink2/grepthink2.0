"""
Database module for Supabase client management
"""

from .client import get_authenticated_client, service_client, supabase

__all__ = ["supabase", "service_client", "get_authenticated_client"]
