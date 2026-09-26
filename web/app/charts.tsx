"use client";

import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ScatterChart, Scatter, ZAxis, CartesianGrid, Legend,
  LineChart, ReferenceLine,
} from "recharts";
import type { RunBundle } from "@/lib/types";
import { bundleStats } from "@/lib/stats";

const C = {
  fg: "#e6edf3", dim: "#8b949e", border: "#30363d",
  green: "#3fb950", red: "#f85149", blue: "#58a6ff", yellow: "#d29922",
};

const tip = {
  contentStyle: { background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "#8b949e" },
};

const MCOLORS = ["#3fb950", "#bc8cff", "#58a6ff", "#d29922"];

/** Accuracy vs effort per model, with mean gen tokens as grouped bars. */
export function FrontierChart({ bundles }: { bundles: RunBundle[] }) {
  const models = [...new Set(bundles.map((b) => b.config.model_id.split("/").pop()!))];
  const byEffort = new Map<number, Record<string, number | null>>();
  let minAcc = 100;
  for (const b of bundles) {
    const e = b.config.effort ?? -1;
    const m = b.config.model_id.split("/").pop()!;
    const s = bundleStats(b);
    const row = byEffort.get(e) ?? { effort: e };
    row[`acc_${m}`] = s.acc == null ? null : +(s.acc * 100).toFixed(1);
    row[`tok_${m}`] = s.meanTok == null ? null : Math.round(s.meanTok);
    if (s.acc != null) minAcc = Math.min(minAcc, s.acc * 100);
    byEffort.set(e, row);
  }
  const data = [...byEffort.values()].sort((a, b) => (a.effort as number) - (b.effort as number));
  const accFloor = Math.max(0, Math.floor((minAcc - 5) / 10) * 10);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="effort" stroke={C.dim} fontSize={12} tickFormatter={(v) => `${v}`} label={{ value: "effort", position: "insideBottom", offset: -2, fill: C.dim, fontSize: 11 }} />
        <YAxis yAxisId="acc" domain={[accFloor, 100]} stroke={C.dim} fontSize={12} tickFormatter={(v) => `${v}%`} />
        <YAxis yAxisId="tok" orientation="right" stroke={C.dim} fontSize={12} />
        <Tooltip {...tip} formatter={(v: number, name: string) =>
          name.startsWith("tok:") ? `${v} tok` : `${v}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {models.map((m, i) => (
          <Bar key={`t-${m}`} yAxisId="tok" dataKey={`tok_${m}`} name={`tok: ${m}`}
               fill={MCOLORS[i % MCOLORS.length]} fillOpacity={0.25} radius={[3, 3, 0, 0]} />
        ))}
        {models.map((m, i) => (
          <Line key={`a-${m}`} yAxisId="acc" dataKey={`acc_${m}`} name={m}
                stroke={MCOLORS[i % MCOLORS.length]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Per-row generated-token count vs effort; color = verdict. Reveals the
 *  verbosity scaling and where truncations pile up. */
export function TokenScatter({ bundles, capLine }: { bundles: RunBundle[]; capLine?: number }) {
  const models = [...new Set(bundles.map((b) => b.config.model_id))];
  const data = bundles.flatMap((b) => {
    // when two models share a manifest, jitter effort slightly so the
    // clouds don't sit exactly on top of each other
    const j = models.length > 1 ? (models.indexOf(b.config.model_id) === 0 ? -0.012 : 0.012) : 0;
    return b.rows.map((r) => {
      const o = r.outputs[0];
      return {
        effort: (b.config.effort ?? -1) + j,
        tok: o.gen_tokens ?? 0,
        ok: o.grader.verdict === 1.0,
        truncated: o.stop_reason === "length",
        id: r.row_id,
      };
    });
  });
  const ok = data.filter((d) => d.ok && !d.truncated);
  const wrong = data.filter((d) => !d.ok && !d.truncated);
  const trunc = data.filter((d) => d.truncated);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
        <XAxis dataKey="effort" type="number" domain={[-0.03, 1.02]} stroke={C.dim} fontSize={12}
          label={{ value: "effort", position: "insideBottom", offset: -2, fill: C.dim, fontSize: 11 }} />
        <YAxis dataKey="tok" type="number" stroke={C.dim} fontSize={12} />
        <ZAxis range={[28, 28]} />
        <Tooltip {...tip} cursor={{ strokeDasharray: "3 3" }}
          formatter={(v: number, name: string) => (name === "tokens" ? `${v}` : v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {capLine && <ReferenceLine y={capLine} yAxisId={0} stroke={C.yellow} strokeDasharray="4 4" />}
        <Scatter data={ok} name="correct" fill={C.green} fillOpacity={0.55} />
        <Scatter data={wrong} name="wrong" fill={C.red} fillOpacity={0.9} />
        <Scatter data={trunc} name="hit cap" fill={C.yellow} fillOpacity={0.9} shape="triangle" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Per-token logprob trace under a model answer — confidence over the
 *  generation. Rendered small inside the inspector. */
export function ConfidenceTrace({ lps, label }: { lps: number[]; label: string }) {
  const data = lps.map((lp, i) => ({ i, lp }));
  const min = Math.min(...lps);
  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <YAxis domain={[Math.min(min, -8), 0]} hide />
        <Line dataKey="lp" stroke={C.blue} dot={false} strokeWidth={1.2} isAnimationActive={false} />
        <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(2)} nats`} labelFormatter={(i) => `${label} · token ${i}`} />
      </LineChart>
    </ResponsiveContainer>
  );
}
