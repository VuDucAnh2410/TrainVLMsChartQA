#!/usr/bin/env python3

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--json_path', type=str, required=True)
    parser.add_argument('--image_root', type=str, required=True)
    parser.add_argument('--split', type=str, default='test')
    parser.add_argument('--limit', type=int, default=None)
    parser.add_argument('--out_jsonl', type=str, required=True)
    parser.add_argument('--internvl_base_model', type=str, required=True)
    parser.add_argument('--internvl_checkpoint_dir', type=str, required=True)
    parser.add_argument('--internvl_load_8bit', action='store_true')
    parser.add_argument('--internvl_load_cpu', action='store_true', default=False)
    parser.add_argument('--internvl_image_size', type=int, default=448)
    parser.add_argument('--internvl_max_num_tiles', type=int, default=8)
    parser.add_argument('--max_new_tokens', type=int, default=64)
    parser.add_argument('--temperature', type=float, default=0)
    return parser.parse_args()

def _resolve(p: str) -> str:
    pp = Path(p)
    if pp.exists():
        return str(pp.resolve())
    return p

def _get_question(ex: dict) -> str:
    if "query" in ex:
        return "" if ex.get("query") is None else str(ex.get("query"))
    if "question" in ex:
        return "" if ex.get("question") is None else str(ex.get("question"))
    return ""

def _get_gt(ex: dict) -> str:
    if "label" in ex:
        label = ex.get("label")
        if isinstance(label, list) and label:
            return str(label[0])
        return "" if label is None else str(label)
    if "answer" in ex:
        return "" if ex.get("answer") is None else str(ex.get("answer"))
    return ""

def _get_image_path(image_root: str, split: str, ex: dict) -> str:
    if "image" in ex and isinstance(ex.get("image"), dict) and ex["image"].get("filename"):
        return str(Path(image_root) / split / ex["image"]["filename"])
    if "imgpath" in ex:
        return str(Path(image_root) / str(ex["imgpath"]))
    if "image_path" in ex:
        return str(Path(ex["image_path"]))
    raise KeyError("Cannot find image path in example")

def load_model(args):
    import torch
    from safetensors.torch import load_file
    from transformers import AutoModel, AutoTokenizer, BitsAndBytesConfig

    print(f"Loading model: {args.internvl_base_model}")

    base_model = _resolve(args.internvl_base_model)
    ckpt_dir = _resolve(args.internvl_checkpoint_dir)
    use_cuda = torch.cuda.is_available() and (not args.internvl_load_cpu)
    dtype = torch.float16 if use_cuda else torch.float32

    if args.internvl_load_8bit and use_cuda:
        bnb_config = BitsAndBytesConfig(
            load_in_8bit=True,
            bnb_8bit_compute_dtype=torch.float16,
        )
        model = AutoModel.from_pretrained(
            base_model,
            quantization_config=bnb_config,
            device_map=None,
            trust_remote_code=True,
            low_cpu_mem_usage=True,
            use_flash_attn=False,
        ).eval()
    else:
        model = AutoModel.from_pretrained(
            base_model,
            torch_dtype=dtype,
            device_map=None,
            trust_remote_code=True,
            low_cpu_mem_usage=True,
            use_flash_attn=False,
        ).eval()

    if use_cuda:
        model = model.to("cuda")

    adapter_file = str(Path(ckpt_dir) / "adapter_model.safetensors")
    if os.path.isfile(adapter_file):
        print(f"Loading adapter weights: {adapter_file}")
        device = next(model.parameters()).device
        sd = load_file(adapter_file, device=str(device))
        model.load_state_dict(sd, strict=False)
        tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True, use_fast=False)
        return model, tokenizer

    if os.path.isfile(str(Path(ckpt_dir) / "model.safetensors.index.json")) or os.path.isfile(str(Path(ckpt_dir) / "model.safetensors")):
        print(f"Loading finetuned checkpoint dir: {ckpt_dir}")
        model2 = AutoModel.from_pretrained(
            ckpt_dir,
            torch_dtype=dtype,
            device_map=None,
            trust_remote_code=True,
            low_cpu_mem_usage=True,
            use_flash_attn=False,
        ).eval()
        if use_cuda:
            model2 = model2.to("cuda")
        tokenizer = AutoTokenizer.from_pretrained(ckpt_dir, trust_remote_code=True, use_fast=False)
        return model2, tokenizer

    raise FileNotFoundError(f"Checkpoint dir not recognized: {ckpt_dir}")

def main():
    args = parse_args()
    import torch
    from app_internvl_chat import prepare_pixel_values

    print("Loading model...")
    model, tokenizer = load_model(args)

    print(f"Loading data from {args.json_path}")
    with open(args.json_path, 'r') as f:
        data = json.load(f)

    test_samples = data[args.split]
    if args.limit:
        test_samples = test_samples[:args.limit]

    print(f"Testing {len(test_samples)} samples")

    os.makedirs(os.path.dirname(args.out_jsonl), exist_ok=True)
    out_count = 0
    device = next(model.parameters()).device
    dtype = next(model.parameters()).dtype
    gen_config = {
        "max_new_tokens": args.max_new_tokens,
        "do_sample": bool(args.temperature and args.temperature > 0),
        "temperature": float(args.temperature) if args.temperature and args.temperature > 0 else 1.0,
    }
    with open(args.out_jsonl, 'w', encoding='utf-8') as f:
        for idx, sample in enumerate(test_samples):
            img_path = _get_image_path(args.image_root, args.split, sample)
            if not os.path.exists(img_path):
                continue

            image = Image.open(img_path).convert('RGB')
            question = _get_question(sample)
            gt = _get_gt(sample)

            pixel_values = prepare_pixel_values(
                image=image,
                image_size=args.internvl_image_size,
                max_num_tiles=args.internvl_max_num_tiles,
                dtype=dtype,
                device=device,
            )
            query = question.strip()
            if "<image>" not in query:
                query = "<image>\n" + query

            with torch.inference_mode():
                answer = model.chat(
                    tokenizer=tokenizer,
                    pixel_values=pixel_values,
                    question=query,
                    generation_config=gen_config,
                    history=None,
                    return_history=False,
                    num_patches_list=[pixel_values.shape[0]],
                )

            result = {
                'id': sample.get('index', sample.get('id', idx)),
                'question': question,
                'prediction': answer,
                'ground_truth': gt
            }
            f.write(json.dumps(result, ensure_ascii=False) + '\n')
            f.flush()
            out_count += 1

            if (idx + 1) % 10 == 0:
                print(f"Processed {idx + 1}/{len(test_samples)}")

    print(f"Saved {out_count} results to {args.out_jsonl}")

if __name__ == '__main__':
    main()
