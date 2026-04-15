import logging
import os
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env from project root
env_path = Path(__file__).resolve().parent.parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

url: str = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
# Try standard names and the one in the .env
key: str = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")

if not url or not key:
    raise ValueError("Supabase URL and Key must be set in .env file")
else:
    logger.info("Supabase URL and Key loaded successfully | url=%s", url)

# Default client (usually anon key)
supabase: Client = create_client(url, key)

# Service Role Client (Optional - for admin tasks)
service_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
service_client: Client = None

if service_key:
    try:
        service_client = create_client(url, service_key)
        logger.info("Supabase Service Role Client loaded")
    except Exception:
        logger.exception("Failed to load Service Role Client")
else:
    # WARN: without the service client every controller falls back to the anon client,
    # which is subject to RLS policies. If you're seeing unexpected 401s from the DB,
    # this is probably why.
    logger.warning(
        "SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon client "
        "(RLS policies will be enforced on all queries)"
    )


def get_authenticated_client(access_token: str) -> Client:
    """
    Returns a Supabase client authenticated as the user via the provided Bearer token (from Supabase Auth).
    """
    try:
        # Create a new client instance sharing the same URL and Key
        # We don't want to use the shared 'supabase' instance as that would mess up headers for everyone
        new_client = create_client(url, key)

        # Manually inject the Authorization header into the Postgrest client
        new_client.postgrest.auth(access_token)

        logger.debug("Created authenticated Supabase client for request")
        return new_client
    except Exception:
        logger.exception("Error creating authenticated client — falling back to default")
        # Fallback to default client if something goes wrong
        return supabase
