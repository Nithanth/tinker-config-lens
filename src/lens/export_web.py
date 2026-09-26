"""`lens export-web` — slim RunBundles for the static web app.

Drops per-token topk_logprobs (hundreds of MB) and folds them into a per-row
`mean_logprob` confidence scalar — at temp 0 the sampled token is top-1, so
that's "how confident was the model in its own answer," per row. Everything
else (text, tokens, verdicts, hashes, provenance) carries through unchanged.
"""

from __future__ import annotations

from pathlib import Path

from lens.bundle import RunBundle


def slim(bundle: RunBundle) -> RunBundle:
    for row in bundle.rows:
        for o in row.outputs:
            if o.topk_logprobs:
                # at temperature 0 the chosen token is the top-1 entry
                lps = [pos[0][1] for pos in o.topk_logprobs if pos]
                o.mean_logprob = sum(lps) / len(lps) if lps else None
            o.topk_logprobs = None
    return bundle


def main(args) -> int:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for p in args.bundles:
        b = slim(RunBundle.read(p))
        out = out_dir / Path(p).name
        b.write(out)
        size = out.stat().st_size / 1e6
        total += size
        print(f"{out} — {size:.1f} MB")
    print(f"total {total:.1f} MB")
    return 0
