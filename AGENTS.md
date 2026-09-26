# Agent rules

- `SPEC.md` is the source of truth for scope and cost rules. It exists locally but is gitignored — never commit or push it (same for `DEVIN_AND_SHIP_PLAN.md`). Do not run bulk sampling before the instrument check (`docs/verification.md`) passes and the owner approves a dollar forecast.
- `TINKER_API_KEY` lives outside the repo at `~/.secrets/tinker.env` (dotenv format). To use it: `set -a && source ~/.secrets/tinker.env && set +a` per command. Never print, log, echo, or commit the value, and never copy the file into the repo. Grep the repo for secrets before every commit.
- Spend limits: $25 planning stop including smoke/debug; $100 absolute ceiling. Track spend from cached token records and report cumulative spend vs. the limit in every run summary.
- Keep all dependency versions in `pyproject.toml` pinned to the versions verified in `docs/verification.md`. Do not upgrade packages to "fix" problems without asking.
