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

## The plateau is task-dependent: AIME 2026 (uncontaminated)

The easy-math plateau is a property of the task, not the knob. On
**AIME 2026** (30 problems, MathArena source — postdates plausible Inkling
training cutoffs, unlike aime_2025 which TML reports on), `max_tokens=32768`:

| effort | accuracy | ~gen tok | hit 32k cap | **real wrong** |
|--------|----------|----------|-------------|----------------|
| 0.0    | 46.7%    | 3,662    | 0           | **16**         |
| 0.2    | 66.7%    | 5,472    | 2           | **8**          |
| 0.7    | **90.0%**| 6,214    | 0           | **3**          |
| 0.9    | **90.0%**| 13,877   | 1           | **2**          |
| 0.99   | 76.7%    | 21,246   | 6           | **1**          |

Two clean facts:

1. **Effort scaling is real on hard problems.** 0.0→0.7 gains +43pts
   (paired Δ CI95 [-0.60,-0.27]); genuine wrong-answer count is *monotonically
   decreasing*: 16 → 8 → 3 → 2 → 1. Effort works exactly as designed.
2. **Observed accuracy is still non-monotonic** (0.99: 76.7% < 0.7/0.9: 90%)
   entirely because 6/7 of its failures hit even a 32k budget — at maximum
   effort, Inkling-Small's deliberation can exceed a 32k generation budget on
   ~20% of AIME problems. The runaway tail is real.

So the general claim: effort saturates early on easy tasks, scales on hard
tasks, and everywhere it multiplies token cost — so realized score is
`reasoning_gain − truncation_loss`, and high effort silently degrades unless
`max_tokens` is scaled with it.

## Replication: n=600 easy mix + full Inkling on AIME

After reviewer feedback, two upgrades ran (both in `runs_mix600/` and
`runs_inkling_aime/`):

**Bigger easy set** — gsm8k:500 + math500:100, 32k budget, Inkling-Small:

| effort | acc (n=600) | ~gen tok | failures |
|--------|-------------|----------|----------|
| 0.0    | 95.2%       | 143      | 29 wrong |
| 0.2    | 97.0%       | 177      | 18 wrong |
| 0.7    | **97.3%**   | 317      | 16 wrong |
| 0.9    | 96.8%       | 674      | 19 wrong |
| 0.99   | 96.8%       | 1,263    | 18 wrong, 1 trunc |

0.0→0.2 is a real +1.8pts (paired CI95 [0.002, 0.037]); 0.2→0.99 is flat
(−0.002, CI95 [−0.015, 0.013]). Tight n kills the anecdote objection.
Past 0.2 you're paying ~7× more tokens for nothing on this task mix.

**Full Inkling on AIME 2026** (second-model replicate):

| effort | acc | ~gen tok | trunc | **real wrong** |
|--------|-----|----------|-------|----------------|
| 0.0    | 50.0% | 6,418  | 0     | **15**         |
| 0.2    | 80.0% | 3,508  | 0     | **6**          |
| 0.7    | 93.3% | 5,034  | 0     | **2**          |
| 0.9    | 86.7% | 11,842 | 3     | **1**          |
| 0.99   | 86.7% | 17,351 | 4     | **0**          |

The big model replicates the pattern harder: genuine errors fall monotonically
to **zero at 0.99** — it is never wrong, only out of budget. (Curious sub-note:
Inkling at 0.0 burns *more* tokens than at 0.2 — verbose flailing, not brevity.)

## Caveats

- n=150 rows, one sample per cell, temperature 0 — flips are exact, but
  accuracy CIs are ±~4–5pts; the 0.2-vs-0.99 *genuine-accuracy* comparison is
  flat, while the *realized-accuracy* gap is driven by the budget interaction.
- "Prefix effect" — effort works by injecting a `Thinking effort level`
  system message. Findings describe the mechanism as deployed, not isolated
  effort; see `lens prefix-gap` for the exploratory logprob probe.
- Two benchmark families, one model, one decoding config — don't generalize beyond.
- AIME n=30: directionally informative, wide CIs on small differences.
- AIME 2026 is the decontamination bet — uncontaminated *to our knowledge*;
  we can't audit Inkling's training data directly.

Spend to date: ~$11.9 total (diagnostics + math_mix 150 + 32k re-check +
Small-AIME + mix600 ~$2.36 + Inkling-AIME ~$6.21).
