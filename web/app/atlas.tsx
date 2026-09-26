"use client";

import { useMemo, useState } from "react";
import type { RunBundle } from "@/lib/types";
import { runKey } from "@/lib/types";
import { alignRuns, pairStats, type PairedRow } from "@/lib/stats";

export default function Atlas({ bundles }: { bundles: RunBundle[] }) {
  const [aIdx, setAIdx] = useState(0);
  const [bIdx, setBIdx] = useState(Math.min(1, bundles.length - 1));
  const [sel, setSel] = useState<PairedRow | null>(null);

  const a = bundles[aIdx];
  const b = bundles[bIdx];
  const { paired, exclusions } = useMemo(() => alignRuns(a, b), [a, b]);
  const stats = useMemo(() => pairStats(paired), [paired]);

  // regressions first: B-correct/A-wrong shown as A's gain, etc. Sorted so
  // cases where the *second* run improved appear first (the interesting flips).
  const sortedFlips = useMemo(
    () => [...stats.flips].sort((p, q) => (p.vb ?? 0) - (q.vb ?? 0) || (q.a.outputs[0].gen_tokens ?? 0) - (p.a.outputs[0].gen_tokens ?? 0)),
    [stats]
  );

  const sel_ = sel && { a: sel.a.outputs[0], b: sel.b.outputs[0] };

  return (
    <div>
      <div className="tabs">
        <span className="dim" style={{ padding: "6px 0" }}>pair:</span>
        <select value={aIdx} onChange={(e) => { setAIdx(+e.target.value); setSel(null); }}>
          {bundles.map((x, i) => <option key={i} value={i}>{runKey(x)}</option>)}
        </select>
        <span className="dim" style={{ padding: "6px 0" }}>vs</span>
        <select value={bIdx} onChange={(e) => { setBIdx(+e.target.value); setSel(null); }}>
          {bundles.map((x, i) => <option key={i} value={i}>{runKey(x)}</option>)}
        </select>
      </div>

      <div className="matrix">
        <div className="hdr"></div>
        <div className="hdr">{runKey(b)} ✓</div>
        <div className="hdr">{runKey(b)} ✗</div>
        <div className="hdr">flips</div>
        <div className="hdr">{runKey(a)} ✓</div>
        <div>{stats.bothCorrect}</div>
        <div className={stats.onlyA ? "" : "dim"}>{stats.onlyA}</div>
        <div>{stats.onlyA + stats.onlyB}</div>
        <div className="hdr">{runKey(a)} ✗</div>
        <div className={stats.onlyB ? "" : "dim"}>{stats.onlyB}</div>
        <div>{stats.bothWrong}</div>
        <div></div>
      </div>

      <p className="dim">
        n={stats.n} complete pairs · Δacc(B−A)={stats.accDiff.toFixed(3)} CI95 [{stats.ci[0].toFixed(3)}, {stats.ci[1].toFixed(3)}]
        · Δgen-tok={stats.tokDiff.toFixed(0)}
        {exclusions.length > 0 && <> · {exclusions.length} excluded</>}
      </p>

      {stats.flips.length > 0 && (
        <table>
          <thead>
            <tr><th>row</th><th>{runKey(a)}</th><th>{runKey(b)}</th><th>gold</th><th>tok Δ</th></tr>
          </thead>
          <tbody>
            {sortedFlips.map((f) => (
              <tr key={f.row_id} className="flip-row" onClick={() => setSel(f)}>
                <td><code>{f.row_id.slice(0, 24)}</code></td>
                <td><span className={f.va ? "pill ok" : "pill bad"}>{f.va ? "✓" : "✗"}</span></td>
                <td><span className={f.vb ? "pill ok" : "pill bad"}>{f.vb ? "✓" : "✗"}</span></td>
                <td className="dim">{f.a.gold ?? "—"}</td>
                <td>{(f.b.outputs[0].gen_tokens ?? 0) - (f.a.outputs[0].gen_tokens ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sel && sel_ && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="dim">inspector — {sel.row_id} · gold: {sel.a.gold}</div>
          <h2>prompt</h2>
          <div className="mono-pre">{sel.a.prompt}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <h2>{runKey(a)} {sel.va ? "✓" : "✗"} · {sel_.a.gen_tokens} tok · {sel_.a.stop_reason}{sel_.a.mean_logprob != null && ` · ${sel_.a.mean_logprob.toFixed(2)} nats/tok`}</h2>
              <div className="mono-pre">{sel_.a.final_answer ?? sel_.a.raw_output}</div>
            </div>
            <div>
              <h2>{runKey(b)} {sel.vb ? "✓" : "✗"} · {sel_.b.gen_tokens} tok · {sel_.b.stop_reason}{sel_.b.mean_logprob != null && ` · ${sel_.b.mean_logprob.toFixed(2)} nats/tok`}</h2>
              <div className="mono-pre">{sel_.b.final_answer ?? sel_.b.raw_output}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
