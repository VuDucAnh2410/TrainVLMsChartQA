# FastAPI Backend - ChartQA VLM System

Backend API cho hệ thống ChartQA sử dụng model Qwen2.5-VL-3B-Instruct.

## Cấu trúc

```
FastAPI_BE/
├── app/
│   ├── api/routes/        # API endpoints
│   ├── core/              # Configuration
│   ├── models/            # VLM model loader
│   ├── schemas/           # Pydantic models
│   ├── services/          # Business logic
│   └── main.py            # FastAPI app
├── storage/               # Data & uploads (auto-created)
├── requirements.txt
├── start_server.bat       # Windows
├── start_server.sh        # Linux/Mac
└── README.md
```

## Cài đặt

### 1. Cài dependencies

```bash
pip install -r requirements.txt
```

### 2. Download model

Model Qwen2.5-VL-3B-Instruct (~7.5GB):

```bash
python download_model.py
```

Hoặc download thủ công từ HuggingFace:
```
https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct
```

Đặt vào: `../models/Qwen2.5-VL-3B-Instruct/`

### 3. Chạy server

**Windows:**
```bash
start_server.bat
```

**Linux/Mac:**
```bash
chmod +x start_server.sh
./start_server.sh
```

**Hoặc:**
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

Server: `http://localhost:8000`

### Conversations
- `POST /conversations` - Tạo mới
- `GET /charts` - Danh sách
- `GET /charts/{id}` - Chi tiết
- `PATCH /conversations/{id}` - Đổi tên
- `DELETE /conversations/{id}` - Xóa
- `POST /conversations/{id}/image` - Upload ảnh

### Predictions
- `POST /predict` - Gửi câu hỏi
- `GET /predict/log?chartId={id}` - Lịch sử

### Health
- `GET /health` - Kiểm tra server

## API Documentation

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Environment Variables

Prefix: `CIA_`

- `CIA_SERVICE` - Service name (default: `qwen`)
- `CIA_ALLOW_CPU` - Cho phép CPU (default: `false`)
- `CIA_PORT` - Port (default: `8000`)
- `CIA_MODEL_DIR` - Model path (default: `../models/Qwen2.5-VL-3B-Instruct`)

## Yêu cầu hệ thống

### GPU (khuyến nghị)
- CUDA-capable GPU
- VRAM: 6GB+ (RTX 3060 trở lên)
- Model chạy float16

### CPU (chậm)
- Set `CIA_ALLOW_CPU=true`
- RAM: 16GB+
- Inference: 1-2 phút/câu

## So sánh với Node.js Backend

| Feature | Node.js + Worker | FastAPI |
|---------|-----------------|---------|
| Kiến trúc | 2 processes | 1 process |
| Giao tiếp | stdin/stdout | Direct call |
| Performance | Chậm hơn (IPC) | Nhanh hơn |
| Code | Phức tạp | Đơn giản |
| Auto docs | Không | Có |
| Type safety | Không | Có |

## Troubleshooting

### Model không load
- Kiểm tra `CIA_MODEL_DIR` đúng chưa
- Đảm bảo đã download đầy đủ model

### CUDA not available
- Cài PyTorch với CUDA support
- Hoặc set `CIA_ALLOW_CPU=true` (rất chậm)

### Port đã dùng
- Đổi port: `CIA_PORT=8001`

### Import errors
- Chạy từ folder `FastAPI_BE`
- Dùng: `python -m uvicorn app.main:app`
