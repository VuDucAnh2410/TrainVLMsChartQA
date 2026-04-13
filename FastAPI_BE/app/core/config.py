"""
Core configuration settings
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Service config
    SERVICE: str = "qwen"
    PORT: int = 8000
    
    # Model config
    MODEL_DIR: str = "../models/Qwen2.5-VL-3B-Instruct"
    ALLOW_CPU: bool = False
    
    # Storage
    STORAGE_ROOT: Path = Path(__file__).parent.parent.parent / "storage"
    
    # CORS
    CORS_ORIGINS: list = ["*"]
    
    class Config:
        env_prefix = "CIA_"
        case_sensitive = True


settings = Settings()

# Derived paths
UPLOADS_DIR = settings.STORAGE_ROOT / settings.SERVICE / "uploads"
DB_FILE = settings.STORAGE_ROOT / settings.SERVICE / "db.json"

# Ensure directories exist
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
