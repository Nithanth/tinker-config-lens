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

/** Accuracy vs effort, with mean gen tokens and per-run cost overlaid. */
export function FrontierChart({ bundles }: { bundles: RunBundle[] }) {
  const data = bundles.map((b) => {
    const s = bundleStats(b);
    return {
      effort: b.config.effort ?? -1,
      acc: s.acc == null ? null : +(s.acc * 100).toFixed(1),
      tok: s.meanTok == null ? null : Math.round(s.meanTok),
      cost: +s.cost.toFixed(3),
    };
  });
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="effort" stroke={C.dim} fontSize={12} tickFormatter={(v) => `${v}`} label={{ value: "effort", position: "insideBottom", offset: -2, fill: C.dim, fontSize: 11 }} />
        <YAxis yAxisId="acc" domain={[60, 100]} stroke={C.green} fontSize={12} tickFormatter={(v) => `${v}%`} />
        <YAxis yAxisId="tok" orientation="right" stroke={C.blue} fontSize={12} />
        <Tooltip {...tip} formatter={(v: number, name: string) =>
          name === "accuracy" ? `${v}%` : name === "gen tokens" ? `${v} tok` : `$${v}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="tok" dataKey="tok" name="gen tokens" fill={C.blue} fillOpacity={0.35} radius={[3, 3, 0, 0]} />
        <Line yAxisId="acc" dataKey="acc" name="accuracy" stroke={C.green} strokeWidth={2} dot={{ r: 4 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Per-row generated-token count vs effort; color = verdict. Reveals the
 *  verbosity scaling and where truncations pile up. */
export function TokenScatter({ bundles, capLine }: { bundles: RunBundle[]; capLine?: number }) {
  const data = bundles.flatMap((b) =>
    b.rows.map((r) => {
      const o = r.outputs[0];
      return {
        effort: b.config.effort ?? -1,
        tok: o.gen_tokens ?? 0,
        ok: o.grader.verdict === 1.0,
        truncated: o.stop_reason === "length",
        id: r.row_id,
      };
    })
  );
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
