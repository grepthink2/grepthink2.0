from database.client import supabase
import sys

def fetch_data(table_name):
    """
    Fetches all data from the specified Supabase table.
    """
    try:
        print(f"Fetching data from table: '{table_name}'...")
        response = supabase.table(table_name).select("*").execute()
        
        data = response.data
        if data:
            print(f"Successfully retrieved {len(data)} rows:")
            for row in data:
                print(row)
        else:
            print("Query successful, but table is empty.")
            
        return data
        
    except Exception as e:
        print(f"Error fetching data: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) > 1:
        table = sys.argv[1]
    else:
        # Default fallback or prompt
        print("Usage: python test_supabase.py <table_name>")
        table = input("Enter the table name to query: ")

    if table:
        fetch_data(table)
    else:
        print("No table name provided.")
