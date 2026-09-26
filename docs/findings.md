# Findings — Inkling-Small effort sweep

150-row manifest (75 gsm8k + 75 math500, seed 42, hash `1025f928`), 5 efforts
{0.0, 0.2, 0.7, 0.9, 0.99}, temperature 0, one sample per cell, 750 cells,
~$0.70 total on Inkling-Small (50%-discount pricing).

## Headline: accuracy plateaus at effort 0.2; extra effort buys length, not accuracy

| effort | accuracy (8k budget) | ~gen tok | real wrong answers |
|--------|---------------------|----------|--------------------|
| 0.0    | 87.3%               | 167      | **19**             |
| 0.2    | **96.7%**           | 249      | 5                  |
| 0.7    | **96.7%**           | 475      | 5                  |
| 0.9    | 94.7%               | 1,078    | 5                  |
| 0.99   | 91.3%               | 1,426    | 5                  |

At first glance the curve is non-monotonic — 0.99 looks *worse* than 0.2.
Decomposing the wrong answers shows why that's misleading:

## The 0.9/0.99 dip is a budget artifact, not worse reasoning

- All 11 apparent "extra" failures at 0.9/0.99 were `stop_reason=length`:
  the model spent the whole 8192-token budget on verification loops and never
  emitted a final answer (then the grader found no `\boxed{}`).
- Re-running just those 10 rows at `max_tokens=32768`: **19/20 cells now
  terminate and are correct** (10/10 at 0.9, 9/10 at 0.99). One math500 row
  still overflowed even 32k — a runaway tail exists.
- Genuine wrong-answer count is flat at 5 across all efforts ≥ 0.2.

Corrected picture: real accuracy is ~96–97% plateau from effort 0.2 up.
The differences that remain are *operational*, not epistemic:

- 0.0→0.2 is the only effort step that fixes real reasoning errors (19→5).
- Above 0.2, effort scales token cost ~6× (249→1,426 mean gen tokens) with no
  accuracy gain on this task mix.
- **effort and max_tokens interact**: raise effort without raising the budget
  and you lose points to truncation, not to reasoning.

## Cost-quality frontier on this mix

effort 0.2 is the efficient frontier point: 96.7% accuracy at $0.061/run —
matching 0.7's accuracy at half its cost, and beating 0.99's realized accuracy
at ~1/5 its cost *and* none of its truncation risk at sane budgets.

## Caveats

- n=150 rows, one sample per cell, temperature 0 — flips are exact, but
  accuracy CIs are ±~4–5pts; the 0.2-vs-0.99 *genuine-accuracy* comparison is
  flat, while the *realized-accuracy* gap is driven by the budget interaction.
- "Prefix effect" — effort works by injecting a `Thinking effort level`
  system message. Findings describe the mechanism as deployed, not isolated
  effort; see `lens prefix-gap` for the exploratory logprob probe.
- Two benchmarks, one model, one decoding config — don't generalize beyond.

Spend to date: ~$1.05 total (diagnostics + sweep + 32k re-check + probes).
