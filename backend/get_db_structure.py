from database.client import supabase
import json

def get_schema():
    print("Attempting to fetch database structure...")
    print("Note: This requires 'information_schema' to be exposed to the API, which is often disabled for security.")
    
    try:
        # Attempt to fetch public tables from information_schema
        # This usually only works if you've added 'information_schema' to your exposed schemas in Supabase settings
        response = supabase.table('tables') \
            .select('table_name') \
            .eq('table_schema', 'public') \
            .execute() # PostgREST usually doesn't map 'tables' to information_schema.tables automatically usually
        
        # Actually PostgREST doesn't expose information_schema tables directly by default.
        # This call will likely fail 404.
        print("Tables response:", response.data)

    except Exception as e:
        print(f"\nDirect schema query failed: {e}")
        print("\nCommon reason: Supabase API (PostgREST) does not expose 'information_schema' by default.")
        
    print("\n--- Alternative: Introspection via known tables ---")
    # If we knew table names, we could fetch 1 row and print keys.
    # checking for the ones mentioning in previous turn
    known_tables = ['project_members', 'class_members', 'profiles', 'projects', 'classes']
    
    for table in known_tables:
        try:
            print(f"\nChecking table '{table}'...")
            # Fetch 1 row to see columns
            resp = supabase.table(table).select("*").limit(1).execute()
            if resp.data:
                print(f"Columns found in '{table}': {list(resp.data[0].keys())}")
            else:
                print(f"Table '{table}' exists but is empty (or RLS hides rows).")
        except Exception as e:
            # If table doesn't exist or other error
            if "relation" in str(e) and "does not exist" in str(e):
                 print(f"Table '{table}' does not exist.")
            else:
                 print(f"Error checking '{table}': {e}")

if __name__ == "__main__":
    get_schema()
