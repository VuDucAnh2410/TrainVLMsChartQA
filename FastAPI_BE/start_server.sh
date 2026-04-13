#!/bin/bash
# ================================================================================
# FASTAPI BACKEND - CHARTQA VLM TESTING SYSTEM
# ================================================================================

echo "Setting up environment..."
export CIA_SERVICE=qwen
export CIA_ALLOW_CPU=true
export PORT=8000
export CIA_MODEL_DIR=../models/Qwen2.5-VL-3B-Instruct

echo ""
echo "Starting FastAPI server..."
echo "Server will be available at: http://localhost:8000"
echo "API docs at: http://localhost:8000/docs"
echo ""

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
