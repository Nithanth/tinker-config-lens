"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RunBundle } from "@/lib/types";
import { runKey } from "@/lib/types";
import { alignRuns, pairStats, failureKind, type PairedRow } from "@/lib/stats";
import { ConfidenceTrace } from "./charts";

const KIND_COLOR: Record<string, string> = {
  truncation: "var(--yellow)",
  parse: "var(--red)",
  wrong_answer: "var(--dim)",
  error: "var(--red)",
};

function Half({ label, out, ok }: {
  label: string;
  out: PairedRow["a"]["outputs"][0];
  ok: boolean;
}) {
  const kind = failureKind(out);
  return (
    <div className="insp-half">
      <div className="insp-head">
        <span className={ok ? "pill ok" : "pill bad"}>{ok ? "correct" : (kind ?? "wrong")}</span>
        <span className="insp-label">{label}</span>
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
        <div className="dim grader-note">grader: {out.grader.rationale}</div>
      )}
    </div>
  );
}

export default function Atlas({ bundles }: { bundles: RunBundle[] }) {
  const [aIdx, setAIdx] = useState(0);
  const [bIdx, setBIdx] = useState(Math.min(1, bundles.length - 1));
  const [sel, setSel] = useState<PairedRow | null>(null);
  const [filter, setFilter] = useState<"all" | "regressions" | "gains">("all");
  const inspRef = useRef<HTMLDivElement>(null);

  const a = bundles[aIdx];
  const b = bundles[bIdx];
  const { paired, exclusions } = useMemo(() => alignRuns(a, b), [a, b]);
  const stats = useMemo(() => pairStats(paired), [paired]);

  useEffect(() => {
    if (sel && inspRef.current) {
      inspRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [sel]);

  const flips = useMemo(() => {
    let list = stats.flips;
    if (filter === "regressions") list = list.filter((f) => f.va === 1);
    if (filter === "gains") list = list.filter((f) => f.vb === 1);
    return [...list].sort(
      (p, q) => Math.abs((q.b.outputs[0].gen_tokens ?? 0) - (q.a.outputs[0].gen_tokens ?? 0))
        - Math.abs((p.b.outputs[0].gen_tokens ?? 0) - (p.a.outputs[0].gen_tokens ?? 0))
    );
  }, [stats, filter]);

  // what kind of failures did the loser produce on flipped rows?
  const flipTaxo = useMemo(() => {
    const t: Record<string, number> = {};
    for (const f of stats.flips) {
      const loser = f.va === 1 ? f.b.outputs[0] : f.a.outputs[0];
      const k = failureKind(loser) ?? "wrong_answer";
      t[k] = (t[k] ?? 0) + 1;
    }
    return t;
  }, [stats]);

  return (
    <div className="panel">
      <div className="tabs">
        <select value={aIdx} onChange={(e) => { setAIdx(+e.target.value); setSel(null); }}>
          {bundles.map((x, i) => <option key={i} value={i}>{runKey(x)}</option>)}
        </select>
        <span className="dim arrow">→</span>
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
        <div className="m-num">{stats.bothCorrect}</div>
        <div className={stats.onlyA ? "warn-cell" : "dim"}>{stats.onlyA}</div>
        <div>{stats.onlyA + stats.onlyB}</div>
        <div className="hdr">{runKey(a)} ✗</div>
        <div className={stats.onlyB ? "warn-cell" : "dim"}>{stats.onlyB}</div>
        <div className="m-num">{stats.bothWrong}</div>
        <div></div>
      </div>

      <p className="dim stats-line">
        n={stats.n} pairs · Δacc(B−A)={stats.accDiff >= 0 ? "+" : ""}{stats.accDiff.toFixed(3)}
        {" "}CI95 [{stats.ci[0].toFixed(3)}, {stats.ci[1].toFixed(3)}]
        · Δtok={stats.tokDiff >= 0 ? "+" : ""}{stats.tokDiff.toFixed(0)}
        {exclusions.length > 0 && <> · {exclusions.length} excl</>}
      </p>

      {stats.flips.length > 0 && (
        <div className="taxonomy-line">
          flip failures:{" "}
          {Object.entries(flipTaxo).map(([k, n]) => (
            <span key={k} className="taxo-chip" style={{ borderColor: KIND_COLOR[k], color: KIND_COLOR[k] }}>
              {n} {k.replace("_", " ")}
            </span>
          ))}
        </div>
      )}

      {stats.flips.length > 0 && (
        <>
          <div className="tabs">
            {(["all", "regressions", "gains"] as const).map((f) => (
              <span key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                {f === "regressions" ? `${runKey(a)} ✓→✗` : f === "gains" ? `${runKey(b)} ✗→✓` : "all flips"}
              </span>
            ))}
          </div>
          <div className="flip-table-wrap">
            <table>
              <thead>
                <tr><th>row</th><th>{runKey(a)}</th><th>{runKey(b)}</th><th>why it lost</th><th>gold</th><th>tok Δ</th></tr>
              </thead>
              <tbody>
                {flips.map((f) => {
                  const loser = f.va === 1 ? f.b.outputs[0] : f.a.outputs[0];
                  const k = failureKind(loser);
                  return (
                    <tr key={f.row_id}
                        className={`flip-row ${sel?.row_id === f.row_id ? "selected" : ""}`}
                        onClick={() => setSel(f)}>
                      <td><code>{f.row_id.slice(0, 26)}</code></td>
                      <td><span className={f.va ? "pill ok" : "pill bad"}>{f.va ? "✓" : "✗"}</span></td>
                      <td><span className={f.vb ? "pill ok" : "pill bad"}>{f.vb ? "✓" : "✗"}</span></td>
                      <td>
                        {k && (
                          <span className="taxo-chip" style={{ borderColor: KIND_COLOR[k], color: KIND_COLOR[k] }}>
                            {k.replace("_", " ")}
                          </span>
                        )}
                      </td>
                      <td className="dim">{f.a.gold ?? "—"}</td>
                      <td className="dim">{(f.b.outputs[0].gen_tokens ?? 0) - (f.a.outputs[0].gen_tokens ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sel && (
        <div className="inspector" ref={inspRef} key={sel.row_id}>
          <div className="insp-title">
            <code>{sel.row_id}</code>
            <span className="dim">gold: {sel.a.gold}</span>
          </div>
          <div className="mono-pre prompt-pre">{sel.a.prompt}</div>
          <div className="insp-grid">
            <Half label={runKey(a)} out={sel.a.outputs[0]} ok={!!sel.va} />
            <Half label={runKey(b)} out={sel.b.outputs[0]} ok={!!sel.vb} />
          </div>
        </div>
      )}
    </div>
  );
}
