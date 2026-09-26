"""`lens compare` — paired statistics across RunBundles.

Everything is paired on row_id: complete-pair filtering, explicit exclusions,
McNemar-style flip counts, and a paired bootstrap CI on accuracy and token
deltas. No independent-aggregate comparisons — that's the whole point.
"""

from __future__ import annotations

import json
import random
from itertools import combinations
from pathlib import Path

from lens.bundle import RunBundle

N_BOOT = 10_000


def _verdict(row) -> float | None:
    o = row.outputs[0]
    if o.error is not None or o.grader.verdict is None:
        return None
    return o.grader.verdict


def _gen_tokens(row) -> int | None:
    return row.outputs[0].gen_tokens


def failure_kind(o) -> str | None:
    """Classify a non-correct output: why did it fail? Returns None if correct."""
    if o.error is not None:
        return "error"
    if o.grader.verdict == 1.0:
        return None
    if o.stop_reason in ("length", "max_tokens"):
        return "truncation"
    rat = o.grader.rationale or ""
    if "malformed" in rat or "grader_error" in rat or "No boxed" in rat:
        return "parse"
    return "wrong_answer"


def _align(bundles: list[RunBundle]):
    """Complete pairs only; every exclusion is named."""
    key = lambda b: f"{b.config.model_id}@e{b.config.effort}"
    per_run = {key(b): {r.row_id: r for r in b.rows} for b in bundles}
    common = set.intersection(*[set(d) for d in per_run.values()])
    exclusions = []
    scored: dict[str, dict[str, float]] = {}
    toks: dict[str, dict[str, int]] = {}
    for k, rows in per_run.items():
        scored[k], toks[k] = {}, {}
        for rid in sorted(common):
            v = _verdict(rows[rid])
            if v is None:
                exclusions.append({"row_id": rid, "run": k, "reason": rows[rid].outputs[0].error or "no verdict"})
            else:
                scored[k][rid] = v
            t = _gen_tokens(rows[rid])
            if t is not None:
                toks[k][rid] = t
    # complete-pair set = scored in ALL runs
    complete = set.intersection(*[set(d) for d in scored.values()]) if scored else set()
    for k, d in scored.items():
        dropped = set(d) - complete
        for rid in dropped:
            exclusions.append({"row_id": rid, "run": k, "reason": "incomplete pair"})
        for rid in dropped:
            d.pop(rid)
    return per_run, scored, toks, sorted(complete), exclusions


def _paired_ci(diffs: list[float], n_boot: int = N_BOOT) -> tuple[float, float, float]:
    if not diffs:
        return (0.0, 0.0, 0.0)
    rng = random.Random(0)
    n = len(diffs)
    boots = sorted(
        sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(n_boot)
    )
    return (sum(diffs) / n, boots[int(0.025 * n_boot)], boots[int(0.975 * n_boot)])


def compare(bundles: list[RunBundle]) -> dict:
    per_run, scored, toks, complete, exclusions = _align(bundles)
    keys = list(per_run)

    report = {
        "n_rows_complete_pairs": len(complete),
        "n_exclusions": len(exclusions),
        "exclusions": exclusions[:50],
        "runs": {},
        "pairs": {},
    }
    for k in keys:
        vals = [scored[k][r] for r in complete if r in scored[k]]
        tk = [toks[k][r] for r in complete if r in toks.get(k, {})]
        report["runs"][k] = {
            "accuracy": sum(vals) / len(vals) if vals else None,
            "n_scored": len(vals),
            "mean_gen_tokens": sum(tk) / len(tk) if tk else None,
            "est_cost_usd": None,  # filled below if available
        }
        b = next(b for b in bundles if f"{b.config.model_id}@e{b.config.effort}" == k)
        costs = [
            r.outputs[0].est_cost_usd
            for r in b.rows
            if r.outputs[0].est_cost_usd is not None
        ]
        report["runs"][k]["est_cost_usd"] = sum(costs) if costs else None
        kinds = [
            failure_kind(r.outputs[0])
            for r in b.rows
            if r.row_id in complete and failure_kind(r.outputs[0])
        ]
        report["runs"][k]["failure_taxonomy"] = {
            t: kinds.count(t) for t in ("truncation", "parse", "wrong_answer", "error") if kinds.count(t)
        }

    for a, b in combinations(keys, 2):
        both_right = both_wrong = only_a = only_b = 0
        acc_diffs, tok_diffs = [], []
        flips = []
        for rid in complete:
            va, vb = scored[a].get(rid), scored[b].get(rid)
            if va is None or vb is None:
                continue
            acc_diffs.append(vb - va)  # Δ = B − A: what changes going A → B
            ta, tb = toks.get(a, {}).get(rid), toks.get(b, {}).get(rid)
            if ta is not None and tb is not None:
                tok_diffs.append(tb - ta)
            if va == vb == 1.0:
                both_right += 1
            elif va == vb == 0.0:
                both_wrong += 1
            elif va == 1.0:
                only_a += 1
                flips.append({"row_id": rid, "dir": f"{a} correct, {b} wrong"})
            else:
                only_b += 1
                flips.append({"row_id": rid, "dir": f"{b} correct, {a} wrong"})
        # failure taxonomy per direction — what kind of failure flipped?
        flip_taxonomy = {}
        for f in flips:
            loser_key = a if f["dir"].startswith(f"{b} correct") else b
            loser_row = per_run[loser_key][f["row_id"]]
            kind = failure_kind(loser_row.outputs[0]) or "wrong_answer"
            flip_taxonomy[kind] = flip_taxonomy.get(kind, 0) + 1
        acc_mean, acc_lo, acc_hi = _paired_ci(acc_diffs)
        tok_mean, tok_lo, tok_hi = _paired_ci(tok_diffs)
        report["pairs"][f"{a} vs {b}"] = {
            "n": both_right + both_wrong + only_a + only_b,
            "both_correct": both_right,
            "both_wrong": both_wrong,
            "only_a_correct": only_a,
            "only_b_correct": only_b,
            "acc_diff_mean": acc_mean,
            "acc_diff_ci95": [acc_lo, acc_hi],
            "gen_tok_diff_mean": tok_mean,
            "gen_tok_diff_ci95": [tok_lo, tok_hi],
            "flip_taxonomy": flip_taxonomy,
            "flips": flips,
        }
    return report


def main(args) -> int:
    bundles = [RunBundle.read(p) for p in args.bundles]
    report = compare(bundles)

    print(f"complete pairs: {report['n_rows_complete_pairs']}, exclusions: {report['n_exclusions']}")
    for k, d in report["runs"].items():
        acc = f"{d['accuracy']:.3f}" if d["accuracy"] is not None else "—"
        tok = f"{d['mean_gen_tokens']:.0f}" if d["mean_gen_tokens"] else "—"
        cost = f"${d['est_cost_usd']:.4f}" if d["est_cost_usd"] else "—"
        taxo = d.get("failure_taxonomy") or {}
        taxo_s = ", ".join(f"{t}:{n}" for t, n in taxo.items()) or "none"
        print(f"  {k:>28}: acc={acc} (n={d['n_scored']}), ~{tok} gen tok, {cost}  failures[{taxo_s}]")
    for name, d in report["pairs"].items():
        print(
            f"  {name}: {d['only_a_correct']}+{d['only_b_correct']} flips, "
            f"Δacc(B−A)={d['acc_diff_mean']:.3f} CI95 [{d['acc_diff_ci95'][0]:.3f},{d['acc_diff_ci95'][1]:.3f}], "
            f"Δtok={d['gen_tok_diff_mean']:.0f}"
        )

    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=2))
        print(f"wrote {args.out}")
    return 0
