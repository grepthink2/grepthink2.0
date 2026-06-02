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
        reload=True,
        # Narrow what the reloader watches. By default, uvicorn watches the
        # entire cwd — which here includes `.venv/` (thousands of files),
        # `logs/` (rewritten on every request by our own log handlers), and
        # `tests/`. That's wasted cycles at best and a reload-thrash risk at
        # worst when a log rotation renames `app.out` → `app.out.1`. We only
        # want to reload when hand-written source under `app/` changes.
        reload_dirs=["app"],
        reload_excludes=["logs/*", "*.log", "*.out", "__pycache__/*"],
    )
