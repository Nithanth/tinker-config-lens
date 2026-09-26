# Agent rules

- `SPEC.md` is the source of truth for scope, milestones, and cost rules. It exists locally but is gitignored — never commit or push it (same for `DEVIN_AND_SHIP_PLAN.md`). Follow its milestone gates (M0→M4); do not run bulk sampling before the M0 gate passes and the owner approves a dollar forecast.
- `TINKER_API_KEY` lives outside the repo at `~/.secrets/tinker.env` (dotenv format). To use it: `set -a && source ~/.secrets/tinker.env && set +a` per command. Never print, log, echo, or commit the value, and never copy the file into the repo. Grep the repo for secrets before every commit.
- Spend limits (SPEC.md §4): $25 planning stop including smoke/debug; $100 absolute ceiling. Track spend from cached token records and report cumulative spend vs. the limit in every milestone summary.
- Pin all dependency versions in `pyproject.toml` once verified in M0. Do not upgrade packages to "fix" problems without asking.
