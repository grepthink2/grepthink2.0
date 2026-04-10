"""
Application configuration and environment variables
"""
import logging
import os
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env from project root
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)


class Settings:
    """Application settings loaded from environment variables"""
    
    # Supabase Configuration
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
    SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET")
    SUPABASE_JWK_JSON: str = os.environ.get("SUPABASE_JWK_JSON")
    
    # Server Configuration
    HOST: str = os.environ.get("HOST", "0.0.0.0")
    PORT: int = int(os.environ.get("PORT", 5001))
    
    # CORS Configuration
    CORS_ORIGINS: list = ["*"]  # Configure as needed
    CORS_CREDENTIALS: bool = True
    CORS_METHODS: list = ["*"]
    CORS_HEADERS: list = ["*"]
    
    @classmethod
    def validate(cls):
        """Validate required settings"""
        if not cls.SUPABASE_URL:
            raise ValueError("SUPABASE_URL must be set in .env file")
        if not cls.SUPABASE_KEY:
            raise ValueError("SUPABASE_KEY must be set in .env file")
        if not cls.SUPABASE_JWT_SECRET:
            # WARN: HS256 JWTs won't verify without this. RS256 still works via JWKS.
            logger.warning(
                "SUPABASE_JWT_SECRET not set in .env — HS256 JWT verification will fail"
            )


# Validate settings on import
settings = Settings()
settings.validate()
