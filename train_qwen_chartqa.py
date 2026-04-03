#!/usr/bin/env python3
"""
Train Qwen2.5-VL on a local ChartQA-style dataset from one JSON metadata file + one image root.

Expected layout:
  dataset_root/
    chartqa_full_metadata.json
    images/
      train/<filename>
      val/<filename>
      test/<filename>

JSON structure:
  {
    "train": [{"image": {"filename": "..."}, "query": "...", "label": ["..."]}, ...],
    "val":   [...],
    "test":  [...]
  }

Recommended install:
  pip install -U git+https://github.com/huggingface/transformers accelerate
  pip install -U trl peft bitsandbytes datasets pillow tensorboard

Example:
  python train_qwen_chartqa.py \
    --json_path /data/chartqa_full_metadata.json \
    --image_root /data/images \
    --output_dir /data/out_qwen7b \
    --model_name Qwen/Qwen2.5-VL-7B-Instruct
"""

from __future__ import annotations

import argparse
import gc
import json
from pathlib import Path
from typing import Any, Dict, List

SYSTEM_MESSAGE = (
    "You are a vision-language assistant specialized in chart understanding. "
    "Answer briefly and accurately. Return only the final answer unless explanation is explicitly requested."
)


def normalize_text(x: Any) -> str:
    return " ".join(str(x).strip().split())


def load_split(json_path: Path, image_root: Path, split: str) -> List[Dict[str, Any]]:
    with json_path.open("r", encoding="utf-8") as f:
        meta = json.load(f)

    samples: List[Dict[str, Any]] = []
    for ex in meta[split]:
        image_path = image_root / split / ex["image"]["filename"]
        if not image_path.exists():
            raise FileNotFoundError(f"Missing image: {image_path}")

        answer = ex["label"][0] if isinstance(ex["label"], list) else ex["label"]
        sample = {
            "image_path": str(image_path),
            "messages": [
                {
                    "role": "system",
                    "content": [{"type": "text", "text": SYSTEM_MESSAGE}],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "image"},
                        {"type": "text", "text": normalize_text(ex["query"])},
                    ],
                },
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": normalize_text(answer)}],
                },
            ],
        }
        samples.append(sample)
    return samples


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--json_path", type=Path, required=True)
    p.add_argument("--image_root", type=Path, required=True)
    p.add_argument("--output_dir", type=Path, required=True)
    p.add_argument("--model_name", type=str, default="Qwen/Qwen2.5-VL-3B-Instruct",
                   help="Use 3B for cheaper training, 7B for potentially better accuracy.")
    p.add_argument("--finetune_mode", choices=["lora", "full"], default="lora")
    p.add_argument("--epochs", type=int, default=5)
    p.add_argument("--learning_rate", type=float, default=1e-4)
    p.add_argument("--train_batch_size", type=int, default=1)
    p.add_argument("--eval_batch_size", type=int, default=1)
    p.add_argument("--grad_accum", type=int, default=8)
    p.add_argument("--logging_steps", type=int, default=50)
    p.add_argument("--save_strategy", choices=["epoch", "steps"], default="epoch")
    p.add_argument("--save_steps", type=int, default=500)
    p.add_argument("--eval_steps", type=int, default=500)
    p.add_argument("--save_total_limit", type=int, default=10)
    p.add_argument("--min_pixels", type=int, default=192 * 28 * 28)
    p.add_argument("--max_pixels", type=int, default=512 * 28 * 28)
    p.add_argument("--lora_r", type=int, default=16)
    p.add_argument("--lora_alpha", type=int, default=32)
    p.add_argument("--lora_dropout", type=float, default=0.05)
    p.add_argument("--target_modules", type=str, default="all-linear",
                   help='"all-linear" or comma-separated module names like q_proj,k_proj,v_proj,o_proj')
    p.add_argument("--warmup_ratio", type=float, default=0.03)
    p.add_argument("--max_grad_norm", type=float, default=0.3)
    p.add_argument("--gradient_checkpointing", action="store_true", default=True)
    p.add_argument("--no_gradient_checkpointing", action="store_false", dest="gradient_checkpointing")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--max_steps", type=int, default=-1)
    p.add_argument(
        "--resume_from_checkpoint",
        type=str,
        default=None,
        help='Resume from a checkpoint directory. Use "auto" to pick the latest checkpoint in output_dir.',
    )
    p.add_argument("--check_only", action="store_true")
    p.add_argument("--check_n", type=int, default=0)
    return p.parse_args()

def prefer_local_model(model_name: str, base_dir: Path) -> str:
    p = Path(model_name)
    if p.exists():
        return str(p.resolve())
    if "/" in model_name and "\\" not in model_name and ":" not in model_name:
        candidate = (base_dir / "models" / model_name.split("/")[-1]).resolve()
        if candidate.exists():
            return str(candidate)
    return model_name


def main() -> None:
    args = parse_args()
    base_dir = Path(__file__).resolve().parent
    def _resolve(p: Path) -> Path:
        return p if p.is_absolute() else (base_dir / p).resolve()
    args.json_path = _resolve(args.json_path)
    args.image_root = _resolve(args.image_root)
    args.output_dir = _resolve(args.output_dir)
    args.model_name = prefer_local_model(args.model_name, base_dir)
    if args.check_only:
        with args.json_path.open("r", encoding="utf-8") as f:
            meta = json.load(f)

        check_n = max(0, int(args.check_n))
        missing: List[str] = []
        checked = {"train": 0, "val": 0, "test": 0}

        for split in ("train", "val", "test"):
            if split not in meta:
                raise KeyError(f"Missing split '{split}' in JSON: {args.json_path}")
            for ex in meta[split]:
                if check_n and checked[split] >= check_n:
                    break
                image_path = args.image_root / split / ex["image"]["filename"]
                if not image_path.exists():
                    if len(missing) < 50:
                        missing.append(str(image_path))
                checked[split] += 1

        print(f"OK: JSON loaded: {args.json_path}")
        print(f"OK: image_root: {args.image_root}")
        print(f"Checked: train={checked['train']} val={checked['val']} test={checked['test']}")
        if missing:
            print(f"Missing images (showing up to {len(missing)}):")
            for p in missing:
                print(p)
            raise SystemExit(1)
        print("OK: No missing images in checked subset.")
        return

    args.output_dir.mkdir(parents=True, exist_ok=True)

    import torch
    from PIL import Image
    from datasets import Dataset
    from transformers import (
        AutoProcessor,
        BitsAndBytesConfig,
        Qwen2_5_VLForConditionalGeneration,
        TrainingArguments,
        Trainer,
    )

    if not torch.cuda.is_available():
        raise RuntimeError("GPU is required. Enable CUDA on your server/environment.")

    torch.manual_seed(args.seed)
    major = torch.cuda.get_device_capability(0)[0]
    compute_dtype = torch.bfloat16 if major >= 8 else torch.float16

    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Model: {args.model_name}")
    print(f"Finetune mode: {args.finetune_mode}")
    print(f"Precision: {'bf16' if compute_dtype == torch.bfloat16 else 'fp16'}")

    train_data = load_split(args.json_path, args.image_root, "train")
    val_data = load_split(args.json_path, args.image_root, "val")

    print(f"Train size: {len(train_data)}")
    print(f"Val size: {len(val_data)}")

    train_ds = Dataset.from_list(train_data)
    val_ds = Dataset.from_list(val_data)

    def apply_image_transform(examples: Dict[str, Any]) -> Dict[str, Any]:
        image_paths = examples["image_path"]
        images = [[Image.open(p).convert("RGB")] for p in image_paths]
        return {"images": images, "messages": examples["messages"]}

    train_ds = train_ds.with_transform(apply_image_transform)
    val_ds = val_ds.with_transform(apply_image_transform)

    bnb_config = None
    if args.finetune_mode == "lora":
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=compute_dtype,
        )

    processor = AutoProcessor.from_pretrained(
        args.model_name,
        min_pixels=args.min_pixels,
        max_pixels=args.max_pixels,
    )

    gc.collect()
    torch.cuda.empty_cache()

    model_load_kwargs: Dict[str, Any] = dict(
        torch_dtype=compute_dtype,
    )
    if bnb_config is not None:
        model_load_kwargs["quantization_config"] = bnb_config

    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(args.model_name, **model_load_kwargs)
    model.config.use_cache = False
    peft_config = None
    if args.finetune_mode == "lora":
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

        model = prepare_model_for_kbit_training(model)

        target_modules: Any
        if args.target_modules == "all-linear":
            target_modules = "all-linear"
        else:
            target_modules = [x.strip() for x in args.target_modules.split(",") if x.strip()]

        peft_config = LoraConfig(
            r=args.lora_r,
            lora_alpha=args.lora_alpha,
            lora_dropout=args.lora_dropout,
            bias="none",
            target_modules=target_modules,
            task_type="CAUSAL_LM",
        )
        model = get_peft_model(model, peft_config)

    tokenizer = processor.tokenizer
    pad_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id

    def collate_fn(batch: List[Dict[str, Any]]) -> Dict[str, Any]:
        input_ids_list, attention_mask_list, labels_list = [], [], []
        pixel_values_list, image_grid_list = [], []

        for item in batch:
            messages = item["messages"]
            prompt_messages = messages[:-1]
            answer_text = normalize_text(messages[-1]["content"][0]["text"])

            prompt_text = processor.apply_chat_template(
                prompt_messages, tokenize=False, add_generation_prompt=True
            )
            prompt_inputs = processor(
                text=[prompt_text],
                images=item["images"],
                return_tensors="pt",
                padding=True,
            )
            prompt_input_ids = prompt_inputs["input_ids"][0]
            prompt_attention_mask = prompt_inputs["attention_mask"][0]
            answer_ids = tokenizer(
                answer_text,
                return_tensors="pt",
                add_special_tokens=False,
            )["input_ids"][0]

            input_ids = torch.cat([prompt_input_ids, answer_ids], dim=0)
            attention_mask = torch.cat(
                [prompt_attention_mask, torch.ones_like(answer_ids)], dim=0
            )
            labels = torch.cat(
                [torch.full_like(prompt_input_ids, -100), answer_ids], dim=0
            )

            input_ids_list.append(input_ids)
            attention_mask_list.append(attention_mask)
            labels_list.append(labels)
            pixel_values_list.append(prompt_inputs["pixel_values"])
            image_grid_list.append(prompt_inputs["image_grid_thw"][0])

        input_ids = torch.nn.utils.rnn.pad_sequence(
            input_ids_list, batch_first=True, padding_value=pad_id
        )
        attention_mask = torch.nn.utils.rnn.pad_sequence(
            attention_mask_list, batch_first=True, padding_value=0
        )
        labels = torch.nn.utils.rnn.pad_sequence(
            labels_list, batch_first=True, padding_value=-100
        )
        pixel_values = torch.cat(pixel_values_list, dim=0)
        image_grid_thw = torch.stack(image_grid_list, dim=0)
        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "labels": labels,
            "pixel_values": pixel_values,
            "image_grid_thw": image_grid_thw,
        }

    trainer_kwargs: Dict[str, Any] = dict(
        output_dir=str(args.output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.train_batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.learning_rate,
        logging_steps=args.logging_steps,
        save_strategy=args.save_strategy,
        save_total_limit=args.save_total_limit,
        bf16=(compute_dtype == torch.bfloat16),
        fp16=(compute_dtype == torch.float16),
        gradient_checkpointing=args.gradient_checkpointing,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        eval_strategy="no",
        remove_unused_columns=False,
        warmup_ratio=args.warmup_ratio,
        max_grad_norm=args.max_grad_norm,
        report_to="tensorboard",
        seed=args.seed,
    )
    if args.save_strategy == "epoch":
        trainer_kwargs["save_strategy"] = "epoch"
    else:
        trainer_kwargs["save_strategy"] = "steps"
        trainer_kwargs["save_steps"] = args.save_steps
    if args.max_steps and args.max_steps > 0:
        trainer_kwargs["max_steps"] = args.max_steps

    training_args = TrainingArguments(**trainer_kwargs)
    if hasattr(training_args, "label_names"):
        training_args.label_names = ["labels"]

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=None,
        data_collator=collate_fn,
    )

    resume_arg = args.resume_from_checkpoint
    resume_path = None
    if resume_arg is not None:
        if resume_arg == "auto":
            from transformers.trainer_utils import get_last_checkpoint

            resume_path = get_last_checkpoint(str(args.output_dir))
        else:
            resume_path = str(Path(resume_arg).resolve())
    trainer.train(resume_from_checkpoint=resume_path)
    trainer.save_model(str(args.output_dir))
    processor.save_pretrained(str(args.output_dir))
    print(f"Done. Saved to: {args.output_dir}")


if __name__ == "__main__":
    main()
