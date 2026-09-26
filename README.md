# Tinker Config Lens

A small, open-source, paired-run comparison and inspection harness for Tinker evals. Point it at two or more eval runs over the same frozen questions and it shows which examples flipped, what broke, and what it cost.

The reference dataset is an Inkling effort sweep (one model, five effort settings, frozen manifest). Effort is one config axis — the harness is axis-agnostic, and native Cookbook EvalStore runs can be imported through `lens import-evalstore`.

## Status

Early development. Instrument verification done (`docs/verification.md`); runner, importer, compare engine, and web app under construction.

## Usage

```
lens verify [--offline]      # instrument check: does effort conditioning work?
lens prefix-gap              # exploratory: score a continuation under counterfactual prefixes
lens sweep <manifest>        # effort sweep over frozen questions → RunBundles
lens import-evalstore <path> # convert a native EvalStore run → RunBundle
lens compare <bundles...>    # paired stats + flip report
```

Everything the CLI writes is a **RunBundle** — a JSON file with run lineage
(model/renderer/grader versions, config + manifest hashes) and per-row outputs
(answers, token counts, stop reasons, grader verdicts, costs). The web app in
`web/` reads bundles only; it never touches the API or secrets.

## Rules (from the spec)

- `TINKER_API_KEY` comes from the environment only. Never print, log, or commit it.
- No bulk sampling before the instrument check passes (`docs/verification.md`) and a dollar forecast is approved. $25 planning stop; $100 absolute ceiling.
- No firstness claims.

## Layout

- `src/lens/` — the `lens` package and CLI
- `docs/` — verification and run notes
- `runs/` — committed RunBundles and compare output
- `web/` — read-only React/Next.js inspector (static export, no backend)
- `.devin/skills/inkling/` — vendored Inkling skill from tinker-cookbook

## License

MIT
