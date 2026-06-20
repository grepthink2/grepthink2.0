import os
from pathlib import Path
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv

# Load .env from project root
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

url: str = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
# Try standard names and the one in the .env
key: str = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")

if not url or not key:
    raise ValueError("Supabase URL and Key must be set in .env file")
else:
    print("Supabase URL and Key loaded successfully.")


def _force_http1(client: Client) -> None:
    """Swap PostgREST's HTTP/2 session for an HTTP/1.1 one.

    postgrest-py hardcodes ``http2=True`` (see postgrest/_sync/client.py), and a
    single HTTP/2 ``httpx.Client`` is NOT safe to share across threads: its HPACK
    header encoder mutates a ``deque`` that concurrent requests iterate, raising
    ``RuntimeError: deque mutated during iteration`` / ``ConnectionTerminated`` ->
    intermittent 500s. Because FastAPI runs these sync endpoints in a thread pool,
    all requests share this one client. HTTP/1.1 uses a connection pool (a separate
    connection per concurrent request) which httpx supports safely across threads.

    Applied once at import. We reuse the existing session's base_url/headers (which
    carry the apikey + auth headers PostgREST configured) and only flip the protocol.
    """
    try:
        pg = client.postgrest  # lazily builds + caches the SyncPostgrestClient
        old = pg.session
        pg.session = httpx.Client(
            base_url=old.base_url,
            headers=old.headers,
            timeout=pg.timeout,
            follow_redirects=True,
            http2=False,
        )
        old.close()
    except Exception as e:  # never let a hardening tweak break startup
        print(f"Could not force HTTP/1.1 on PostgREST session: {e}")


# Default client (usually anon key)
supabase: Client = create_client(url, key)
_force_http1(supabase)

# Service Role Client (Optional - for admin tasks)
service_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
service_client: Client = None

if service_key:
    try:
        service_client = create_client(url, service_key)
        _force_http1(service_client)
        print("Supabase Service Role Client loaded.")
    except Exception as e:
        print(f"Failed to load Service Role Client: {e}")

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
        
        return new_client
    except Exception as e:
        print(f"Error creating authenticated client: {e}")
        # Fallback to default client if something goes wrong
        return supabase
