import argparse
import json
import os
import sys
import time
from typing import Any


def _write(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


class _SPTokenizer:
    def __init__(self, model_dir: str):
        import re
        from pathlib import Path

        import sentencepiece as spm

        self.model_dir = model_dir
        self.sp = spm.SentencePieceProcessor()
        self.sp.load(str(Path(model_dir) / "tokenizer.model"))
        self.sp_vocab_size = int(self.sp.get_piece_size())

        cfg_path = Path(model_dir) / "tokenizer_config.json"
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except Exception:
            cfg = {}

        added = cfg.get("added_tokens_decoder") or {}
        self.token_to_id: dict[str, int] = {}
        self.id_to_token: dict[int, str] = {}
        for k, v in added.items():
            try:
                tid = int(k)
                tok = str((v or {}).get("content"))
            except Exception:
                continue
            if not tok:
                continue
            self.token_to_id[tok] = tid
            self.id_to_token[tid] = tok

        self.bos_token = str(cfg.get("bos_token") or "<s>")
        self.eos_token = str(cfg.get("eos_token") or "</s>")
        self.pad_token = str(cfg.get("pad_token") or self.eos_token)
        self.unk_token = str(cfg.get("unk_token") or "<unk>")
        self.add_bos_token = bool(cfg.get("add_bos_token", True))

        self.bos_token_id = self._token_to_id_fallback(self.bos_token)
        self.eos_token_id = self._token_to_id_fallback(self.eos_token)
        self.pad_token_id = self._token_to_id_fallback(self.pad_token)
        self.unk_token_id = self._token_to_id_fallback(self.unk_token)

        specials = list(self.token_to_id.keys())
        specials.sort(key=len, reverse=True)
        self._special_re = re.compile("(" + "|".join(re.escape(t) for t in specials) + ")") if specials else None
        self.padding_side = "right"

    def _token_to_id_fallback(self, tok: str) -> int:
        if tok in self.token_to_id:
            return int(self.token_to_id[tok])
        pid = int(self.sp.piece_to_id(tok))
        if pid >= 0:
            return pid
        return int(self.sp.unk_id())

    def convert_tokens_to_ids(self, tok: str) -> int:
        return self._token_to_id_fallback(tok)

    def _encode_text(self, text: str) -> list[int]:
        if not isinstance(text, str):
            text = str(text)

        def _enc(s: str) -> list[int]:
            s = str(s)
            s = s.encode("utf-8", "ignore").decode("utf-8", "ignore")
            try:
                return list(self.sp.encode(s, out_type=int))
            except TypeError:
                return list(self.sp.EncodeAsIds(s))

        if self._special_re is None:
            ids = _enc(text)
        else:
            parts = self._special_re.split(text)
            ids: list[int] = []
            for part in parts:
                if not part:
                    continue
                if part in self.token_to_id:
                    ids.append(int(self.token_to_id[part]))
                else:
                    ids.extend(_enc(part))
        if self.add_bos_token and (not ids or ids[0] != self.bos_token_id):
            ids = [self.bos_token_id] + ids
        return ids

    def __call__(self, text, return_tensors: str = "pt", padding: bool = False):
        import torch

        if isinstance(text, (str, bytes)):
            texts = [text]
        else:
            texts = list(text)
        norm_texts: list[str] = []
        for t in texts:
            if isinstance(t, bytes):
                norm_texts.append(t.decode("utf-8", "ignore"))
            elif isinstance(t, str):
                norm_texts.append(t)
            else:
                norm_texts.append(str(t))
        encoded = [self._encode_text(t) for t in norm_texts]
        max_len = max(len(x) for x in encoded) if padding else None

        input_ids: list[list[int]] = []
        attention_mask: list[list[int]] = []
        for ids in encoded:
            if max_len is None:
                input_ids.append(ids)
                attention_mask.append([1] * len(ids))
                continue

            pad_len = max_len - len(ids)
            if self.padding_side == "left":
                ids_p = [self.pad_token_id] * pad_len + ids
                mask = [0] * pad_len + [1] * len(ids)
            else:
                ids_p = ids + [self.pad_token_id] * pad_len
                mask = [1] * len(ids) + [0] * pad_len
            input_ids.append(ids_p)
            attention_mask.append(mask)

        if return_tensors == "pt":
            return {
                "input_ids": torch.tensor(input_ids, dtype=torch.long),
                "attention_mask": torch.tensor(attention_mask, dtype=torch.long),
            }
        return {"input_ids": input_ids, "attention_mask": attention_mask}

    def batch_decode(self, sequences, skip_special_tokens: bool = True) -> list[str]:
        outs: list[str] = []
        for seq in sequences:
            ids = [int(x) for x in list(seq)]
            if skip_special_tokens:
                filt: list[int] = []
                for ii in ids:
                    if ii in self.id_to_token:
                        continue
                    if ii in {self.bos_token_id, self.eos_token_id, self.pad_token_id}:
                        continue
                    if ii >= self.sp_vocab_size:
                        continue
                    filt.append(ii)
                ids = filt
            else:
                ids = [ii for ii in ids if ii < self.sp_vocab_size]
            outs.append(str(self.sp.decode(ids)))
        return outs

    def decode(self, sequence, skip_special_tokens: bool = True) -> str:
        return self.batch_decode([sequence], skip_special_tokens=skip_special_tokens)[0]


def _load_internvl(model_dir: str):
    import torch
    from transformers import AutoModel

    if not model_dir or (not os.path.isdir(model_dir)):
        raise RuntimeError(
            f"Không thấy thư mục model InternVL tại: {model_dir}. "
            "Hãy kiểm tra lại CIA_INTERN_MODEL_DIR hoặc đảm bảo model đã được tải về server."
        )

    use_cuda = torch.cuda.is_available()
    allow_cpu = os.environ.get("CIA_ALLOW_CPU", "false").strip().lower() == "true"
    if (not use_cuda) and (not allow_cpu):
        raise RuntimeError(
            "Không có CUDA (torch đang chạy CPU). Hãy cài torch CUDA hoặc đặt CIA_ALLOW_CPU=true (rất chậm)."
        )
    device = "cuda" if use_cuda else "cpu"
    dtype = torch.float16 if use_cuda else torch.float32

    model = AutoModel.from_pretrained(
        model_dir,
        trust_remote_code=True,
        low_cpu_mem_usage=False,
        torch_dtype=dtype if use_cuda else None,
        _fast_init=False,
    ).eval()
    tokenizer = _SPTokenizer(model_dir)
    model = model.to(device=device, dtype=dtype)
    return model, tokenizer, device, dtype


def _internvl_preprocess(image_path: str, input_size: int, max_num_tiles: int, device: str, dtype: Any):
    import torch
    import torchvision.transforms as T
    from PIL import Image
    from torchvision.transforms.functional import InterpolationMode

    IMAGENET_MEAN = (0.485, 0.456, 0.406)
    IMAGENET_STD = (0.229, 0.224, 0.225)

    def build_transform(size: int):
        return T.Compose(
            [
                T.Lambda(lambda img: img.convert("RGB") if img.mode != "RGB" else img),
                T.Resize((size, size), interpolation=InterpolationMode.BICUBIC),
                T.ToTensor(),
                T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            ]
        )

    def find_closest_aspect_ratio(aspect_ratio: float, target_ratios, width: int, height: int, image_size: int):
        best_ratio_diff = float("inf")
        best_ratio = (1, 1)
        area = width * height
        for ratio in target_ratios:
            target_aspect_ratio = ratio[0] / ratio[1]
            ratio_diff = abs(aspect_ratio - target_aspect_ratio)
            if ratio_diff < best_ratio_diff:
                best_ratio_diff = ratio_diff
                best_ratio = ratio
            elif ratio_diff == best_ratio_diff:
                if area > 0.5 * image_size * image_size * ratio[0] * ratio[1]:
                    best_ratio = ratio
        return best_ratio

    def dynamic_preprocess(image, min_num=1, max_num=12, image_size=448, use_thumbnail=True):
        orig_width, orig_height = image.size
        aspect_ratio = orig_width / orig_height
        target_ratios = set(
            (i, j)
            for n in range(min_num, max_num + 1)
            for i in range(1, n + 1)
            for j in range(1, n + 1)
            if i * j <= max_num and i * j >= min_num
        )
        target_ratios = sorted(target_ratios, key=lambda x: x[0] * x[1])
        target_aspect_ratio = find_closest_aspect_ratio(aspect_ratio, target_ratios, orig_width, orig_height, image_size)
        target_width = image_size * target_aspect_ratio[0]
        target_height = image_size * target_aspect_ratio[1]
        blocks = target_aspect_ratio[0] * target_aspect_ratio[1]
        resized_img = image.resize((target_width, target_height))
        processed_images = []
        for i in range(blocks):
            box = (
                (i % (target_width // image_size)) * image_size,
                (i // (target_width // image_size)) * image_size,
                ((i % (target_width // image_size)) + 1) * image_size,
                ((i // (target_width // image_size)) + 1) * image_size,
            )
            processed_images.append(resized_img.crop(box))
        if use_thumbnail and len(processed_images) != 1:
            processed_images.append(image.resize((image_size, image_size)))
        return processed_images

    image = Image.open(image_path).convert("RGB")
    transform = build_transform(input_size)
    images = dynamic_preprocess(image, image_size=input_size, use_thumbnail=True, max_num=max_num_tiles)
    pixel_values = torch.stack([transform(im) for im in images]).to(device=device, dtype=dtype)
    return pixel_values


def _internvl_answer(model, tokenizer, pixel_values, question: str, max_new_tokens: int):
    q_text = (question or "").strip()
    q_text = q_text.encode("utf-8", "ignore").decode("utf-8", "ignore")
    q_text = q_text.replace("\r\n", "\n")
    lines_in = [ln.strip() for ln in q_text.splitlines() if ln.strip()]
    lines_in = [ln for ln in lines_in if (not ln.lower().startswith("hãy trả lời bằng tiếng việt"))]
    if len(lines_in) >= 1 and lines_in[0].lower().startswith("câu hỏi:"):
        lines_in[0] = lines_in[0].split(":", 1)[1].strip()
    q_text = "\n".join([ln for ln in lines_in if ln])
    if "<image>" not in q_text:
        q_text = "<image>\n" + q_text
    vi_prefix = "Hãy trả lời bằng tiếng Việt, ngắn gọn và đúng trọng tâm. Không nhắc lại prompt hoặc system message."
    q_text = "<image>\n" + vi_prefix + "\n" + q_text.replace("<image>\n", "", 1)
    generation_config = {
        "max_new_tokens": max_new_tokens,
        "do_sample": False,
        "use_cache": False,
        "repetition_penalty": 1.08,
        "no_repeat_ngram_size": 3,
    }
    raw = str(model.chat(tokenizer, pixel_values, q_text, generation_config)).strip()
    lines = [ln.rstrip() for ln in raw.splitlines()]
    cleaned: list[str] = []
    for ln in lines:
        t = ln.strip()
        if not t:
            continue
        if "你是由上海人工智能实验室" in t:
            continue
        if t.startswith("Hãy trả lời bằng tiếng Việt"):
            continue
        if t.lower().startswith("câu hỏi:"):
            continue
        if t == question.strip():
            continue
        cleaned.append(ln)
    return "\n".join(cleaned).strip()


def _load_qwen(model_dir: str):
    import torch
    from transformers import AutoProcessor

    if not model_dir or (not os.path.isdir(model_dir)):
        raise RuntimeError(
            f"Không thấy thư mục model Qwen tại: {model_dir}. "
            "Hãy đảm bảo model đã được tải về server trong thư mục models."
        )

    try:
        from transformers import Qwen2_5_VLForConditionalGeneration
    except Exception as e:
        raise RuntimeError(
            "Python env hiện tại chưa hỗ trợ Qwen2.5-VL (thiếu Qwen2_5_VLForConditionalGeneration). "
            "Cần nâng `transformers` lên bản có Qwen2.5-VL (ví dụ `pip install -U transformers accelerate safetensors`)."
        ) from e

    use_cuda = torch.cuda.is_available()
    allow_cpu = os.environ.get("CIA_ALLOW_CPU", "false").strip().lower() == "true"
    if (not use_cuda) and (not allow_cpu):
        raise RuntimeError(
            "Không có CUDA (torch đang chạy CPU). Hãy cài torch CUDA hoặc đặt CIA_ALLOW_CPU=true (rất chậm)."
        )
    device = "cuda" if use_cuda else "cpu"
    dtype = torch.float16 if use_cuda else torch.float32

    processor = AutoProcessor.from_pretrained(model_dir)
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        model_dir,
        torch_dtype=dtype if use_cuda else None,
        device_map="auto" if use_cuda else None,
        low_cpu_mem_usage=True,
    )
    if use_cuda and getattr(model, "device", None) is None:
        model = model.to("cuda")
    model.eval()
    tokenizer = processor.tokenizer
    return model, processor, tokenizer, device


def _qwen_answer(model, processor, tokenizer, image_path: str, question: str, max_new_tokens: int):
    import torch
    from PIL import Image

    image = Image.open(image_path).convert("RGB")
    messages = [
        {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": "Bạn là trợ lý thị giác-ngôn ngữ. Luôn trả lời bằng tiếng Việt, ngắn gọn và đúng trọng tâm.",
                }
            ],
        },
        {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": question}]},
    ]
    prompt = str(processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True))
    prompt = prompt.encode("utf-8", "ignore").decode("utf-8", "ignore")

    inputs = processor(text=[prompt], images=[image], return_tensors="pt", padding=True)
    device = next(model.parameters()).device
    for k, v in list(inputs.items()):
        if isinstance(v, torch.Tensor):
            inputs[k] = v.to(device)
    with torch.inference_mode():
        output_ids = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    input_ids = inputs["input_ids"]
    prompt_len = input_ids.shape[1]
    gen_ids = output_ids[0][prompt_len:]
    text = tokenizer.decode(gen_ids, skip_special_tokens=True)
    return str(text).strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--service", choices=["qwen", "intern"], required=True)
    ap.add_argument("--repo_root", required=True)
    args = ap.parse_args()

    try:
        sys.stderr.write(f"CIA worker boot service={args.service}\n")
        sys.stderr.flush()
    except Exception:
        pass

    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

    repo_root = os.path.abspath(args.repo_root)
    if args.service == "intern":
        model_dir = os.environ.get("CIA_INTERN_MODEL_DIR", "").strip()
        if not model_dir:
            candidate = os.path.join(repo_root, "models", "InternVL2-4B")
            if os.path.isdir(candidate):
                model_dir = candidate
            else:
                model_dir = os.path.join(repo_root, "out_final", "out_intern", "checkpoint-17685")
    else:
        model_dir = os.path.join(repo_root, "models", "Qwen2.5-VL-3B-Instruct")

    loaded = False
    intern = None
    qwen = None

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except Exception:
                continue

            request_id = req.get("requestId")
            if not request_id:
                continue

            try:
                if not loaded:
                    if args.service == "intern":
                        intern = _load_internvl(model_dir)
                    else:
                        qwen = _load_qwen(model_dir)
                    loaded = True

                image_path = str(req.get("imagePath") or "").strip()
                question = str(req.get("question") or "").strip()
                params = req.get("params") or {}
                max_new_tokens = int(params.get("max_new_tokens") or 128)

                if not image_path or not os.path.exists(image_path):
                    raise RuntimeError("Chưa có ảnh ngữ cảnh cho phiên này. Hãy upload ảnh trước.")

                t0 = time.time()
                if args.service == "intern":
                    model, tokenizer, device, dtype = intern
                    pixel_values = _internvl_preprocess(image_path, input_size=448, max_num_tiles=12, device=device, dtype=dtype)
                    answer = _internvl_answer(model, tokenizer, pixel_values, question=question, max_new_tokens=max_new_tokens)
                else:
                    model, processor, tokenizer, _device = qwen
                    answer = _qwen_answer(model, processor, tokenizer, image_path=image_path, question=question, max_new_tokens=max_new_tokens)

                _write(
                    {
                        "requestId": request_id,
                        "answer": answer,
                        "reasoning": answer,
                        "latencyMs": int((time.time() - t0) * 1000),
                    }
                )
            except Exception as e:
                import traceback

                _write({"requestId": request_id, "error": str(e), "trace": traceback.format_exc(limit=6)})
    finally:
        try:
            sys.stderr.write("CIA worker stdin closed (EOF)\n")
            sys.stderr.flush()
        except Exception:
            pass


if __name__ == "__main__":
    main()
