"""`lens web` — serve the read-only inspector over exported bundle data.

The app is a static export (web/out) that fetches slimmed bundle JSON from
its own directory — no backend, no keys. This command builds it if needed
(`npm run build` in web/) and serves it locally, the `tensorboard` pattern:
`sweep → export-web → web`.
"""

from __future__ import annotations

import functools
import http.server
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path


def _find_web(args) -> Path | None:
    # web/ next to cwd, else next to the installed package's repo root
    cands = [Path(args.dir), Path.cwd() / "web",
             Path(__file__).resolve().parents[2] / "web"]
    return next((c for c in cands if (c / "package.json").exists()), None)


def _ensure_build(web: Path, rebuild: bool) -> Path | None:
    out = web / "out"
    if out.exists() and not rebuild:
        return out
    if not shutil.which("npm"):
        print("error: npm not found — build the app manually: cd web && npm run build")
        return None
    if not (web / "node_modules").exists():
        print("installing web deps…")
        subprocess.run(["npm", "install"], cwd=web, check=True)
    print("building static export…")
    subprocess.run(["npm", "run", "build"], cwd=web, check=True)
    return out if out.exists() else None


def main(args) -> int:
    web = _find_web(args)
    if web is None:
        print("error: could not find web/ (no package.json) — run from the repo root or pass --dir")
        return 1
    out = _ensure_build(web, args.rebuild)
    if out is None:
        return 1
    if not (out / "data" / "index.json").exists():
        print(f"note: {out}/data/index.json missing — run `lens export-web` first "
              "(the app will show an empty state)")

    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(out)
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    url = f"http://127.0.0.1:{server.server_address[1]}"
    print(f"lens web — serving {out} at {url}  (Ctrl-C to stop)")
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0
