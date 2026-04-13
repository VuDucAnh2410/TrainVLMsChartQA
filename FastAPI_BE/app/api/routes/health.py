"""
Health check endpoints
"""
import time
from fastapi import APIRouter, Depends
from app.schemas.schemas import HealthResponse
from app.api.dependencies import get_vlm_model
from app.core.config import settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check(model=Depends(get_vlm_model)):
    """Health check endpoint"""
    return {
        "ok": True,
        "service": settings.SERVICE,
        "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": {
            "enabled": True,
            "loaded": model.is_loaded,
            "device": model.device,
            "allowCpu": settings.ALLOW_CPU,
        }
    }
