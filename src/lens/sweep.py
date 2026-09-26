"""`lens sweep` — the reference effort-sweep runner.

One sample per (row, effort) cell. Every completed cell lands in an atomic
file cache keyed by config hash, so re-running is a no-op for finished work.
`--forecast` prices the whole sweep from rendered prompt tokens + observed
gen-token behavior before a single paid call is made.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import tinker
from tinker.types import ModelInput, SamplingParams
from tinker_cookbook import model_info
from tinker_cookbook.renderers import get_renderer, get_text_content
from tinker_cookbook.tokenizer_utils import get_tokenizer

from lens import manifest as mf
from lens.bundle import (
    Decoding,
    GraderRecord,
    Output,
    Row,
    RunBundle,
    RunConfig,
)

MODEL = "thinkingmachines/Inkling-Small"

# $/1M tokens (input, output) — tinker-docs Models & Pricing, 50% discount tier.
# List price is 2×; forecast reports both.
PRICES: dict[str, tuple[float, float]] = {
    "thinkingmachines/Inkling-Small": (0.58, 1.44),
    "thinkingmachines/Inkling": (1.87, 4.65),
}

# Gen-token estimate per effort tier for forecasting, from docs/verification.md
# diagnostics. Conservative: sized so surprises land under, not over.
GEN_TOKEN_EST = {0.0: 150, 0.2: 400, 0.7: 1200, 0.9: 1500, 0.99: 2500}


def _grade(grader: str, text: str, gold: str) -> float:
    if grader == "gsm8k":
        from tinker_cookbook.eval.benchmarks._common import check_gsm8k

        return float(check_gsm8k(text, gold))
    if grader == "math500":
        from tinker_cookbook.recipes.math_rl.math_grading import (
            extract_boxed,
            grade_answer,
        )

        return float(grade_answer(extract_boxed(text), gold))
    raise ValueError(f"unknown grader {grader!r}")


def config_hash(config: dict) -> str:
    blob = json.dumps(config, sort_keys=True).encode()
    return hashlib.sha256(blob).hexdigest()


def _est_tokens(effort: float) -> int:
    return GEN_TOKEN_EST.get(round(effort, 2), 1500)


def build_config(args, efforts: list[float]) -> dict:
    return {
        "model_id": args.model,
        "renderer": "tml_v0",
        "efforts": efforts,
        "decoding": {
            "temperature": args.temperature,
            "max_tokens": args.max_tokens,
            "stop": "renderer.get_stop_sequences()",
        },
        "topk_sample_logprobs": args.topk,
        "grader": "benchmark-native",
    }


async def _run_cell(client, renderer, args, row, effort, cache_dir: Path):
    key = f"{row['row_id']}__{effort}"
    cell_path = cache_dir / f"{key}.json"
    if cell_path.exists():
        return json.loads(cell_path.read_text())

    prompt_toks = renderer.build_generation_prompt(row["messages"], effort=effort).to_ints()
    resp = await client.sample_async(
        ModelInput.from_ints(prompt_toks),
        num_samples=1,
        sampling_params=SamplingParams(
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            stop=renderer.get_stop_sequences(),
        ),
        topk_sample_logprobs=args.topk,
    )
    seq = resp.sequences[0]
    msg, term = renderer.parse_response(seq.tokens)
    text = get_text_content(msg)
    in_p, out_p = PRICES[args.model]
    gen = len(seq.tokens)
    # A grader crash on unparseable output is a wrong answer (native benchmarks
    # use failed_parse_reward=0.0), not an exclusion — keep the output and
    # name the failure in the rationale so the atlas can show it.
    try:
        verdict = _grade(row["grader"], text, row["gold"])
        grade_note = None
    except Exception as ge:
        verdict = 0.0
        grade_note = f"grader_error: {type(ge).__name__}: {ge}"
    cell = {
        "row_id": row["row_id"],
        "effort": effort,
        "final_answer": text,
        "raw_output": text,
        "prompt_tokens": len(prompt_toks),
        "gen_tokens": gen,
        "stop_reason": seq.stop_reason,
        "parse_termination": term.value,
        "verdict": verdict,
        "grade_note": grade_note,
        "est_cost_usd": len(prompt_toks) / 1e6 * in_p + gen / 1e6 * out_p,
        "topk_logprobs": seq.topk_logprobs,
        "error": None,
    }
    tmp = cell_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(cell))
    tmp.replace(cell_path)  # atomic
    return cell


async def run(args) -> int:
    rows, mhash = mf.load(args.manifest)
    efforts = [float(e) for e in args.efforts.split(",")]
    config = build_config(args, efforts)
    chash = config_hash(config)
    in_p, out_p = PRICES[args.model]

    tokenizer = get_tokenizer(args.model)
    renderer = get_renderer(
        model_info.get_recommended_renderer_name(args.model), tokenizer
    )

    # offline: prompt token counts per cell
    prompt_toks = {
        (r["row_id"], e): len(
            renderer.build_generation_prompt(r["messages"], effort=e).to_ints()
        )
        for r in rows
        for e in efforts
    }
    n_cells = len(rows) * len(efforts)

    print(f"manifest {mhash[:16]}…  {len(rows)} rows × {len(efforts)} efforts = {n_cells} cells")
    print(f"config hash {chash[:16]}…")

    if args.forecast:
        tot_in = sum(prompt_toks.values())
        per_eff = {
            e: {
                "cells": len(rows),
                "est_gen": _est_tokens(e) * len(rows),
                "est_cost": (
                    sum(v for (rid, ee), v in prompt_toks.items() if ee == e)
                    / 1e6
                    * in_p
                    + _est_tokens(e) * len(rows) / 1e6 * out_p
                ),
            }
            for e in efforts
        }
        print("\n=== forecast (50%-discount prices) ===")
        tot = 0.0
        for e, d in per_eff.items():
            tot += d["est_cost"]
            print(
                f"effort {e:>4}: {d['cells']} cells, ~{d['est_gen']:,} gen tok, ~${d['est_cost']:.2f}"
            )
        print(f"total input tokens: {tot_in:,}")
        print(f"TOTAL ~${tot:.2f}  (list price ~${tot*2:.2f} if discount lapses)")
        print("dry run — no sampling performed")
        return 0

    from lens._env import ensure_api_key

    ensure_api_key()
    client = tinker.ServiceClient().create_sampling_client(base_model=args.model)
    cache_dir = Path(args.out_dir) / ".cells" / chash[:12]
    cache_dir.mkdir(parents=True, exist_ok=True)

    sem = asyncio.Semaphore(args.concurrency)

    async def guarded(row, effort):
        async with sem:
            try:
                return await _run_cell(client, renderer, args, row, effort, cache_dir)
            except Exception as e:
                return {
                    "row_id": row["row_id"],
                    "effort": effort,
                    "error": f"{type(e).__name__}: {e}",
                    "verdict": None,
                    "prompt_tokens": prompt_toks[(row["row_id"], effort)],
                    "gen_tokens": None,
                    "est_cost_usd": None,
                    "final_answer": None,
                    "raw_output": None,
                    "stop_reason": None,
                    "topk_logprobs": None,
                }

    done = 0
    cells: dict[float, list[dict]] = {e: [] for e in efforts}
    for coro in asyncio.as_completed(
        [guarded(r, e) for r in rows for e in efforts]
    ):
        cell = await coro
        cells[cell["effort"]].append(cell)
        done += 1
        if done % 25 == 0 or done == n_cells:
            cached = sum(1 for e_cells in cells.values() for c in e_cells if c.get("error") is None and c.get("gen_tokens"))
            print(f"  {done}/{n_cells} cells ({cached} sampled ok)")

    # assemble one RunBundle per effort
    created = datetime.now(timezone.utc).isoformat()
    run_id = f"sweep_{chash[:12]}"
    out_paths = []
    for e in efforts:
        e_cells = {c["row_id"]: c for c in cells[e]}
        bundle = RunBundle(
            run_id=run_id,
            created_at=created,
            config=RunConfig(
                model_id=args.model,
                renderer="tml_v0",
                renderer_version="tml-renderers==0.1.0",
                effort=e,
                prompt_template_id="manifest-messages",
                decoding=Decoding(
                    temperature=args.temperature,
                    max_tokens=args.max_tokens,
                ),
                grader_id="benchmark-native",
            ),
            manifest_hash=mhash,
            config_hash=chash,
            provenance={"source": "lens sweep", "manifest": str(args.manifest)},
            rows=[
                Row(
                    row_id=r["row_id"],
                    prompt=json.dumps(r["messages"]),
                    gold=r["gold"],
                    source_ids=r["source_ids"],
                    outputs=[
                        Output(
                            final_answer=c.get("final_answer"),
                            raw_output=c.get("raw_output"),
                            prompt_tokens=c.get("prompt_tokens"),
                            gen_tokens=c.get("gen_tokens"),
                            stop_reason=c.get("stop_reason"),
                            grader=GraderRecord(
                                verdict=c.get("verdict"),
                                rationale=c.get("grade_note")
                                or c.get("parse_termination"),
                            ),
                            est_cost_usd=c.get("est_cost_usd"),
                            error=c.get("error"),
                            topk_logprobs=c.get("topk_logprobs"),
                        )
                    ],
                )
                for r in rows
                if (c := e_cells.get(r["row_id"]))
            ],
        )
        safe_e = str(e).replace(".", "p")
        out = Path(args.out_dir) / f"sweep_{args.model.split('/')[-1].lower()}_e{safe_e}_{chash[:8]}.json"
        bundle.write(out)
        out_paths.append(out)
        n_ok = sum(1 for rr in bundle.rows if rr.outputs[0].error is None)
        n_correct = sum(1 for rr in bundle.rows if rr.outputs[0].grader.verdict == 1.0)
        print(f"effort {e}: {n_ok}/{len(bundle.rows)} sampled, {n_correct} correct → {out}")

    return 0


def main(args) -> int:
    return asyncio.run(run(args))
