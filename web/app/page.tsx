import { loadBundles, bundleStats } from "@/lib/data";
import { runKey } from "@/lib/types";
import Atlas from "./atlas";

export default function Home() {
  const bundles = loadBundles();
  if (!bundles.length) {
    return (
      <div className="page">
        <h1>Tinker Config Lens</h1>
        <p className="dim">
          No RunBundles found in <code>web/public/data/</code>. Run{" "}
          <code>lens sweep</code> or <code>lens import-evalstore</code>, then copy
          the JSON files here.
        </p>
      </div>
    );
  }

  const hashes = new Set(bundles.map((b) => b.manifest_hash));
  return (
    <div className="page">
      <h1>Tinker Config Lens</h1>
      <p className="dim">
        {bundles.length} run(s) · manifest{" "}
        <code>{[...hashes][0].slice(0, 12)}…</code>
        {hashes.size > 1 && <span className="pill bad"> {hashes.size} manifests — mixing frozen sets!</span>}
      </p>

      <h2>Run comparison</h2>
      <table>
        <thead>
          <tr>
            <th>run</th><th>accuracy</th><th>n</th><th>~gen tok</th>
            <th>est. cost</th><th>errors</th><th>truncated</th><th>config</th>
          </tr>
        </thead>
        <tbody>
          {bundles.map((b) => {
            const s = bundleStats(b);
            return (
              <tr key={b.run_id + b.config.effort}>
                <td>{runKey(b)}</td>
                <td>{s.acc == null ? "—" : `${(s.acc * 100).toFixed(1)}%`}</td>
                <td>{s.scored}/{s.n}</td>
                <td>{s.meanTok == null ? "—" : s.meanTok.toFixed(0)}</td>
                <td>{s.cost ? `$${s.cost.toFixed(3)}` : "—"}</td>
                <td>{s.errors || "—"}</td>
                <td>{s.truncated || "—"}</td>
                <td className="dim" title={`run ${b.run_id} · config ${b.config_hash.slice(0, 12)}…`}>
                  <code>{b.config_hash.slice(0, 8)}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Flip atlas</h2>
      <Atlas bundles={bundles} />
    </div>
  );
}
