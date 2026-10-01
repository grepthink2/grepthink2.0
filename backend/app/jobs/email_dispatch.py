"""The in-process email dispatcher: one outbox dispatch run every few seconds, inside the API.

``app.main`` starts it from the lifespan only while ``EMAIL_DISPATCH_SECRET`` is unset: in local
development, and on PROD until the ``pg_cron`` schedule that calls ``POST /api/email/dispatch``
exists. Vercel pauses an instance between requests, so there this loop runs only while some
request keeps the instance awake; that is why production dispatches on the schedule instead.
Several processes may run the loop at once: the claim leases each row to one of them.
"""

from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.outbox import controller as outbox

logger = logging.getLogger(__name__)


async def run_forever(interval_seconds: float) -> None:
    """Wait ``interval_seconds``, run ``outbox.dispatch_tick`` in a thread, repeat until cancelled.

    A run that raises is logged and the loop goes on.
    """
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await asyncio.to_thread(
                outbox.dispatch_tick, budget_seconds=settings.EMAIL_DISPATCH_BUDGET_SECONDS
            )
        except Exception:
            logger.exception("email_dispatch: a dispatch run failed")
