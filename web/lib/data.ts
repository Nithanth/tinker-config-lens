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
