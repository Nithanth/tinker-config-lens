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
    diffs.push(va - vb);
    const ta = p.a.outputs[0].gen_tokens;
    const tb = p.b.outputs[0].gen_tokens;
    if (ta != null && tb != null) tokDiffs.push(ta - tb);
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
