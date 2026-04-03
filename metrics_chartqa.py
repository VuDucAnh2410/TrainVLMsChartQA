#!/usr/bin/env python3
import argparse
import json
import math
import re
from pathlib import Path

def norm_text(s):
    if s is None:
        return ""
    s = str(s)
    s = s.strip()
    s = s.lower()
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s)
    return s

def extract_number(s):
    if s is None:
        return None
    t = str(s).strip()
    t = t.replace(",", "")
    m = re.findall(r"[-+]?\d*\.?\d+(?:e[-+]?\d+)?", t)
    if not m:
        return None
    try:
        return float(m[0])
    except Exception:
        return None

def exact_match(pred, gt):
    return norm_text(pred) == norm_text(gt)

def yesno_match(pred, gt):
    p = norm_text(pred)
    g = norm_text(gt)
    if g in {"yes", "no"}:
        return p in {"yes", "no"} and p == g
    return None

def relaxed_numeric_match(pred, gt, rel_tol=0.01, abs_tol=1e-3):
    pn = extract_number(pred)
    gn = extract_number(gt)
    if pn is None or gn is None:
        return None
    if math.isclose(pn, gn, rel_tol=rel_tol, abs_tol=abs_tol):
        return True
    return False

def classify_question_type(q):
    qn = norm_text(q)
    if any(k in qn for k in ["ocr", "text", "label", "read"]):
        return "TextReading_OCR"
    if any(k in qn for k in ["axis", "x-axis", "y-axis", "tick", "scale"]):
        return "AxisInterpretation"
    if any(k in qn for k in ["legend", "color", "colour", "hue"]):
        return "LegendColorAssociation"
    if any(k in qn for k in ["sum", "total", "difference", "average", "mean", "median", "multiply", "product"]):
        return "ArithmeticReasoning"
    if any(k in qn for k in ["both", "either", "all", "more than", "less than", "at least", "at most"]):
        return "MultiHopReasoning"
    if norm_text(q) in {"yes or no", "yes/no"} or any(k in qn for k in ["yes or no"]):
        return "YesNo"
    if extract_number(qn) is not None:
        return "NumericalComparison"
    return "Other"

def classify_error_type(q, pred, gt):
    if exact_match(pred, gt):
        return "Correct"
    qn = norm_text(q)
    yn = yesno_match(pred, gt)
    rn = relaxed_numeric_match(pred, gt)
    if yn is False:
        return "YesNo"
    if rn is False:
        if any(k in qn for k in ["sum", "total", "difference", "average", "mean", "median", "multiply", "product"]):
            return "ArithmeticReasoning"
        return "NumericalComparison"
    if any(k in qn for k in ["ocr", "text", "label", "read"]):
        return "TextReading_OCR"
    if any(k in qn for k in ["axis", "x-axis", "y-axis", "tick", "scale"]):
        return "AxisInterpretation"
    if any(k in qn for k in ["legend", "color", "colour", "hue"]):
        return "LegendColorAssociation"
    if any(k in qn for k in ["both", "either", "all", "more than", "less than", "at least", "at most"]):
        return "MultiHopReasoning"
    return "HallucinationOrUnsupported"

def compute_metrics(path):
    total = 0
    em = 0
    yesno_total = 0
    yesno_correct = 0
    num_total = 0
    num_relaxed = 0
    qtype_counts = {}
    err_counts = {}
    samples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            total += 1
            q = rec.get("question", "")
            p = rec.get("prediction", rec.get("pred", ""))
            g = rec.get("ground_truth", rec.get("gt", ""))

            em_flag = rec.get("exact_match")
            if isinstance(em_flag, bool):
                if em_flag:
                    em += 1
            else:
                if exact_match(p, g):
                    em += 1

            yn_flag = rec.get("yesno_match")
            if isinstance(yn_flag, bool):
                yesno_total += 1
                if yn_flag:
                    yesno_correct += 1
            else:
                yn = yesno_match(p, g)
                if yn is not None:
                    yesno_total += 1
                    if yn:
                        yesno_correct += 1

            rn_flag = rec.get("relaxed_numeric_match")
            if isinstance(rn_flag, bool):
                num_total += 1
                if rn_flag:
                    num_relaxed += 1
            else:
                rn = relaxed_numeric_match(p, g)
                if rn is not None:
                    num_total += 1
                    if rn:
                        num_relaxed += 1
            qt = classify_question_type(q)
            qtype_counts[qt] = qtype_counts.get(qt, 0) + 1
            et = classify_error_type(q, p, g)
            err_counts[et] = err_counts.get(et, 0) + 1
            samples.append((q, p, g, et, qt))
    return {
        "total": total,
        "em": em,
        "yesno_total": yesno_total,
        "yesno_correct": yesno_correct,
        "num_total": num_total,
        "num_relaxed": num_relaxed,
        "qtype_counts": qtype_counts,
        "err_counts": err_counts,
        "samples": samples,
    }

def pct(n, d):
    if d <= 0:
        return 0.0
    return 100.0 * n / d

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pred_jsonl", type=str, required=True)
    ap.add_argument("--report_txt", type=str, default="")
    args = ap.parse_args()
    path = Path(args.pred_jsonl)
    res = compute_metrics(str(path))
    lines = []
    lines.append(f"Samples: {res['total']}")
    lines.append(f"EM: {res['em']} ({pct(res['em'], res['total']):.2f}%)")
    lines.append(f"Yes/No: {res['yesno_correct']}/{res['yesno_total']} ({pct(res['yesno_correct'], res['yesno_total']):.2f}%)")
    lines.append(f"Relaxed numeric: {res['num_relaxed']}/{res['num_total']} ({pct(res['num_relaxed'], res['num_total']):.2f}%)")
    lines.append("Question type breakdown:")
    for k, v in sorted(res["qtype_counts"].items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- {k}: {v} ({pct(v, res['total']):.2f}%)")
    lines.append("Error type breakdown:")
    for k, v in sorted(res["err_counts"].items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- {k}: {v} ({pct(v, res['total']):.2f}%)")
    out = "\n".join(lines)
    print(out)
    if args.report_txt:
        rp = Path(args.report_txt)
        rp.parent.mkdir(parents=True, exist_ok=True)
        with open(rp, "w", encoding="utf-8") as f:
            f.write(out + "\n")

if __name__ == "__main__":
    main()

