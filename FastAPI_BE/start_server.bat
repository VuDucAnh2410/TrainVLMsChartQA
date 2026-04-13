@echo off
echo ================================================================================
echo FASTAPI BACKEND - CHARTQA VLM TESTING SYSTEM
echo ================================================================================
echo.
echo Setting up environment...
set CIA_SERVICE=qwen
set CIA_ALLOW_CPU=true
set PORT=8000
set CIA_MODEL_DIR=../models/Qwen2.5-VL-3B-Instruct
echo.
echo Starting FastAPI server...
echo Server will be available at: http://localhost:8000
echo API docs at: http://localhost:8000/docs
echo.
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
