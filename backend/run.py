"""
Server entry point
"""
import uvicorn
from app.config import settings

if __name__ == '__main__':
    print(f"Starting GrepThink 2.0 server on {settings.HOST}:{settings.PORT}...")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True  # Enable auto-reload during development
    )
