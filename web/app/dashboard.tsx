"use client";

import { useMemo, useState } from "react";
import type { RunBundle } from "@/lib/types";
import { runKey } from "@/lib/types";
import { bundleStats } from "@/lib/stats";
import { FrontierChart, TokenScatter } from "./charts";
import Atlas from "./atlas";

export default function Dashboard({ bundles }: { bundles: RunBundle[] }) {
  // group by manifest — pairing across frozen sets is meaningless
  const groups = useMemo(() => {
    const m = new Map<string, RunBundle[]>();
    for (const b of bundles) {
      const k = b.manifest_hash;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    }
    return [...m.entries()].map(([hash, bs]) => ({
      hash,
      bundles: bs.sort((x, y) => (x.config.effort ?? -1) - (y.config.effort ?? -1)),
      // manifest label: first row's benchmark, or provenance
      label: bs[0].rows[0]?.source_ids?.benchmark ?? bs[0].provenance?.manifest ?? hash.slice(0, 8),
    }));
  }, [bundles]);

  const [gIdx, setGIdx] = useState(0);
  const g = groups[gIdx];
  const stats = g.bundles.map(bundleStats);
  const totalCost = stats.reduce((s, x) => s + x.cost, 0);
  const totalCells = stats.reduce((s, x) => s + x.n, 0);

  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>Tinker Config Lens</h1>
          <p className="dim">
            paired-run inspection · {g.bundles.length} runs · {totalCells} cells ·
            ${totalCost.toFixed(2)} total
          </p>
        </div>
      </div>

      {groups.length > 1 && (
        <div className="tabs">
          <span className="dim">manifest:</span>
          {groups.map((gr, i) => (
            <span key={gr.hash} className={`tab ${i === gIdx ? "active" : ""}`} onClick={() => setGIdx(i)}>
              {gr.label} ({gr.bundles[0].rows.length} rows · {gr.hash.slice(0, 8)})
            </span>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="panel-title">accuracy vs effort — and what it costs</div>
        <FrontierChart bundles={g.bundles} />
        <p className="dim chart-note">
          green line: accuracy · blue bars: mean generated tokens (right axis).
        </p>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">per-row generated tokens — where the effort went</div>
        <TokenScatter bundles={g.bundles} capLine={g.bundles[0].config.decoding.max_tokens} />
        <p className="dim chart-note">
          each dot is one (row, effort) cell. Yellow triangles hit the generation
          cap mid-thought and never emitted a final answer.
        </p>
      </div>

      <h2>runs</h2>
      <table>
        <thead>
          <tr>
            <th>run</th><th>accuracy</th><th>n</th><th>~gen tok</th>
            <th>est. cost</th><th>hit cap</th><th>errors</th><th>config</th>
          </tr>
        </thead>
        <tbody>
          {g.bundles.map((b, i) => {
            const s = stats[i];
            return (
              <tr key={b.run_id + b.config.effort}>
                <td>{runKey(b)}</td>
                <td className={s.acc != null && s.acc >= 0.9 ? "ok-text" : ""}>
                  {s.acc == null ? "—" : `${(s.acc * 100).toFixed(1)}%`}
                </td>
                <td>{s.scored}/{s.n}</td>
                <td>{s.meanTok == null ? "—" : s.meanTok.toFixed(0)}</td>
                <td>${s.cost.toFixed(3)}</td>
                <td>{s.truncated || "—"}</td>
                <td>{s.errors || "—"}</td>
                <td className="dim" title={`run ${b.run_id} · ${b.config_hash}`}>
                  <code>{b.config_hash.slice(0, 8)}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>flip atlas</h2>
      <Atlas bundles={g.bundles} />
    </div>
  );
}
