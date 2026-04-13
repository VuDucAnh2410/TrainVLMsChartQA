"""
Pydantic schemas for request/response validation
"""
from typing import Optional
from pydantic import BaseModel


class ConversationCreate(BaseModel):
    title: Optional[str] = "Cuộc trò chuyện mới"
    description: Optional[str] = ""
    course: Optional[str] = "Qwen2.5-VL"


class ConversationUpdate(BaseModel):
    title: str


class ChartItem(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    course: Optional[str] = None
    type: str = "other"
    status: str = "new"
    createdAt: str
    fileName: Optional[str] = None
    imageUrl: Optional[str] = None


class PredictRequest(BaseModel):
    chartId: str
    question: str
    params: Optional[dict] = {}


class PredictResponse(BaseModel):
    id: str
    chartId: str
    question: str
    answer: str
    reasoning: str
    latencyMs: int
    status: str
    createdAt: str


class HealthResponse(BaseModel):
    ok: bool
    service: str
    time: str
    model: dict
