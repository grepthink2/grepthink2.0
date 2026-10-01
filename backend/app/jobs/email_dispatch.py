"""The in-process email dispatcher: one outbox dispatch run every few seconds, inside the API.

``app.main`` starts it from the lifespan only while ``EMAIL_DISPATCH_SECRET`` is unset and
``EMAIL_DISPATCH_IN_PROCESS`` is on, which by default it is only on Vercel production: so on PROD
until the ``pg_cron`` schedule that calls ``POST /api/email/dispatch`` exists, and locally when a
developer sets ``EMAIL_DISPATCH_IN_PROCESS=1``. Vercel pauses an instance between requests, so
there this loop runs only while some request keeps the instance awake; that is why production
dispatches on the schedule instead. Several processes may run the loop at once: the claim leases
each row to one of them.
"""

from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.core.errors import DatabaseUnavailableError
from app.outbox import controller as outbox

logger = logging.getLogger(__name__)


async def run_forever(interval_seconds: float) -> None:
    """Wait ``interval_seconds``, run ``outbox.dispatch_tick`` in a thread, repeat until cancelled.

    A run that raises is logged and the loop goes on: a database outage as a warning (every
    awake instance would otherwise file an error every few seconds until it ends), anything
    else with its traceback.
    """
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await asyncio.to_thread(
                outbox.dispatch_tick, budget_seconds=settings.EMAIL_DISPATCH_BUDGET_SECONDS
            )
        except DatabaseUnavailableError as err:
            logger.warning(
                "email_dispatch: the database is unavailable, trying again in %s s | pg_code=%s",
                interval_seconds,
                err.pg_code,
            )
        except Exception:
            logger.exception("email_dispatch: a dispatch run failed")
