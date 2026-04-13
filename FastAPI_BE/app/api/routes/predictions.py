"""
Prediction endpoints
"""
import time
import uuid
from fastapi import APIRouter, HTTPException
from app.schemas.schemas import PredictRequest, PredictResponse
from app.services import storage
from app.services.inference import run_inference
from app.core.config import UPLOADS_DIR

router = APIRouter()


@router.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest):
    """Run model prediction on image and question"""
    t0 = time.time()
    
    # Get conversation
    conv = storage.get_conversation(body.chartId)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện")
    
    # Check if image exists
    image_file = conv.get("imageFile")
    if not image_file:
        raise HTTPException(
            status_code=400,
            detail="Chưa có ảnh ngữ cảnh cho phiên này. Hãy upload ảnh trước."
        )
    
    image_path = UPLOADS_DIR / image_file
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy file ảnh")
    
    # Run inference
    try:
        max_new_tokens = body.params.get("max_new_tokens", 128)
        answer = run_inference(str(image_path), body.question, max_new_tokens)
        status = "ok"
    except Exception as e:
        answer = f"Error: {str(e)}"
        status = "error"
    
    latency_ms = int((time.time() - t0) * 1000)
    
    # Create result
    result = {
        "id": f"pa_{uuid.uuid4().hex[:10]}",
        "chartId": body.chartId,
        "question": body.question,
        "answer": answer,
        "reasoning": answer,
        "latencyMs": latency_ms,
        "status": status,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    
    # Save to log
    storage.save_predict_log(body.chartId, result)
    
    return result


@router.get("/predict/log")
def get_predict_log(chartId: str):
    """Get prediction log for a conversation"""
    if not chartId:
        raise HTTPException(status_code=400, detail="Missing chartId parameter")
    
    return storage.get_predict_log(chartId)
