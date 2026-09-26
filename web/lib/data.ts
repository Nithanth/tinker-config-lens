import type { ManifestEntry, RunBundle, WebIndex } from "./types";

// Bundles are static JSON under public/data/, written by `lens export-web`.
// The app loads index.json first, then fetches a manifest's bundles when its
// tab is selected — manifests can be tens of MB, so they load lazily.
export async function loadIndex(): Promise<WebIndex | null> {
  try {
    const r = await fetch("data/index.json");
    if (!r.ok) return null;
    return (await r.json()) as WebIndex;
  } catch {
    return null;
  }
}

export async function loadManifest(m: ManifestEntry): Promise<RunBundle[]> {
  const bundles = await Promise.all(
    m.files.map((f) => fetch(`data/${f}`).then((r) => r.json() as Promise<RunBundle>))
  );
  return bundles.sort((a, b) => (a.config.effort ?? -1) - (b.config.effort ?? -1));
}
