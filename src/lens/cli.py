"""`lens` CLI — data pipeline for paired-run inspection of Tinker evals.

  lens verify           instrument check: does effort conditioning work? (~$0.01)
  lens prefix-gap       score a continuation under counterfactual effort prefixes
  lens freeze           build a frozen, hashed manifest from a benchmark
  lens sweep            run an effort sweep over a frozen manifest → RunBundles
  lens import-evalstore convert a native Tinker EvalStore run → RunBundle
  lens compare          paired stats + flip report across RunBundles

The web app (web/) reads RunBundles; only the CLI ever touches the API.
"""

import argparse
import sys


def main() -> int:
    p = argparse.ArgumentParser(prog="lens", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("verify", help="instrument check before any bulk sampling")
    v.add_argument("--offline", action="store_true", help="prefix check only, no API calls")
    v.add_argument("--out", default="runs/effort_diagnostics.json")

    pg = sub.add_parser("prefix-gap", help="exploratory: prefix effect on token likelihood")
    pg.add_argument("--question", default="Compute 47*6 step by step, then state the answer.")
    pg.add_argument("--gen-effort", type=float, default=0.9)
    pg.add_argument("--score-efforts", default="0.0,0.9")
    pg.add_argument("--topk", type=int, default=10)

    fr = sub.add_parser("freeze", help="build a frozen, hashed manifest from a benchmark")
    fr.add_argument("--benchmark", action="append", required=True,
                    choices=["gsm8k", "math500"], help="repeatable")
    fr.add_argument("--n", type=int, default=75, help="rows per benchmark")
    fr.add_argument("--seed", type=int, default=42)
    fr.add_argument("--out", required=True)

    sw = sub.add_parser("sweep", help="effort sweep over a frozen manifest")
    sw.add_argument("manifest")
    sw.add_argument("--efforts", default="0.0,0.2,0.7,0.9,0.99")
    sw.add_argument("--model", default="thinkingmachines/Inkling-Small")
    sw.add_argument("--temperature", type=float, default=0.0)
    sw.add_argument("--max-tokens", type=int, default=8192)
    sw.add_argument("--topk", type=int, default=10)
    sw.add_argument("--concurrency", type=int, default=8)
    sw.add_argument("--out-dir", default="runs")
    sw.add_argument("--forecast", action="store_true",
                    help="price the sweep and exit — no sampling")

    im = sub.add_parser("import-evalstore", help="convert an EvalStore run to a RunBundle")
    im.add_argument("path")
    im.add_argument("--out", default="runs/imported.json")

    cp = sub.add_parser("compare", help="paired stats + flip report across runs")
    cp.add_argument("bundles", nargs="+")
    cp.add_argument("--out", default=None)

    args = p.parse_args()
    if args.cmd == "verify":
        from lens import verify
        return verify.main(args)
    if args.cmd == "prefix-gap":
        from lens import prefix_gap
        return prefix_gap.main(args)
    if args.cmd == "freeze":
        from lens import manifest
        return manifest.main(args)
    if args.cmd == "sweep":
        from lens import sweep
        return sweep.main(args)
    if args.cmd == "import-evalstore":
        from lens import import_evalstore
        return import_evalstore.main(args)
    if args.cmd == "compare":
        from lens import compare
        return compare.main(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
