import sys
from database.client import supabase
from database.auth import auth_service

def print_menu():
    print("\n--- Supabase Auth CLI ---")
    print("1. Sign Up")
    print("2. Sign In")
    print("3. Get Current User")
    print("4. Sign Out")
    print("5. Exit")
    print("-------------------------")

def main():
    print("Initializing Supabase Auth...")
    
    while True:
        print_menu()
        choice = input("Select an option: ")

        if choice == "1":
            email = input("Enter email: ")
            password = input("Enter password: ")
            print("Attempting sign up...")
            res = auth_service.sign_up(email, password)
            if res and res.user:
                print(f"Sign up successful! User ID: {res.user.id}")
                if res.user.identities and len(res.user.identities) == 0:
                    print("Note: If email confirmation is enabled, please check your inbox.")
            else:
                print("Sign up failed or requires email confirmation.")

        elif choice == "2":
            email = input("Enter email: ")
            password = input("Enter password: ")
            print("Attempting sign in...")
            res = auth_service.sign_in(email, password)
            if res and res.user:
                print(f"Sign in successful! Logged in as: {res.user.email}")
                print(f"access_token: {res.session.access_token[:20]}...")
            else:
                print("Sign in failed.")

        elif choice == "3":
            res = auth_service.get_user()
            if res and res.user:
                print(f"Current User: {res.user.email} (ID: {res.user.id})")
            else:
                print("No active session or error retrieving user.")

        elif choice == "4":
            auth_service.sign_out()
            print("Signed out.")

        elif choice == "5":
            print("Exiting...")
            break
        
        else:
            print("Invalid option.")

if __name__ == "__main__":
    main()
