"""`lens freeze` — build a frozen, hashed manifest from a benchmark dataset.

The manifest is the fixed question set every run in a comparison must answer.
Same manifest_hash = same rows, byte for byte. Rows carry their benchmark's
grading recipe so `sweep` can grade without env machinery.
"""

from __future__ import annotations

import hashlib
import json
import random
from datetime import datetime, timezone
from pathlib import Path

from tinker_cookbook.eval.benchmarks._common import (
    limit_dataset,
    load_benchmark_dataset,
    make_example_id,
)

MANIFEST_VERSION = "manifest/v1"


def _rows_gsm8k(n: int, seed: int) -> list[dict]:
    ds = load_benchmark_dataset("openai/gsm8k", name="main")
    ds = limit_dataset(ds, n, shuffle_seed=seed)
    rows = []
    for i, row in enumerate(ds):
        row = dict(row)
        rows.append(
            {
                "row_id": make_example_id("gsm8k", row["question"]),
                "messages": [
                    {
                        "role": "system",
                        "content": "Put your final answer in \\boxed{}.",
                    },
                    {"role": "user", "content": row["question"]},
                ],
                "gold": row["answer"].split("####")[-1].strip(),
                "grader": "gsm8k",
                "source_ids": {
                    "benchmark": "gsm8k",
                    "hf_path": "openai/gsm8k:main:test",
                    "idx": str(i),
                },
            }
        )
    return rows


def _rows_math500(n: int, seed: int) -> list[dict]:
    from tinker_cookbook.recipes.math_rl.math_grading import extract_boxed

    ds = load_benchmark_dataset("HuggingFaceH4/MATH-500")
    ds = limit_dataset(ds, n, shuffle_seed=seed)
    rows = []
    for i, row in enumerate(ds):
        row = dict(row)
        rows.append(
            {
                "row_id": make_example_id("math500", row["problem"]),
                "messages": [
                    {
                        "role": "user",
                        "content": row["problem"]
                        + " Put your final answer in \\boxed{}.",
                    }
                ],
                "gold": str(extract_boxed(row["solution"])),
                "grader": "math500",
                "source_ids": {
                    "benchmark": "math500",
                    "hf_path": "HuggingFaceH4/MATH-500:test",
                    "idx": str(i),
                },
            }
        )
    return rows


BUILDERS = {"gsm8k": _rows_gsm8k, "math500": _rows_math500}


def manifest_hash(rows: list[dict]) -> str:
    blob = json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(blob).hexdigest()


def main(args) -> int:
    rows: list[dict] = []
    for bench in args.benchmark:
        if bench not in BUILDERS:
            raise SystemExit(f"unknown benchmark {bench!r}; have {sorted(BUILDERS)}")
        rows.extend(BUILDERS[bench](args.n, args.seed))

    # dedupe + validate
    seen: set[str] = set()
    uniq = []
    for r in rows:
        if r["row_id"] in seen:
            continue
        seen.add(r["row_id"])
        assert r["messages"] and r["gold"], f"empty fields in {r['row_id']}"
        uniq.append(r)
    random.Random(args.seed).shuffle(uniq)

    doc = {
        "manifest_version": MANIFEST_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "benchmarks": args.benchmark,
        "n_requested": args.n * len(args.benchmark),
        "n_rows": len(uniq),
        "seed": args.seed,
        "manifest_hash": manifest_hash(uniq),
        "rows": uniq,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    print(f"wrote {out}: {len(uniq)} rows, hash {doc['manifest_hash'][:16]}…")
    return 0


def load(path: str | Path) -> tuple[list[dict], str]:
    """Read a manifest file; returns (rows, manifest_hash). Recomputes hash."""
    doc = json.loads(Path(path).read_text())
    rows = doc["rows"]
    h = manifest_hash(rows)
    if doc.get("manifest_hash") and doc["manifest_hash"] != h:
        raise SystemExit(f"{path}: manifest_hash mismatch — file was modified")
    return rows, h
