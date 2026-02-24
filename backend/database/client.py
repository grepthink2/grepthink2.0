import os
from pathlib import Path
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

# Default client (usually anon key)
supabase: Client = create_client(url, key)

# Service Role Client (Optional - for admin tasks)
service_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
service_client: Client = None

if service_key:
    try:
        service_client = create_client(url, service_key)
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
