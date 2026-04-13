"""
API dependencies for dependency injection
"""
from app.models.vlm_model import vlm_model


def get_vlm_model():
    """Dependency to get VLM model instance"""
    return vlm_model
