import argparse
from pathlib import Path
from typing import Any, Dict, List


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--base_model", type=str, default="models/Qwen2.5-VL-3B-Instruct")
    p.add_argument("--adapter_dir", type=str, default="out_qwen_final/out_qwen")
    p.add_argument("--host", type=str, default="127.0.0.1")
    p.add_argument("--port", type=int, default=7860)
    p.add_argument("--share", action="store_true")
    p.add_argument("--load_4bit", action="store_true", default=True)
    p.add_argument("--no_load_4bit", action="store_false", dest="load_4bit")
    p.add_argument("--load_cpu", action="store_true", default=False)
    p.add_argument("--dtype", choices=["fp16", "bf16"], default="fp16")
    p.add_argument("--max_new_tokens", type=int, default=512)
    p.add_argument("--temperature", type=float, default=0.2)
    p.add_argument("--top_p", type=float, default=0.9)
    return p.parse_args()


def resolve_path(p: str) -> str:
    pp = Path(p)
    if pp.exists():
        return str(pp.resolve())
    return p


def load_pipeline(base_model: str, adapter_dir: str, load_4bit: bool, load_cpu: bool, dtype_name: str) -> tuple[Any, Any, Any]:
    import torch
    from peft import PeftModel
    from transformers import AutoProcessor, BitsAndBytesConfig, Qwen2_5_VLForConditionalGeneration

    base_model = resolve_path(base_model)
    adapter_dir = resolve_path(adapter_dir)

    use_cuda = torch.cuda.is_available() and (not load_cpu)
    dtype = torch.float16 if (use_cuda and dtype_name == "fp16") else (torch.bfloat16 if use_cuda else torch.float32)
    if use_cuda and (not load_4bit):
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        if vram_gb < 12:
            raise SystemExit(
                f"GPU VRAM {vram_gb:.1f}GB quá thấp để load Qwen2.5-VL-3B full precision. "
                "Hãy dùng mặc định 4-bit (bỏ --no_load_4bit) hoặc dùng --load_cpu."
            )
    processor = AutoProcessor.from_pretrained(base_model)
    if use_cuda and load_4bit:
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=dtype,
        )
        base = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            base_model,
            quantization_config=quant_config,
            device_map="auto",
            low_cpu_mem_usage=True,
        )
    else:
        base = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            base_model,
            torch_dtype=dtype,
            device_map="auto" if use_cuda else None,
            low_cpu_mem_usage=True,
        )
        if use_cuda and getattr(base, "device", None) is None:
            base = base.to("cuda")

    model = PeftModel.from_pretrained(base, adapter_dir, is_trainable=False)
    model.eval()
    tokenizer = processor.tokenizer
    return model, processor, tokenizer


def to_pil_image(img: Any) -> Any:
    from PIL import Image

    if img is None:
        return None
    if isinstance(img, Image.Image):
        return img.convert("RGB")
    try:
        import numpy as np

        if isinstance(img, np.ndarray):
            return Image.fromarray(img).convert("RGB")
    except Exception:
        pass
    return img


def generate_answer(
    model: Any,
    processor: Any,
    tokenizer: Any,
    history: List[Dict[str, str]],
    image: Any,
    user_text: str,
    max_new_tokens: int,
    temperature: float,
    top_p: float,
) -> str:
    import torch

    messages: List[dict] = [
        {
            "role": "system",
            "content": [{"type": "text", "text": "You are a helpful vision-language assistant."}],
        }
    ]
    for m in history:
        role = m.get("role")
        content = m.get("content", "")
        if role not in {"user", "assistant"}:
            continue
        messages.append({"role": role, "content": [{"type": "text", "text": str(content)}]})

    user_content: List[dict] = []
    images = None
    if image is not None:
        user_content.append({"type": "image"})
        images = [[image]]
    user_content.append({"type": "text", "text": user_text})
    messages.append({"role": "user", "content": user_content})

    prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = processor(
        text=[prompt],
        images=images,
        return_tensors="pt",
        padding=True,
    )
    device = next(model.parameters()).device
    for k, v in list(inputs.items()):
        if isinstance(v, torch.Tensor):
            inputs[k] = v.to(device)

    with torch.inference_mode():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=temperature > 0,
            temperature=temperature,
            top_p=top_p,
        )

    prompt_len = inputs["input_ids"].shape[1]
    gen_ids = output_ids[0][prompt_len:]
    text = tokenizer.decode(gen_ids, skip_special_tokens=True)
    return text.strip()


def normalize_chat_history(chat_history: Any) -> List[Dict[str, str]]:
    if not isinstance(chat_history, list):
        return []
    out: List[Dict[str, str]] = []
    for item in chat_history:
        if isinstance(item, dict):
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and isinstance(content, (str, int, float)):
                out.append({"role": role, "content": str(content)})
            continue
        if isinstance(item, (list, tuple)) and len(item) == 2:
            u, a = item
            out.append({"role": "user", "content": "" if u is None else str(u)})
            out.append({"role": "assistant", "content": "" if a is None else str(a)})
            continue
    return out


def main() -> None:
    args = parse_args()
    try:
        import gradio as gr
    except Exception:
        raise SystemExit("Missing dependency: gradio. Install with: pip install gradio")

    model, processor, tokenizer = load_pipeline(
        args.base_model,
        args.adapter_dir,
        load_4bit=args.load_4bit,
        load_cpu=args.load_cpu,
        dtype_name=args.dtype,
    )

    def respond(
        image: Any,
        user_text: str,
        chat_history: List[Dict[str, str]],
        image_state: Any,
    ) -> tuple[List[Dict[str, str]], List[Dict[str, str]], Any, str]:
        chat_history = normalize_chat_history(chat_history)
        img = to_pil_image(image) if image is not None else image_state
        if img is None:
            out = "Bạn cần upload 1 ảnh (hoặc giữ ảnh đã upload trước đó) để hỏi."
            updated = chat_history + [{"role": "user", "content": user_text}, {"role": "assistant", "content": out}]
            return updated, updated, image_state, ""
        user_text = (user_text or "").strip()
        if not user_text:
            out = "Bạn cần nhập câu hỏi."
            return chat_history, chat_history, img, ""
        answer = generate_answer(
            model=model,
            processor=processor,
            tokenizer=tokenizer,
            history=chat_history,
            image=img,
            user_text=user_text,
            max_new_tokens=args.max_new_tokens,
            temperature=args.temperature,
            top_p=args.top_p,
        )
        updated = chat_history + [{"role": "user", "content": user_text}, {"role": "assistant", "content": answer}]
        return updated, updated, img, ""

    def clear() -> tuple[List[Dict[str, str]], List[Dict[str, str]], Any, str]:
        return [], [], None, ""

    with gr.Blocks() as demo:
        gr.Markdown("# Qwen2.5-VL + LoRA (ChartQA) Demo")
        with gr.Row():
            with gr.Column(scale=1):
                image_in = gr.Image(type="pil", label="Ảnh")
                clear_btn = gr.Button("Clear")
            with gr.Column(scale=2):
                chatbot = gr.Chatbot(label="Chat", height=520)
                txt = gr.Textbox(label="Câu hỏi", placeholder="Nhập câu hỏi (có thể gõ tiếng Việt) rồi bấm Send", lines=2)
                send_btn = gr.Button("Send")

        state_history = gr.State([])
        state_image = gr.State(None)

        send_btn.click(
            respond,
            inputs=[image_in, txt, state_history, state_image],
            outputs=[chatbot, state_history, state_image, txt],
        )
        clear_btn.click(clear, inputs=[], outputs=[chatbot, state_history, state_image, txt])

    demo.queue().launch(server_name=args.host, server_port=args.port, share=args.share)


if __name__ == "__main__":
    main()
