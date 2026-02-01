from database.client import supabase

class AuthService:
    def sign_up(self, email, password):
        try:
            response = supabase.auth.sign_up({
                "email": email,
                "password": password,
            })
            return response
        except Exception as e:
            print(f"Sign up error: {e}")
            return None

    def sign_in(self, email, password):
        try:
            response = supabase.auth.sign_in_with_password({
                "email": email,
                "password": password,
            })
            return response
        except Exception as e:
            print(f"Sign in error: {e}")
            return None

    def sign_out(self):
        try:
            response = supabase.auth.sign_out()
            return response
        except Exception as e:
            print(f"Sign out error: {e}")
            return None

    def get_user(self):
        try:
            user = supabase.auth.get_user()
            return user
        except Exception as e:
            print(f"Get user error: {e}")
            return None

auth_service = AuthService()
