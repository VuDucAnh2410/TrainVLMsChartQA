"""
Model inference service
"""
import torch
from PIL import Image
from qwen_vl_utils import process_vision_info
from app.models.vlm_model import vlm_model


def run_inference(image_path: str, question: str, max_new_tokens: int = 128) -> str:
    """
    Run VLM inference on image and question
    
    Args:
        image_path: Path to image file
        question: Question text
        max_new_tokens: Maximum tokens to generate
        
    Returns:
        Generated answer text
    """
    # Ensure model is loaded
    model = vlm_model.model
    processor = vlm_model.processor
    tokenizer = vlm_model.tokenizer
    device = vlm_model.device
    
    # Prepare messages with image
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "image": image_path,
                },
                {"type": "text", "text": question},
            ],
        }
    ]
    
    # Preparation for inference
    text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    image_inputs, video_inputs = process_vision_info(messages)
    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt",
    )
    inputs = inputs.to(device)
    
    # Inference
    with torch.inference_mode():
        generated_ids = model.generate(
            **inputs, 
            max_new_tokens=max_new_tokens,
            do_sample=False,
        )
    generated_ids_trimmed = [
        out_ids[len(in_ids) :] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
    ]
    output_text = processor.batch_decode(
        generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )
    
    return output_text[0].strip() if output_text else ""
