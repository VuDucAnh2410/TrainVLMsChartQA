"""
Conversation management endpoints
"""
import time
import uuid
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, UploadFile
from app.schemas.schemas import ChartItem, ConversationCreate, ConversationUpdate
from app.services import storage
from app.core.config import UPLOADS_DIR

router = APIRouter()


@router.get("/charts", response_model=list[ChartItem])
def list_charts():
    """Get all conversations"""
    return storage.get_all_conversations()


@router.get("/charts/{chart_id}", response_model=ChartItem)
def get_chart(chart_id: str):
    """Get a single conversation by ID"""
    conv = storage.get_conversation(chart_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện")
    return conv["item"]


@router.post("/conversations", response_model=ChartItem)
def create_conversation(body: ConversationCreate):
    """Create a new conversation"""
    conv_id = f"c_{uuid.uuid4().hex[:8]}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    
    item = {
        "id": conv_id,
        "title": body.title,
        "description": body.description,
        "course": body.course,
        "type": "other",
        "status": "new",
        "createdAt": now,
    }
    
    storage.save_conversation(conv_id, {"item": item})
    return item


@router.patch("/conversations/{chat_id}")
def update_conversation(chat_id: str, body: ConversationUpdate):
    """Update conversation title"""
    conv = storage.get_conversation(chat_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện")
    
    conv["item"]["title"] = body.title
    storage.save_conversation(chat_id, conv)
    
    return {"ok": True}


@router.delete("/conversations/{chat_id}")
def delete_conversation(chat_id: str):
    """Delete a conversation"""
    conv = storage.get_conversation(chat_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện")
    
    # Delete image file if exists
    if "imageFile" in conv:
        img_path = UPLOADS_DIR / conv["imageFile"]
        if img_path.exists():
            img_path.unlink()
    
    # Delete from database
    storage.delete_conversation(chat_id)
    
    return {"ok": True}


@router.post("/conversations/{chat_id}/image")
async def upload_image(chat_id: str, file: UploadFile = File(...)):
    """Upload image for a conversation"""
    conv = storage.get_conversation(chat_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện")
    
    # Save file
    ext = Path(file.filename).suffix or ".png"
    filename = f"{chat_id}{ext}"
    file_path = UPLOADS_DIR / filename
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Update conversation
    conv["imageFile"] = filename
    conv["item"]["fileName"] = file.filename
    conv["item"]["imageUrl"] = f"/uploads/{filename}"
    conv["item"]["status"] = "processed"
    
    storage.save_conversation(chat_id, conv)
    
    return {"ok": True, "imageUrl": conv["item"]["imageUrl"]}
