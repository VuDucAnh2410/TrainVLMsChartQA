"""
VLM Model loader and manager
"""
import torch
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
from app.core.config import settings


class VLMModel:
    """Singleton class to manage VLM model"""
    
    _instance = None
    _model = None
    _processor = None
    _tokenizer = None
    _device = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def load(self):
        """Load model into memory"""
        if self._model is not None:
            return
        
        print(f"Loading model from {settings.MODEL_DIR}...")
        
        use_cuda = torch.cuda.is_available()
        if not use_cuda and not settings.ALLOW_CPU:
            raise RuntimeError(
                "No CUDA available. Set CIA_ALLOW_CPU=true to use CPU (very slow)."
            )
        
        self._device = "cuda" if use_cuda else "cpu"
        dtype = torch.float16 if use_cuda else torch.float32
        
        self._processor = AutoProcessor.from_pretrained(settings.MODEL_DIR)
        self._model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            settings.MODEL_DIR,
            torch_dtype=dtype if use_cuda else None,
            device_map="auto" if use_cuda else None,
            low_cpu_mem_usage=True,
            ignore_mismatched_sizes=True,
        )
        
        if use_cuda and not hasattr(self._model, "device"):
            self._model = self._model.to("cuda")
        
        self._model.eval()
        self._tokenizer = self._processor.tokenizer
        
        print(f"✓ Model loaded on {self._device}")
    
    @property
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self._model is not None
    
    @property
    def device(self) -> str:
        """Get device name"""
        return str(self._device) if self._device else "not loaded"
    
    @property
    def model(self):
        """Get model instance"""
        if self._model is None:
            self.load()
        return self._model
    
    @property
    def processor(self):
        """Get processor instance"""
        if self._processor is None:
            self.load()
        return self._processor
    
    @property
    def tokenizer(self):
        """Get tokenizer instance"""
        if self._tokenizer is None:
            self.load()
        return self._tokenizer


# Global instance
vlm_model = VLMModel()
