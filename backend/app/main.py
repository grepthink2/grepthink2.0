"""
FastAPI application initialization and configuration
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.config import settings
from app.limiter import limiter
from app.middleware import SecurityHeadersMiddleware
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
    version="2.0.0"
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
