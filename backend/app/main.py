"""
FastAPI application initialization and configuration
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.config import settings
from app.limiter import limiter
from app.middleware import SecurityHeadersMiddleware

logger = logging.getLogger(__name__)


async def _process_pending_invites() -> None:
    """Poll pending_invites every 5 s and fire emails whose send_at has passed."""
    from app.database.client import service_client, supabase
    from app.classes.controller import bulk_invite_students
    from app.utils.email import send_email
    while True:
        await asyncio.sleep(5)
        try:
            import datetime
            client = service_client if service_client else supabase
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            rows = (
                client.table('pending_invites')
                .select('id, class_id, instructor_id, emails, custom_subject, custom_body')
                .lte('send_at', now_iso)
                .eq('cancelled', False)
                .eq('sent', False)
                .execute()
            )
            for row in (rows.data or []):
                # Mark sent first to prevent double-delivery on crash
                client.table('pending_invites').update({'sent': True}).eq('id', row['id']).execute()
                try:
                    if row.get('custom_subject') and row.get('custom_body'):
                        subject = row['custom_subject']
                        body_text = row['custom_body']
                        for email in row['emails']:
                            try:
                                await asyncio.to_thread(
                                    send_email,
                                    to=email,
                                    subject=subject,
                                    body_text=body_text,
                                )
                            except Exception:
                                logger.exception("pending_invite custom email failed: job=%s to=%s", row['id'], email)
                    else:
                        await asyncio.to_thread(
                            bulk_invite_students,
                            row['class_id'],
                            row['emails'],
                            row['instructor_id'],
                        )
                    logger.info("pending_invite sent: job=%s", row['id'])
                except Exception:
                    logger.exception("pending_invite failed: job=%s", row['id'])
        except Exception:
            logger.exception("pending_invite poll error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_process_pending_invites())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
from app.health.url import router as health_router
from app.auth.url import router as auth_router
from app.classes.url import router as classes_router
from app.projects.url import router as projects_router
from app.assignments.url import router as assignments_router
from app.tsr.url import router as tsr_router
from app.staffing.url import router as staffing_router
from app.messages.url import router as messages_router
from app.profiles.url import router as profiles_router
from app.contact.url import router as contact_router
from app.notifications.url import router as notifications_router
from app.tas.url import router as tas_router
from app.stats.url import router as stats_router
from app.attendance.url import router as attendance_router

# Initialize FastAPI app
app = FastAPI(
    title="GrepThink 2.0 API",
    description="Backend API for GrepThink 2.0",
    version="2.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_CREDENTIALS,
    allow_methods=settings.CORS_METHODS,
    allow_headers=settings.CORS_HEADERS,
)

# Attach defensive security headers to every response.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SlowAPIMiddleware)

# Include routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(classes_router)
app.include_router(projects_router)
app.include_router(assignments_router)
app.include_router(tsr_router)
app.include_router(staffing_router)
app.include_router(messages_router)
app.include_router(profiles_router)
app.include_router(contact_router)
app.include_router(notifications_router)
app.include_router(tas_router)
app.include_router(stats_router)
app.include_router(attendance_router)
