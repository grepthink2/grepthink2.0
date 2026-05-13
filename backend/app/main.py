"""
FastAPI application initialization and configuration
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configure logging *before* importing anything that creates module-level loggers
# so child loggers inherit the configured handlers.
from app.logging_config import configure_logging
configure_logging()

from app.config import settings
from app.middleware import SecurityHeadersMiddleware
from app.health.url import router as health_router
from app.auth.url import router as auth_router
from app.classes.url import router as classes_router
from app.projects.url import router as projects_router
from app.assignments.url import router as assignments_router
from app.tsr.url import router as tsr_router
from app.messages.url import router as messages_router
from app.profiles.url import router as profiles_router

logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="GrepThink 2.0 API",
    description="Backend API for GrepThink 2.0",
    version="2.0.0"
)

logger.info("FastAPI app initialized | title=%s version=%s", app.title, app.version)

# Security headers run first so they apply even when CORS rejects a
# preflight. Starlette runs middleware in reverse registration order,
# so the LAST add_middleware call is the OUTERMOST middleware. We want
# CORS to be outermost (it handles OPTIONS preflight), so register the
# security headers first and CORS second.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_CREDENTIALS,
    allow_methods=settings.CORS_METHODS,
    allow_headers=settings.CORS_HEADERS,
)

# Include routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(classes_router)
app.include_router(projects_router)
app.include_router(assignments_router)
app.include_router(tsr_router)
app.include_router(messages_router)
app.include_router(profiles_router)
