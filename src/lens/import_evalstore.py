"""`lens import-evalstore` — convert a native Tinker EvalStore run to a RunBundle.

Reads an EvalStore run directory:

    {run_dir}/
      metadata.json
      {benchmark}/
        trajectories.jsonl      # StoredTrajectoryDict per line
        result.json

Provenance is preserved in `provenance` — fields EvalStore doesn't record
(effort, renderer internals) stay null rather than being faked.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from lens.bundle import (
    GraderRecord,
    Output,
    Row,
    RunBundle,
    RunConfig,
)


def _config_hash(config: dict) -> str:
    return hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()


def convert(run_dir: Path, out_path: Path) -> RunBundle:
    meta = json.loads((run_dir / "metadata.json").read_text())
    rows: list[Row] = []
    benchmarks = [
        d.name for d in run_dir.iterdir() if d.is_dir() and (d / "trajectories.jsonl").exists()
    ]
    for bench in sorted(benchmarks):
        for line in (run_dir / bench / "trajectories.jsonl").read_text().splitlines():
            if not line.strip():
                continue
            t = json.loads(line)
            turns = t.get("turns", [])
            user_turns = [x for x in turns if x["role"] == "user"]
            asst_turns = [x for x in turns if x["role"] == "assistant"]
            logs = t.get("logs", {})
            rows.append(
                Row(
                    row_id=f"{bench}:{t['example_id']}",
                    prompt=user_turns[0]["content"] if user_turns else "",
                    gold=logs.get("expected"),
                    source_ids={
                        "benchmark": bench,
                        "example_id": t["example_id"],
                        "evalstore_idx": str(t["idx"]),
                    },
                    outputs=[
                        Output(
                            final_answer=logs.get("extracted")
                            or (asst_turns[-1]["content"] if asst_turns else None),
                            raw_output=asst_turns[-1]["content"] if asst_turns else None,
                            prompt_tokens=sum(
                                x["token_count"] for x in turns if x["role"] != "assistant"
                            )
                            or None,
                            gen_tokens=sum(x["token_count"] for x in asst_turns) or None,
                            stop_reason="truncated"
                            if t.get("metrics", {}).get("max_tokens_reached")
                            else None,
                            grader=GraderRecord(
                                verdict=t.get("reward"),
                                rationale=json.dumps(logs) if logs else None,
                            ),
                            est_cost_usd=None,
                            error=t.get("error"),
                        )
                    ],
                )
            )

    cfg = meta.get("config", {})
    config = RunConfig(
        model_id=meta.get("model_name") or cfg.get("model_name", "unknown"),
        renderer=cfg.get("renderer", "unknown"),
        renderer_version=cfg.get("renderer_version", "unknown"),
        effort=cfg.get("effort"),  # null when the native runner didn't set it
        grader_id="evalstore",
    )
    bundle = RunBundle(
        run_id=meta["run_id"],
        created_at=meta.get("timestamp", datetime.now(timezone.utc).isoformat()),
        config=config,
        manifest_hash="native-evalstore",  # frozen set implied by trajectories
        config_hash=_config_hash(cfg),
        provenance={
            "source": "evalstore-import",
            "evalstore_run_id": meta["run_id"],
            "benchmarks": ",".join(benchmarks),
            "note": "native run; effort/renderer fields null unless recorded",
        },
        rows=rows,
    )
    bundle.write(out_path)
    return bundle


def main(args) -> int:
    bundle = convert(Path(args.path), Path(args.out))
    n_ok = sum(1 for r in bundle.rows if r.outputs[0].error is None)
    print(
        f"imported {len(bundle.rows)} rows ({n_ok} ok, {len(bundle.rows)-n_ok} errors) "
        f"from {args.path} → {args.out}"
    )
    return 0
