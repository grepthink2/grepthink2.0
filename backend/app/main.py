"""
FastAPI application wiring: middleware, exception handlers, routers, lifespan.

Business logic lives in ``app/<feature>/controller.py``; shared helpers in
``app/core``; background work in ``app/jobs``. Nothing here should need to
change when a feature changes.
"""

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.assignments.url import router as assignments_router
from app.attendance.url import router as attendance_router
from app.auth.url import router as auth_router
from app.classes.url import router as classes_router
from app.config import settings
from app.contact.url import router as contact_router
from app.core.errors import install_exception_handlers
from app.core.sentry import SentryFlushMiddleware, init_sentry
from app.health.url import router as health_router
from app.jobs.pending_invites import run_forever as run_pending_invites
from app.limiter import limiter
from app.messages.url import router as messages_router
from app.middleware import SecurityHeadersMiddleware
from app.notifications.url import router as notifications_router
from app.profiles.url import router as profiles_router
from app.projects.url import router as projects_router
from app.scrum.url import router as scrum_router
from app.staffing.url import router as staffing_router
from app.stats.url import router as stats_router
from app.tas.url import router as tas_router
from app.tsr.url import router as tsr_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(run_pending_invites(settings.PENDING_INVITES_POLL_SECONDS))
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


# Error reporting: a no-op unless SENTRY_DSN is set (app/core/sentry.py). It starts
# before the app is built so the SDK's FastAPI integration can instrument it.
sentry_enabled = init_sentry()

app = FastAPI(
    title="GrepThink 2.0 API",
    description="Backend API for GrepThink 2.0",
    version="2.0.0",
    lifespan=lifespan,
)

# Errors: rate-limit responses from slowapi, and a fixed 500 body for anything
# a route did not translate into an HTTPException (never leaks exception text).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
install_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_CREDENTIALS,
    allow_methods=settings.CORS_METHODS,
    allow_headers=settings.CORS_HEADERS,
)
# Defensive security headers on every response.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SlowAPIMiddleware)
if sentry_enabled:
    # Added last, so it is outermost and every response passes through it: a response
    # waits until the Sentry events it caused are delivered, because Vercel may freeze
    # the function as soon as the response is complete.
    app.add_middleware(SentryFlushMiddleware)

for router in (
    health_router,
    auth_router,
    classes_router,
    projects_router,
    assignments_router,
    tsr_router,
    staffing_router,
    messages_router,
    profiles_router,
    contact_router,
    notifications_router,
    tas_router,
    stats_router,
    attendance_router,
    scrum_router,
):
    app.include_router(router)
