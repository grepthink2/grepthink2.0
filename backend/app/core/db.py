"""Database access shared by every controller.

Every ``.execute()`` on the Supabase client is one HTTP round trip to
PostgREST. Controllers therefore batch related reads (``.in_()``, embedded
selects over foreign keys, bulk ``insert``/``upsert``) and fan independent
reads out through ``query_pool``. This module is the single place that decides
which client a controller talks through.
"""

from __future__ import annotations

from app.database.client import (
    _TRANSIENT_HTTPX_ERRORS as TRANSIENT_ERRORS,
)
from app.database.client import (
    query_pool,
    retry_on_disconnect,
    service_client,
    supabase,
)

__all__ = ["TRANSIENT_ERRORS", "get_client", "query_pool", "retry_on_disconnect"]


def get_client():
    """Return the service-role client when configured, else the anon client.

    The service-role client bypasses Row-Level Security, which is why every
    authorization decision lives in Python (see ``app.core.authz``). Without a
    service key the anon client is used and RLS applies to every query — the
    app then answers "not found" for rows the policies hide, so treat a
    missing ``SUPABASE_SERVICE_ROLE_KEY`` as a configuration error in any real
    deployment (``app.database.client`` logs a warning at startup).

    Tests replace the client by patching ``app.core.db.service_client``.
    """
    return service_client if service_client is not None else supabase
