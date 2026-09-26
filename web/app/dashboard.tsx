"use client";

import { useEffect, useState } from "react";
import type { RunBundle, WebIndex } from "@/lib/types";
import { runKey } from "@/lib/types";
import { loadIndex, loadManifest } from "@/lib/data";
import { bundleStats, failureTaxonomy } from "@/lib/stats";
import { FrontierChart, TokenScatter } from "./charts";
import Atlas from "./atlas";

export default function Dashboard() {
  const [index, setIndex] = useState<WebIndex | null>(null);
  const [missing, setMissing] = useState(false);
  const [gIdx, setGIdx] = useState(0);
  // manifest_hash -> bundles; fetched lazily per tab
  const [cache, setCache] = useState<Record<string, RunBundle[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadIndex().then((ix) => {
      if (ix && ix.manifests.length) setIndex(ix);
      else setMissing(true);
    });
  }, []);

  const g = index?.manifests[gIdx];
  const bundles = g ? cache[g.manifest_hash] : undefined;

  useEffect(() => {
    if (!g || cache[g.manifest_hash]) return;
    setLoading(true);
    loadManifest(g).then((bs) => {
      setCache((c) => ({ ...c, [g.manifest_hash]: bs }));
      setLoading(false);
    });
  }, [g, cache]);

  if (missing) {
    return (
      <div className="page">
        <h1>Tinker Config Lens</h1>
        <p className="dim">
          No data in <code>web/public/data/</code>. Run <code>lens sweep</code>{" "}
          or <code>lens import-evalstore</code>, then <code>lens export-web</code>.
        </p>
      </div>
    );
  }
  if (!index || !g) {
    return (
      <div className="page">
        <h1>Tinker Config Lens</h1>
        <p className="dim">loading index…</p>
      </div>
    );
  }

  const stats = bundles?.map(bundleStats);
  const totalCost = stats?.reduce((s, x) => s + x.cost, 0) ?? 0;
  const totalCells = stats?.reduce((s, x) => s + x.n, 0) ?? 0;

  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>Tinker Config Lens</h1>
          <p className="dim">
            paired-run inspection · {g.files.length} runs · {totalCells} cells ·
            ${totalCost.toFixed(2)} total
          </p>
        </div>
      </div>

      {index.manifests.length > 1 && (
        <div className="tabs">
          <span className="dim">manifest:</span>
          {index.manifests.map((m, i) => (
            <span key={m.manifest_hash}
                  className={`tab ${i === gIdx ? "active" : ""}`}
                  onClick={() => setGIdx(i)}>
              {m.label} ({m.n_rows} rows · {m.manifest_hash.slice(0, 8)})
            </span>
          ))}
        </div>
      )}

      {(!bundles || loading) && <p className="dim">loading {g.label}…</p>}

      {bundles && stats && (
        <>
          <div className="panel">
            <div className="panel-title">accuracy vs effort — and what it costs</div>
            <FrontierChart bundles={bundles} />
            <p className="dim chart-note">
              green line: accuracy · blue bars: mean generated tokens (right axis).
            </p>
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-title">per-row generated tokens — where the effort went</div>
            <TokenScatter bundles={bundles} capLine={bundles[0].config.decoding.max_tokens} />
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
                <th>est. cost</th><th>failure breakdown</th><th>config</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((b, i) => {
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
                    <td>
                      {Object.entries(failureTaxonomy(b.rows)).map(([k, n]) => (
                        <span key={k} className="taxo-chip">{n} {k.replace("_", " ")}</span>
                      ))}
                    </td>
                    <td className="dim" title={`run ${b.run_id} · ${b.config_hash}`}>
                      <code>{b.config_hash.slice(0, 8)}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2>flip atlas</h2>
          <Atlas bundles={bundles} />
        </>
      )}
    </div>
  );
}
