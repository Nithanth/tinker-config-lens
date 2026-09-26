"use client";

import { useMemo, useState } from "react";
import type { RunBundle } from "@/lib/types";
import { runKey } from "@/lib/types";
import { alignRuns, pairStats, type PairedRow } from "@/lib/stats";
import { ConfidenceTrace } from "./charts";

function Half({ label, out, ok, prompt }: {
  label: string;
  out: PairedRow["a"]["outputs"][0];
  ok: boolean;
  prompt: string;
}) {
  return (
    <div>
      <div className="insp-head">
        <span className={ok ? "pill ok" : "pill bad"}>{ok ? "correct" : "wrong"}</span>
        <span className="dim">{label}</span>
        <span className="dim insp-meta">
          {out.gen_tokens} tok · {out.stop_reason ?? "—"}
          {out.mean_logprob != null && ` · ${out.mean_logprob.toFixed(2)} nats/tok`}
          {out.est_cost_usd != null && ` · $${out.est_cost_usd.toFixed(4)}`}
        </span>
      </div>
      {out.token_logprobs && (
        <ConfidenceTrace lps={out.token_logprobs} label={label} />
      )}
      <div className="mono-pre">{out.final_answer ?? out.raw_output ?? "(no output)"}</div>
      {out.grader.rationale && !out.grader.rationale.startsWith("stop") && (
        <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
          grader: {out.grader.rationale}
        </div>
      )}
    </div>
  );
}

export default function Atlas({ bundles }: { bundles: RunBundle[] }) {
  const [aIdx, setAIdx] = useState(0);
  const [bIdx, setBIdx] = useState(Math.min(1, bundles.length - 1));
  const [sel, setSel] = useState<PairedRow | null>(null);
  const [filter, setFilter] = useState<"all" | "regressions" | "gains">("all");

  const a = bundles[aIdx];
  const b = bundles[bIdx];
  const { paired, exclusions } = useMemo(() => alignRuns(a, b), [a, b]);
  const stats = useMemo(() => pairStats(paired), [paired]);

  const flips = useMemo(() => {
    let list = stats.flips;
    if (filter === "regressions") list = list.filter((f) => f.va === 1); // A right, B wrong
    if (filter === "gains") list = list.filter((f) => f.vb === 1);
    return [...list].sort(
      (p, q) =>
        (q.b.outputs[0].gen_tokens ?? 0) - (q.b.outputs[0].gen_tokens ?? 0) &&
        (p.vb ?? 0) - (q.vb ?? 0)
    );
  }, [stats, filter]);

  return (
    <div className="panel">
      <div className="tabs">
        <select value={aIdx} onChange={(e) => { setAIdx(+e.target.value); setSel(null); }}>
          {bundles.map((x, i) => <option key={i} value={i}>{runKey(x)}</option>)}
        </select>
        <span className="dim" style={{ alignSelf: "center" }}>vs</span>
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
        <div className={stats.onlyA ? "warn-cell" : "dim"}>{stats.onlyA}</div>
        <div>{stats.onlyA + stats.onlyB}</div>
        <div className="hdr">{runKey(a)} ✗</div>
        <div className={stats.onlyB ? "warn-cell" : "dim"}>{stats.onlyB}</div>
        <div>{stats.bothWrong}</div>
        <div></div>
      </div>

      <p className="dim">
        n={stats.n} complete pairs · Δacc(B−A)={stats.accDiff >= 0 ? "+" : ""}{stats.accDiff.toFixed(3)}
        {" "}CI95 [{stats.ci[0].toFixed(3)}, {stats.ci[1].toFixed(3)}]
        · Δgen-tok={stats.tokDiff >= 0 ? "+" : ""}{stats.tokDiff.toFixed(0)}
        {exclusions.length > 0 && <> · {exclusions.length} excluded</>}
      </p>

      {stats.flips.length > 0 && (
        <>
          <div className="tabs" style={{ marginTop: 4 }}>
            {(["all", "regressions", "gains"] as const).map((f) => (
              <span key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                {f === "regressions" ? `${runKey(a)}→✗` : f === "gains" ? `${runKey(b)}→✓` : "all flips"}
              </span>
            ))}
          </div>
          <table>
            <thead>
              <tr><th>row</th><th>{runKey(a)}</th><th>{runKey(b)}</th><th>gold</th><th>tok Δ</th></tr>
            </thead>
            <tbody>
              {flips.map((f) => (
                <tr key={f.row_id} className="flip-row" onClick={() => setSel(f)}>
                  <td><code>{f.row_id.slice(0, 26)}</code></td>
                  <td><span className={f.va ? "pill ok" : "pill bad"}>{f.va ? "✓" : "✗"}</span></td>
                  <td><span className={f.vb ? "pill ok" : "pill bad"}>{f.vb ? "✓" : "✗"}</span></td>
                  <td className="dim">{f.a.gold ?? "—"}</td>
                  <td>{(f.b.outputs[0].gen_tokens ?? 0) - (f.a.outputs[0].gen_tokens ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {sel && (
        <div className="inspector">
          <div className="dim" style={{ marginBottom: 8 }}>
            {sel.row_id} · gold: <code>{sel.a.gold}</code>
          </div>
          <div className="mono-pre" style={{ maxHeight: 140 }}>{sel.a.prompt}</div>
          <div className="insp-grid">
            <Half label={runKey(a)} out={sel.a.outputs[0]} ok={!!sel.va} prompt={sel.a.prompt} />
            <Half label={runKey(b)} out={sel.b.outputs[0]} ok={!!sel.vb} prompt={sel.a.prompt} />
          </div>
        </div>
      )}
    </div>
  );
}
