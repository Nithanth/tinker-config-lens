"""Secret loading: TINKER_API_KEY from env, or ~/.secrets/tinker.env fallback.

The key must never live in the repo. Order: existing env var wins; otherwise
read the owner's dotenv file outside the repo. The value is never printed or
logged.
"""

import os
from pathlib import Path

_KEY = "TINKER_API_KEY"
_FALLBACK = Path.home() / ".secrets" / "tinker.env"


def ensure_api_key() -> str:
    if os.environ.get(_KEY):
        return os.environ[_KEY]
    if _FALLBACK.exists():
        for line in _FALLBACK.read_text().splitlines():
            line = line.strip()
            if line.startswith(f"{_KEY}="):
                os.environ[_KEY] = line.split("=", 1)[1].strip().strip('"').strip("'")
                return os.environ[_KEY]
    raise SystemExit(
        f"{_KEY} not set — export it, or write {_KEY}=<key> to {_FALLBACK}"
    )
