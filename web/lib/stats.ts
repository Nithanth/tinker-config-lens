import type { RunBundle, Row } from "./types";

// Paired statistics — same contract as src/lens/compare.py: align on row_id,
// complete pairs only, every exclusion named, McNemar-style flips, bootstrap CI.

export interface PairedRow {
  row_id: string;
  a: Row;
  b: Row;
  va: number | null;
  vb: number | null;
}

export function alignRuns(a: RunBundle, b: RunBundle) {
  const aRows = new Map(a.rows.map((r) => [r.row_id, r]));
  const bRows = new Map(b.rows.map((r) => [r.row_id, r]));
  const common = [...aRows.keys()].filter((id) => bRows.has(id));
  const paired: PairedRow[] = [];
  const exclusions: { row_id: string; reason: string }[] = [];

  for (const rid of common) {
    const ra = aRows.get(rid)!;
    const rb = bRows.get(rid)!;
    const va = verdict(ra);
    const vb = verdict(rb);
    if (va == null || vb == null) {
      exclusions.push({ row_id: rid, reason: va == null ? "A: no verdict" : "B: no verdict" });
      continue;
    }
    paired.push({ row_id: rid, a: ra, b: rb, va, vb });
  }
  return { paired, exclusions };
}

export const verdict = (r: Row): number | null => {
  const o = r.outputs[0];
  return o && o.error == null ? o.grader.verdict : null;
};

/** Why a non-correct output failed. Matches src/lens/compare.py:failure_kind. */
export function failureKind(o: Row["outputs"][0]): "truncation" | "parse" | "wrong_answer" | "error" | null {
  if (o.error != null) return "error";
  if (o.grader.verdict === 1.0) return null;
  if (o.stop_reason === "length" || o.stop_reason === "max_tokens") return "truncation";
  const rat = o.grader.rationale ?? "";
  if (rat.includes("malformed") || rat.includes("grader_error") || rat.includes("No boxed")) return "parse";
  return "wrong_answer";
}

export function failureTaxonomy(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r.outputs[0] && failureKind(r.outputs[0]);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function bundleStats(b: RunBundle) {
  const scored = b.rows.filter(
    (r) => r.outputs[0]?.error == null && r.outputs[0]?.grader.verdict != null
  );
  const correct = scored.filter((r) => r.outputs[0].grader.verdict === 1.0);
  const toks = scored
    .map((r) => r.outputs[0].gen_tokens ?? 0)
    .filter((t) => t > 0);
  const cost = scored
    .map((r) => r.outputs[0].est_cost_usd ?? 0)
    .reduce((a, x) => a + x, 0);
  const errors = b.rows.filter((r) => r.outputs[0]?.error != null);
  const truncated = b.rows.filter(
    (r) => r.outputs[0]?.stop_reason === "length" || r.outputs[0]?.stop_reason === "max_tokens"
  );
  return {
    n: b.rows.length,
    scored: scored.length,
    acc: scored.length ? correct.length / scored.length : null,
    meanTok: toks.length ? toks.reduce((a, x) => a + x, 0) / toks.length : null,
    cost,
    errors: errors.length,
    truncated: truncated.length,
  };
}

export interface PairStats {
  n: number;
  bothCorrect: number;
  bothWrong: number;
  onlyA: number; // regressions for A→B perspective handled by caller
  onlyB: number;
  accA: number;
  accB: number;
  accDiff: number;
  ci: [number, number];
  tokDiff: number;
  flips: PairedRow[];
}

export function pairStats(paired: PairedRow[]): PairStats {
  let bothCorrect = 0, bothWrong = 0, onlyA = 0, onlyB = 0;
  const diffs: number[] = [];
  const tokDiffs: number[] = [];
  const flips: PairedRow[] = [];

  for (const p of paired) {
    const { va, vb } = p;
    if (va == null || vb == null) continue;
    diffs.push(vb - va); // Δ = B − A: what changes going A → B
    const ta = p.a.outputs[0].gen_tokens;
    const tb = p.b.outputs[0].gen_tokens;
    if (ta != null && tb != null) tokDiffs.push(tb - ta);
    if (va === 1 && vb === 1) bothCorrect++;
    else if (va === 0 && vb === 0) bothWrong++;
    else if (va === 1) { onlyA++; flips.push(p); }
    else { onlyB++; flips.push(p); }
  }

  const n = bothCorrect + bothWrong + onlyA + onlyB;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    n,
    bothCorrect,
    bothWrong,
    onlyA,
    onlyB,
    accA: paired.filter((p) => p.va === 1).length / Math.max(paired.length, 1),
    accB: paired.filter((p) => p.vb === 1).length / Math.max(paired.length, 1),
    accDiff: mean(diffs),
    ci: bootstrapCI(diffs),
    tokDiff: mean(tokDiffs),
    flips,
  };
}

export function bootstrapCI(diffs: number[], draws = 10000): [number, number] {
  if (!diffs.length) return [0, 0];
  const n = diffs.length;
  const boots: number[] = new Array(draws);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < draws; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += diffs[Math.floor(rand() * n)];
    boots[i] = s / n;
  }
  boots.sort((x, y) => x - y);
  return [boots[Math.floor(0.025 * draws)], boots[Math.floor(0.975 * draws)]];
}
