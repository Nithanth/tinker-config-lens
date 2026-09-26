# Tinker Config Lens

A small, open-source, paired-run comparison and inspection harness for Tinker evals. Point it at two or more eval runs over the same frozen questions and it shows which examples flipped, what broke, and what it cost.

The reference dataset is an Inkling effort sweep (one model, five effort settings, frozen manifest). Effort is one config axis — the harness is axis-agnostic, and native Cookbook EvalStore runs can be imported through `lens import-evalstore`.

See `SPEC.md` for the full build spec and operating rules.

## Status

Skeleton. Built milestone-by-milestone per `SPEC.md` §3 (M0 → M4). Run notes live in `docs/`.

## Rules (from the spec)

- `TINKER_API_KEY` comes from the environment only. Never print, log, or commit it.
- No bulk sampling before the M0 gate passes and a dollar forecast is approved. $25 planning stop; $100 absolute ceiling.
- No firstness claims.

## Layout

- `SPEC.md` — build spec v4.0 (source of truth; kept local, not committed)
- `src/lens/` — the `lens` package and CLI (`lens sweep`, `lens import-evalstore`, `lens compare`)
- `docs/` — milestone notes (M0_NOTES.md, M2_NOTES.md, …)
- `runs/` — committed RunBundles and compare output
- `app/` — Streamlit read-only screens (M3)
- `.devin/skills/inkling/` — vendored Inkling skill from tinker-cookbook

## License

MIT
