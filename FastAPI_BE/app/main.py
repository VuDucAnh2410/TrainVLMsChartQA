"""
FastAPI application entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings, UPLOADS_DIR
from app.api.routes import health, conversations, predictions

# Create FastAPI app
app = FastAPI(
    title="ChartQA VLM API",
    description="Backend API for ChartQA VLM Testing System",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(conversations.router, tags=["Conversations"])
app.include_router(predictions.router, tags=["Predictions"])


@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    print("=" * 80)
    print("ChartQA VLM API Server")
    print("=" * 80)
    print(f"Service: {settings.SERVICE}")
    print(f"Model: {settings.MODEL_DIR}")
    print(f"Storage: {settings.STORAGE_ROOT}")
    print(f"Allow CPU: {settings.ALLOW_CPU}")
    print("=" * 80)
    print("Server is ready!")
    print(f"API docs: http://localhost:{settings.PORT}/docs")
    print("=" * 80)


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    print("Shutting down...")
