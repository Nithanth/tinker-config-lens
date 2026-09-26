import fs from "fs";
import path from "path";
import type { RunBundle } from "./types";

// Bundles are plain JSON dropped into web/public/data/ — `lens sweep` writes
// them to runs/, and `npm run sync-data` (or a manual copy) moves them here.
// The app never calls the API; it only ever reads these files.
export function loadBundles(): RunBundle[] {
  const dir = path.join(process.cwd(), "public", "data");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as RunBundle)
    .sort((a, b) => (a.config.effort ?? -1) - (b.config.effort ?? -1));
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
    (r) => r.outputs[0]?.stop_reason === "truncated" || r.outputs[0]?.stop_reason === "max_tokens"
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
