"""
FastAPI application initialization and configuration
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.health.url import router as health_router
from app.auth.url import router as auth_router
from app.classes.url import router as classes_router
from app.projects.url import router as projects_router
from app.assignments.url import router as assignments_router
from app.tsr.url import router as tsr_router
from app.staffing.url import router as staffing_router
from app.messages.url import router as messages_router

# Initialize FastAPI app
app = FastAPI(
    title="GrepThink 2.0 API",
    description="Backend API for GrepThink 2.0",
    version="2.0.0"
)

# Configure CORS middleware
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
app.include_router(staffing_router)
app.include_router(messages_router)
