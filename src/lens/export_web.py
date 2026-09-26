"""`lens export-web` — slim RunBundles for the static web app.

Two passes over the bundle set:

1. Per manifest group, find "interesting" row_ids — any row that is not
   correct (verdict != 1.0 or error) in at least one run. Every flip and
   every failure lives in this set.
2. Write slimmed bundles: `topk_logprobs` is always dropped in favor of a
   per-token chosen-token trace, and the trace is kept only on interesting
   rows (correct-everywhere rows keep the `mean_logprob` scalar). Also
   writes `index.json` so the app can lazy-load one manifest at a time.
"""

from __future__ import annotations

import json
from collections import OrderedDict
from pathlib import Path

from lens.bundle import RunBundle


def _interesting_ids(bundles: list[RunBundle]) -> set[str]:
    ids: set[str] = set()
    for b in bundles:
        for row in b.rows:
            for o in row.outputs:
                if o.error is not None or o.grader.verdict != 1.0:
                    ids.add(row.row_id)
                    break
    return ids


def _label(b: RunBundle) -> str:
    benchmarks = list(
        dict.fromkeys(r.source_ids.get("benchmark", "") for r in b.rows)
    )
    benchmarks = [x for x in benchmarks if x]
    if benchmarks:
        return "+".join(benchmarks)
    return b.provenance.get("manifest") or b.manifest_hash[:8]


def slim(bundle: RunBundle, keep_trace_ids: set[str]) -> RunBundle:
    for row in bundle.rows:
        keep = row.row_id in keep_trace_ids
        for o in row.outputs:
            lps: list[float] = []
            if o.topk_logprobs:
                # at temperature 0 the chosen token is the top-1 entry
                lps = [round(pos[0][1], 3) for pos in o.topk_logprobs if pos]
            elif o.token_logprobs:
                lps = o.token_logprobs
            o.mean_logprob = sum(lps) / len(lps) if lps else o.mean_logprob
            o.token_logprobs = lps if (lps and keep) else None
            o.topk_logprobs = None
    return bundle


def main(args) -> int:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("*.json"):
        stale.unlink()

    bundles = [RunBundle.read(p) for p in args.bundles]
    groups: OrderedDict[str, list[tuple[RunBundle, Path]]] = OrderedDict()
    for b, p in zip(bundles, args.bundles):
        groups.setdefault(b.manifest_hash, []).append((b, Path(p)))

    index: list[dict] = []
    total = 0.0
    for mhash, items in groups.items():
        keep = _interesting_ids([b for b, _ in items])
        files = []
        for b, p in items:
            # bundles from different manifests can share a config hash (and
            # hence a filename) — prefix with the manifest hash to disambiguate
            name = f"{mhash[:8]}_{p.name}"
            out = out_dir / name
            slim(b, keep).write(out)
            size = out.stat().st_size / 1e6
            total += size
            files.append(name)
            print(f"{out} — {size:.1f} MB")
        index.append(
            {
                "manifest_hash": mhash,
                "label": _label(items[0][0]),
                "n_rows": len(items[0][0].rows),
                "files": files,
            }
        )

    (out_dir / "index.json").write_text(
        json.dumps({"schema_version": "webindex/v1", "manifests": index}, indent=2)
    )
    print(f"total {total:.1f} MB + index.json")
    return 0
