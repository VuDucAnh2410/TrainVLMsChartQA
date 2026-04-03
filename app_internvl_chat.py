import argparse
from pathlib import Path
from typing import Any, Dict, List


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--base_model", type=str, default="models/InternVL2-4B")
    p.add_argument("--checkpoint_dir", type=str, default="out_intern/checkpoint-17685")
    p.add_argument("--host", type=str, default="127.0.0.1")
    p.add_argument("--port", type=int, default=7862)
    p.add_argument("--share", action="store_true")
    p.add_argument("--max_new_tokens", type=int, default=512)
    p.add_argument("--temperature", type=float, default=0.2)
    p.add_argument("--image_size", type=int, default=448)
    p.add_argument("--max_num_tiles", type=int, default=8)
    p.add_argument("--load_8bit", action="store_true", default=False)
    p.add_argument("--load_cpu", action="store_true", default=False)
    return p.parse_args()


def resolve_path(p: str) -> str:
    pp = Path(p)
    if pp.exists():
        return str(pp.resolve())
    return p


def load_pipeline(base_model: str, checkpoint_dir: str, load_8bit: bool, load_cpu: bool) -> tuple[Any, Any]:
    import torch
    from transformers import AutoModel, AutoTokenizer

    base_model = resolve_path(base_model)
    checkpoint_dir = resolve_path(checkpoint_dir)

    use_cuda = torch.cuda.is_available() and (not load_cpu)
    dtype = torch.bfloat16 if use_cuda else torch.float32
    load_in_8bit = bool(load_8bit and use_cuda)
    device_map = "auto" if load_in_8bit else None

    model = AutoModel.from_pretrained(
        base_model,
        torch_dtype=(torch.float16 if load_in_8bit else dtype),
        low_cpu_mem_usage=True,
        trust_remote_code=True,
        use_flash_attn=False,
        load_in_8bit=load_in_8bit,
        device_map=device_map,
    ).eval()
    if use_cuda and not load_in_8bit:
        model = model.to("cuda")

    tokenizer = AutoTokenizer.from_pretrained(checkpoint_dir, trust_remote_code=True, use_fast=False)
    from transformers.modeling_utils import load_sharded_checkpoint

    load_sharded_checkpoint(model, checkpoint_dir, strict=False)
    return model, tokenizer


def _build_transform(input_size: int) -> Any:
    import torchvision.transforms as T
    from torchvision.transforms.functional import InterpolationMode

    mean = (0.485, 0.456, 0.406)
    std = (0.229, 0.224, 0.225)
    return T.Compose(
        [
            T.Lambda(lambda img: img.convert("RGB") if getattr(img, "mode", None) != "RGB" else img),
            T.Resize((input_size, input_size), interpolation=InterpolationMode.BICUBIC),
            T.ToTensor(),
            T.Normalize(mean=mean, std=std),
        ]
    )


def _dynamic_preprocess(image: Any, image_size: int, use_thumbnail: bool, max_num: int) -> list[Any]:
    w, h = image.size
    aspect_ratio = w / h
    target_ratios = set()
    for i in range(1, max_num + 1):
        for j in range(1, max_num + 1):
            if i * j <= max_num:
                target_ratios.add((i, j))
    target_ratios = sorted(list(target_ratios), key=lambda x: x[0] * x[1])

    best_ratio = (1, 1)
    best_diff = float("inf")
    for ratio in target_ratios:
        target_aspect_ratio = ratio[0] / ratio[1]
        diff = abs(aspect_ratio - target_aspect_ratio)
        if diff < best_diff:
            best_diff = diff
            best_ratio = ratio

    target_width = image_size * best_ratio[0]
    target_height = image_size * best_ratio[1]
    resized = image.resize((target_width, target_height))
    blocks = best_ratio[0] * best_ratio[1]
    processed_images = []
    for i in range(blocks):
        box = (
            (i % (target_width // image_size)) * image_size,
            (i // (target_width // image_size)) * image_size,
            ((i % (target_width // image_size)) + 1) * image_size,
            ((i // (target_width // image_size)) + 1) * image_size,
        )
        processed_images.append(resized.crop(box))
    if use_thumbnail and len(processed_images) != 1:
        processed_images.append(image.resize((image_size, image_size)))
    return processed_images


def prepare_pixel_values(image: Any, image_size: int, max_num_tiles: int, dtype: Any, device: Any) -> Any:
    import torch

    transform = _build_transform(image_size)
    images = _dynamic_preprocess(image, image_size=image_size, use_thumbnail=True, max_num=max_num_tiles)
    pixel_values = torch.stack([transform(im) for im in images])
    return pixel_values.to(device=device, dtype=dtype)


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


def _direct_generate(model: Any, tokenizer: Any, pixel_values: Any, question: str,
                     history: Any, device: Any, gen_config: dict) -> str:
    """Fallback generation using the internal logic directly."""
    # Get conversation template
    template = model.get_conv_template(model.template)
    template.system_message = model.system_message

    # Add history to template
    hist = [] if history is None else history
    for (old_q, old_a) in hist:
        template.append_message(template.roles[0], old_q)
        template.append_message(template.roles[1], old_a)
    template.append_message(template.roles[0], question)
    template.append_message(template.roles[1], None)
    query = template.get_prompt()

    # Replace <image> with actual image tokens
    num_patches = pixel_values.shape[0]
    IMG_START_TOKEN = '<img>'
    IMG_END_TOKEN = '</img>'
    IMG_CONTEXT_TOKEN = '<IMG_CONTEXT>'
    image_tokens = IMG_START_TOKEN + IMG_CONTEXT_TOKEN * model.num_image_token * num_patches + IMG_END_TOKEN
    query = query.replace('<image>', image_tokens, 1)

    # Tokenize
    model_inputs = tokenizer(query, return_tensors='pt')
    input_ids = model_inputs['input_ids'].to(device)
    attention_mask = model_inputs['attention_mask'].to(device)

    # Set eos token id
    eos_token_id = tokenizer.convert_tokens_to_ids(template.sep.strip())

    # Generate - pass only valid params
    gen_output = model.generate(
        pixel_values=pixel_values,
        input_ids=input_ids,
        attention_mask=attention_mask,
        max_new_tokens=gen_config.get("max_new_tokens", 512),
        do_sample=gen_config.get("do_sample", False),
        temperature=gen_config.get("temperature", 1.0),
        eos_token_id=eos_token_id,
    )
    response = tokenizer.batch_decode(gen_output, skip_special_tokens=True)[0]
    response = response.split(template.sep.strip())[0].strip()
    return response


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


def generate_answer(
    model: Any,
    tokenizer: Any,
    history: Any,
    image: Any,
    user_text: str,
    max_new_tokens: int,
    temperature: float,
    image_size: int,
    max_num_tiles: int,
) -> tuple[str, Any]:
    import torch

    device = next(model.parameters()).device
    dtype = next(model.parameters()).dtype
    pixel_values = prepare_pixel_values(image, image_size=image_size, max_num_tiles=max_num_tiles, dtype=dtype, device=device)
    question = user_text.strip()
    if question and "trả lời" not in question.lower():
        question = "Trả lời bằng tiếng Việt. Nếu cần phân tích thì giải thích ngắn gọn, rõ ràng.\n" + question
    if "<image>" not in question:
        question = "<image>\n" + question
    generation_config = dict(
        max_new_tokens=max_new_tokens,
        do_sample=temperature > 0,
        temperature=temperature if temperature > 0 else 1.0,
    )
    # Prepare generation config as simple dict to avoid extra keys
    gen_config_dict = {
        "max_new_tokens": generation_config.get("max_new_tokens", 512),
        "do_sample": generation_config.get("do_sample", False),
        "temperature": generation_config.get("temperature", 1.0) if generation_config.get("temperature", 1.0) > 0 else 1.0,
    }

    # Process history format
    hist = [] if history is None else history

    with torch.inference_mode():
        response = _direct_generate(model, tokenizer, pixel_values, question, hist, device, gen_config_dict)
        new_history = hist + [(question, response)]

    return str(response).strip(), new_history


def main() -> None:
    args = parse_args()
    try:
        import gradio as gr
    except Exception:
        raise SystemExit("Missing dependency: gradio. Install with: pip install gradio")

    model, tokenizer = load_pipeline(args.base_model, args.checkpoint_dir, args.load_8bit, args.load_cpu)

    def respond(
        image: Any,
        user_text: str,
        chat_history: List[Dict[str, str]],
        image_state: Any,
        internvl_state: Any,
    ) -> tuple[List[Dict[str, str]], List[Dict[str, str]], Any, Any, str]:
        chat_history = normalize_chat_history(chat_history)
        img = to_pil_image(image) if image is not None else image_state
        if img is None:
            out = "Bạn cần upload 1 ảnh (hoặc giữ ảnh đã upload trước đó) để hỏi."
            updated = chat_history + [{"role": "user", "content": user_text}, {"role": "assistant", "content": out}]
            return updated, updated, image_state, internvl_state, ""
        user_text = (user_text or "").strip()
        if not user_text:
            out = "Bạn cần nhập câu hỏi."
            return chat_history, chat_history, img, internvl_state, ""

        answer, new_history = generate_answer(
            model=model,
            tokenizer=tokenizer,
            history=internvl_state,
            image=img,
            user_text=user_text,
            max_new_tokens=args.max_new_tokens,
            temperature=args.temperature,
            image_size=args.image_size,
            max_num_tiles=args.max_num_tiles,
        )
        updated = chat_history + [{"role": "user", "content": user_text}, {"role": "assistant", "content": answer}]
        return updated, updated, img, new_history, ""

    def clear() -> tuple[List[Dict[str, str]], List[Dict[str, str]], Any, Any, str]:
        return [], [], None, None, ""

    with gr.Blocks() as demo:
        gr.Markdown("# InternVL2-4B (ChartQA) Demo")
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
        state_internvl = gr.State(None)

        send_btn.click(
            respond,
            inputs=[image_in, txt, state_history, state_image, state_internvl],
            outputs=[chatbot, state_history, state_image, state_internvl, txt],
        )
        clear_btn.click(clear, inputs=[], outputs=[chatbot, state_history, state_image, state_internvl, txt])

    demo.queue().launch(server_name=args.host, server_port=args.port, share=args.share)


if __name__ == "__main__":
    main()
