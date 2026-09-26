import { loadBundles } from "@/lib/data";
import Dashboard from "./dashboard";

export default function Home() {
  const bundles = loadBundles();
  if (!bundles.length) {
    return (
      <div className="page">
        <h1>Tinker Config Lens</h1>
        <p className="dim">
          No RunBundles found in <code>web/public/data/</code>. Run{" "}
          <code>lens sweep</code> or <code>lens import-evalstore</code>, then{" "}
          <code>lens export-web</code>.
        </p>
      </div>
    );
  }
  return <Dashboard bundles={bundles} />;
}
