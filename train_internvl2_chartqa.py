#!/usr/bin/env python3
"""
Train InternVL2-4B on a local ChartQA-style dataset from one JSON metadata file + one image root.

This script converts your local JSON + image folders to the JSONL/meta format expected by InternVL,
then launches the official InternVL training entrypoint.

Expected layout:
  dataset_root/
    chartqa_full_metadata.json
    images/
      train/<filename>
      val/<filename>
      test/<filename>

Recommended install (or let this script do it):
  git clone https://github.com/OpenGVLab/InternVL.git
  pip install -r /path/to/InternVL/requirements/internvl_chat.txt

Example:
  python train_internvl2_chartqa.py \
    --json_path /data/chartqa_full_metadata.json \
    --image_root /data/images \
    --repo_dir /opt/InternVL \
    --output_dir /data/out_internvl2_4b
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict


def run(cmd: str) -> None:
    print(">>>", cmd)
    subprocess.check_call(cmd, shell=True)

def run_proc(args: list[str], cwd: Path, extra_env: Dict[str, str]) -> None:
    print(">>>", " ".join(args))
    env = os.environ.copy()
    env.update(extra_env or {})
    subprocess.check_call(args, cwd=str(cwd), env=env)


def normalize_text(x: Any) -> str:
    return " ".join(str(x).strip().split())


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--json_path", type=Path, required=True)
    p.add_argument("--image_root", type=Path, required=True)
    p.add_argument("--repo_dir", type=Path, required=True,
                   help="Path to a cloned OpenGVLab/InternVL repo.")
    p.add_argument("--model_name", type=str, default="OpenGVLab/InternVL2-4B")
    p.add_argument("--output_dir", type=Path, required=True)
    p.add_argument("--epochs", type=int, default=5)
    p.add_argument("--learning_rate", type=float, default=4e-5)
    p.add_argument("--train_batch_size", type=int, default=2)
    p.add_argument("--grad_accum", type=int, default=4)
    p.add_argument("--logging_steps", type=int, default=50)
    p.add_argument("--save_strategy", choices=["epoch", "steps"], default="epoch")
    p.add_argument("--save_steps", type=int, default=500)
    p.add_argument("--save_total_limit", type=int, default=10)
    p.add_argument("--resume_from_checkpoint", type=str, default=None)
    p.add_argument("--overwrite_output_dir", action="store_true", default=True)
    p.add_argument("--no_overwrite_output_dir", action="store_false", dest="overwrite_output_dir")
    p.add_argument("--force_image_size", type=int, default=448)
    p.add_argument("--max_dynamic_patch", type=int, default=6)
    p.add_argument("--use_llm_lora", type=int, default=8)
    p.add_argument("--bf16", action="store_true", help="Use bf16. If not set, script falls back to fp16.")
    p.add_argument("--deepspeed_config", type=str, default="zero_stage1_config.json")
    p.add_argument("--master_port", type=int, default=29501)
    p.add_argument("--dataloader_num_workers", type=int, default=4)
    p.add_argument("--max_steps", type=int, default=None)
    p.add_argument("--precheck", action="store_true")
    p.add_argument("--dry_run", action="store_true")
    p.add_argument("--skip_cuda_check", action="store_true")
    p.add_argument("--launcher", type=str, choices=["torchrun", "none"], default="torchrun")
    p.add_argument("--disable_deepspeed", action="store_true")
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


def export_jsonl(meta: Dict[str, Any], image_root: Path, split: str, out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8") as fout:
        for ex in meta[split]:
            image_path = image_root / split / ex["image"]["filename"]
            if not image_path.exists():
                raise FileNotFoundError(f"Missing image: {image_path}")
            answer = ex["label"][0] if isinstance(ex["label"], list) else ex["label"]
            item = {
                "id": f"{split}_{ex.get('index', 0)}",
                "image": f"{split}/{ex['image']['filename']}",
                "conversations": [
                    {"from": "human", "value": f"<image>\n{normalize_text(ex['query'])}"},
                    {"from": "gpt", "value": normalize_text(answer)},
                ],
            }
            fout.write(json.dumps(item, ensure_ascii=False) + "\n")

def relpath(from_dir: Path, to_path: Path) -> str:
    return os.path.relpath(str(to_path), start=str(from_dir))


def main() -> None:
    args = parse_args()
    base_dir = Path(__file__).resolve().parent
    args.model_name = prefer_local_model(args.model_name, base_dir)
    if os.name == "nt":
        args.launcher = "none"
        args.disable_deepspeed = True
    if not args.precheck and not args.repo_dir.exists():
        raise FileNotFoundError(f"InternVL repo not found: {args.repo_dir}")

    if not args.precheck and not args.dry_run and not args.skip_cuda_check and not torch_cuda_available():
        raise RuntimeError("GPU is required. Enable CUDA on your server/environment.")

    with args.json_path.open("r", encoding="utf-8") as f:
        meta = json.load(f)

    if args.precheck:
        for split in ["train", "val"]:
            if split not in meta:
                raise KeyError(f"Missing split: {split}")
            cnt = 0
            for ex in meta[split]:
                image_path = args.image_root / split / ex["image"]["filename"]
                if not image_path.exists():
                    raise FileNotFoundError(f"Missing image: {image_path}")
                cnt += 1
                if cnt >= 1000:
                    break
        print("OK: metadata structure and sample images verified")
        return

    internvl_chat = args.repo_dir / "internvl_chat"
    if not internvl_chat.exists():
        raise FileNotFoundError(f"internvl_chat directory not found in repo: {internvl_chat}")

    # Resolve deepspeed config absolute path
    ds_cfg_candidates = [
        args.repo_dir / args.deepspeed_config,
        internvl_chat / args.deepspeed_config,
        args.repo_dir / "zero_stage1_config.json",
        args.repo_dir / "zero_stage2_config.json",
    ]
    ds_cfg_path = None
    for pth in ds_cfg_candidates:
        if Path(pth).exists():
            ds_cfg_path = Path(pth).resolve()
            break
    if args.disable_deepspeed or ds_cfg_path is None:
        ds_cfg_arg = ""
    else:
        ds_cfg_arg = f'--deepspeed "{ds_cfg_path}"'

    playground_root = internvl_chat / "playground"
    ann_root = playground_root / "opensource"
    meta_root = internvl_chat / "shell" / "data"
    train_jsonl = ann_root / "chartqa_train_local.jsonl"
    meta_path = meta_root / "chartqa_local_meta.json"

    if not args.dry_run:
        ann_root.mkdir(parents=True, exist_ok=True)
        meta_root.mkdir(parents=True, exist_ok=True)
        export_jsonl(meta, args.image_root, "train", train_jsonl)
        root_rel = relpath(internvl_chat.resolve(), args.image_root.resolve())
        ann_rel = relpath(internvl_chat.resolve(), train_jsonl.resolve())
        meta_json = {
            "chartqa_train_custom": {
                "root": root_rel,
                "annotation": ann_rel,
                "data_augment": False,
                "repeat_time": 1,
                "length": len(meta["train"]),
            },
        }
        with meta_path.open("w", encoding="utf-8") as f:
            json.dump(meta_json, f, ensure_ascii=False, indent=2)

    precision_flag = "--bf16 True" if args.bf16 else "--fp16 True"

    save_eval_bits = ""
    if args.save_strategy == "epoch":
        save_eval_bits = f"--evaluation_strategy no --save_strategy epoch"
    else:
        save_eval_bits = f"--evaluation_strategy no --save_strategy steps --save_steps {args.save_steps}"

    base_train_args = [
        "internvl/train/internvl_chat_finetune.py",
        "--model_name_or_path", str(args.model_name),
        "--conv_style", "phi3-chat",
        "--output_dir", str(args.output_dir),
        "--meta_path", relpath(internvl_chat.resolve(), meta_path.resolve()),
        "--overwrite_output_dir", "True" if (args.overwrite_output_dir and not args.resume_from_checkpoint) else "False",
        "--force_image_size", str(args.force_image_size),
        "--max_dynamic_patch", str(args.max_dynamic_patch),
        "--down_sample_ratio", "0.5",
        "--drop_path_rate", "0.0",
        "--freeze_llm", "True",
        "--freeze_mlp", "True",
        "--freeze_backbone", "True",
        "--use_llm_lora", str(args.use_llm_lora),
        "--vision_select_layer", "-1",
        "--dataloader_num_workers", str(args.dataloader_num_workers),
    ]
    base_train_args += precision_flag.split()
    base_train_args += [
        "--num_train_epochs", str(args.epochs),
        "--per_device_train_batch_size", str(args.train_batch_size),
        "--gradient_accumulation_steps", str(args.grad_accum),
    ]
    base_train_args += save_eval_bits.split()
    base_train_args += [
        "--save_total_limit", str(args.save_total_limit),
        "--learning_rate", str(args.learning_rate),
        "--weight_decay", "0.01",
        "--warmup_ratio", "0.03",
        "--lr_scheduler_type", "cosine",
        "--logging_steps", str(args.logging_steps),
        "--max_seq_length", "4096",
        "--do_train", "True",
        "--do_eval", "False",
        "--grad_checkpoint", "True",
        "--group_by_length", "True",
        "--dynamic_image_size", "True",
        "--use_thumbnail", "True",
        "--ps_version", "v2",
        "--report_to", "tensorboard",
    ]
    if ds_cfg_path is not None and not args.disable_deepspeed:
        base_train_args += ["--deepspeed", str(ds_cfg_path)]
    if args.max_steps is not None:
        base_train_args += ["--max_steps", str(args.max_steps)]
    if args.resume_from_checkpoint:
        base_train_args += ["--resume_from_checkpoint", str(args.resume_from_checkpoint)]

    if args.launcher == "none":
        cmd_list = [sys.executable] + base_train_args
    else:
        runner = shutil.which("torchrun")
        if runner is None:
            cmd_list = [sys.executable, "-m", "torch.distributed.run"]
        else:
            cmd_list = ["torchrun"]
        cmd_list += [
        "--nnodes=1",
        "--node_rank=0",
        "--master_addr=127.0.0.1",
        "--nproc_per_node=1",
        "--master_port", str(args.master_port),
        ]
        cmd_list += base_train_args
    if args.dry_run:
        print(" ".join(cmd_list))
        print("DRY RUN")
        return
    extra_env = {
        "PYTHONPATH": os.environ.get("PYTHONPATH", "") + os.pathsep + str(internvl_chat.resolve()),
        "TF_CPP_MIN_LOG_LEVEL": "3",
        "TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD": "1",
        "MASTER_PORT": str(args.master_port),
        "LAUNCHER": "pytorch",
        "MASTER_ADDR": "127.0.0.1",
        "WORLD_SIZE": "1",
        "RANK": "0",
        "LOCAL_RANK": "0",
    }
    run_proc(cmd_list, internvl_chat, extra_env)
    print(f"Done. Saved to: {args.output_dir}")


def torch_cuda_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


if __name__ == "__main__":
    main()
