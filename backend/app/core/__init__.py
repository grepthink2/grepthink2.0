"""Cross-cutting building blocks shared by every feature module.

- ``app.core.db``     — the Supabase client accessor and query fan-out pool.
- ``app.core.authz``  — class / enrollment / project authorization helpers.
- ``app.core.errors`` — the application-wide exception handler.

Feature modules (``app/<feature>/{url,views,controller,models}.py``) import
from here instead of re-implementing these pieces locally.
"""
