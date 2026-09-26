# Tinker Config Lens

A small, open-source, paired-run comparison and inspection harness for Tinker evals. Point it at two or more eval runs over the same frozen questions and it shows which examples flipped, what broke, and what it cost.

The reference dataset is an Inkling effort sweep (one model, five effort settings, frozen manifest). Effort is one config axis — the harness is axis-agnostic, and native Cookbook EvalStore runs can be imported through `lens import-evalstore`.

## Status

Early development. Instrument verification done (`docs/verification.md`); runner, importer, compare engine, and app under construction.

## Rules (from the spec)

- `TINKER_API_KEY` comes from the environment only. Never print, log, or commit it.
- No bulk sampling before the instrument check passes (`docs/verification.md`) and a dollar forecast is approved. $25 planning stop; $100 absolute ceiling.
- No firstness claims.

## Layout

- `src/lens/` — the `lens` package and CLI (`lens sweep`, `lens import-evalstore`, `lens compare`)
- `docs/` — verification and run notes
- `runs/` — committed RunBundles and compare output
- `app/` — Streamlit read-only screens
- `.devin/skills/inkling/` — vendored Inkling skill from tinker-cookbook

## License

MIT
