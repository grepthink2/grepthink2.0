"""
Database module for Supabase client management
"""
from .client import supabase, service_client, get_authenticated_client

__all__ = ["supabase", "service_client", "get_authenticated_client"]
