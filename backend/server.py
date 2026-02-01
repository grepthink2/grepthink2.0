import os
from supabase import create_client
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()

# setup supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

## Helper Funcs
def get_all(table):
    """
    Returns all the data for a given table
    :param table: name of table to query
    """
    try:
        response = supabase.table(table).select("*").execute()
        return response.data
    except Exception as e:
        return None


## Endpoints
@app.get("/test")
def read_root():
    """
    Tests connectivity to database
    """
    res = get_all("classes")
    if res is not None:
        return {"data": res}
    return {"error": "Connection failed"}


@app.get("/table/{table_name}")
def read_item(table_name: str):
    """
    Returns all the data of a table
    :param table_name: name of table to query
    """
    res = get_all(table_name)
    if res is not None:
        return {"data": res}
    return {"error": "Connection failed"}
