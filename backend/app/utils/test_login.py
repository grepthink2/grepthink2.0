import requests
from app.config import settings
# for getting session token for testing auth
def test_login(email:str, password:str):
    try:
        url = f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password"

        headers = {
            "Content-Type": "application/json",
            "apikey": settings.SUPABASE_KEY
        }

        data = {
            "email": email,
            "password": password
        }

        r = requests.post(url, headers=headers, json=data)

        return r.json()['access_token']
    except Exception as e:
        print(str(e))

print(test_login(
    "tozwu@ucsc.edu",
    "fullStackDevMoment283"
))