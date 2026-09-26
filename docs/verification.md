# Instrument verification

Date: 2026-09-25 · Verdict: **PASSED** — effort conditioning works on this account, EvalStore import is feasible.

Raw diagnostic output: `runs/effort_diagnostics.json` · Script: `scripts/verify_effort.py`

## (a) Does effort conditioning work on this account? — YES

- `TmlV0Renderer(get_tokenizer("thinkingmachines/Inkling-Small"))` +
  `build_generation_prompt(messages, effort=e)` works for e ∈ {0.0, 0.9, 0.99}.
- The renderer inserts a `<|message_system|>Thinking effort level: <e>` message
  before the first non-system message (verified by decoding rendered tokens
  offline — no API call needed). Prompt length shifts 13→15 tokens between
  effort 0.0 and 0.99.
- 11 diagnostic calls (3 prompts × 3 efforts + 2 repeats), `temperature=0.0`,
  `max_tokens=2048`, `stop=renderer.get_stop_sequences()`:
  - **Every call parsed** via `renderer.parse_response()` — zero exceptions.
  - **Every termination was `stop_sequence`** — clean stops, zero MALFORMED,
    zero truncation at 2048.
  - **temperature=0.0 accepted** by `SamplingParams`.
  - **Repeat cells were identical** — math@0.9 produced exactly 740 gen tokens
    and the same text both times; yesno@0.0 produced 31 tokens, same text.
    Deterministic at temp=0 under this account/build.
- **Token counts move with effort** (gen tokens):

| prompt  | 0.0 | 0.9 | 0.99 |
|---------|-----|-----|------|
| math    | 144 | 740 | 449  |
| yesno   |  31 | 151 | 157  |
| choice  |   5 | 166 | 975  |

- **Caveat worth remembering:** effort is NOT monotonically longer output —
  math@0.99 (449) < math@0.9 (740). Effort conditions behavior, not just
  length. Do not present effort curves as pure length dials.
- Answers were correct on the trivial diagnostics (9716, yes, 3). One
  hallucination-adjacent detail seen: yesno@0.0 claimed 104,729 is "the
  10,000th prime" — a reason to keep failure-first inspection honest.

## (b) EvalStore→RunBundle import — FEASIBLE

`tinker-cookbook==0.5.7`, `tinker_cookbook.stores.eval_store.EvalStore`:

- Runs are `RunMetadata {run_id, model_name, checkpoint_path, benchmarks,
  timestamp, config(dict), scores}` + per-benchmark `BenchmarkResult`
  (score, num_examples/correct/errors/truncated, metrics, pass_at_k) +
  per-example `StoredTrajectory` JSONL.
- `StoredTrajectory` fields: `idx`, `benchmark`, **`example_id`** (stable —
  e.g. `make_example_id("gsm8k", question)` hashes the row content),
  `turns[{role, content, token_count, metadata}]` including grader turns,
  `reward`, `metrics` (incl. `max_tokens_reached`, `context_overflow`),
  `logs` (expected/extracted answers etc.), `error`, `time_seconds`.
- Mapping to RunBundle v1 rows: `example_id`→`row_id`, user turn→`prompt`,
  `logs["expected"]`→`gold`, assistant turn content→`raw_output`/`final_answer`,
  `reward`→`grader.verdict`, `logs`→`grader.rationale`, `token_count`→tokens,
  `metrics`/`error`→`stop_reason`/`error`. Feasible with **annotated**
  provenance for derived fields (cost post-computed from tokens×pricing;
  effort for native runs is whatever the run's config recorded — see below).
- **Important finding:** `BenchmarkConfig` fields are
  `max_examples, concurrency, agent_concurrency, timeout_seconds,
  max_trajectory_tokens, max_generation_tokens, max_tokens, temperature,
  context_window, save_dir, num_samples, judge_*, sandbox_factory,
  system_prompt, grade_fn` — **there is no effort knob**. The rollout path
  calls `build_generation_prompt(messages)` bare → effort is always the
  renderer default (0.9). Native `run_benchmark` therefore CANNOT drive the
  effort sweep; `lens sweep` must render prompts itself (like the cookbook's
  own `sample_reasoning.py`) and write RunBundles directly. Importer remains
  for other people's native runs.
- Benchmarks present in this pinned release: `aime, ceval, gpqa, gsm8k,
  ifbench, ifeval, math500, mbpp, mmlu_pro, mmlu_redux, supergpqa` (+ sandboxed:
  swe_bench, terminal_bench, livecodebench, tau2_bench, arena_hard, hmmt,
  longbench). For the sweep pick cookbook-native, non-sandboxed, non-judge:
  **gsm8k** (math, deterministic grading) + **mmlu_pro or math500** (contrast).

## (c) Pinned versions that work together

- python 3.12.8 (uv venv `.venv`)
- tinker 0.30.3 · tinker-cookbook 0.5.7 · tml-renderers 0.1.0 · torch 2.14.0
- streamlit 1.64.0 · pytest 9.1.1 · ruff 0.16.9

## (d) Prefix-gap primitive — VERIFIED (exploratory probe)

`SamplingClient.compute_logprobs(ModelInput)` returns per-token logprobs for an
arbitrary token sequence, so scoring one run's exact generated ids under a
different effort prefix is aligned by construction — no fuzzy matching needed.

Smoke test (`scripts/score_prefix_gap.py`): sampled 195 tokens on the math
prompt at effort 0.9, then scored the same token ids under both prefixes:

- log P(tokens | effort 0.0 prefix) = **-36.3 nats** (mean -0.186/token)
- log P(tokens | effort 0.9 prefix) = **-13.4 nats** (mean -0.069/token)
- Gap = **+23.0 nats** in favor of the generating prefix — the instruction
  prefix alone shifts sequence probability by ~10 orders of magnitude.

Also available on `sample()`: `topk_sample_logprobs` (top-K logprobs per
generated position — captured per row in the sweep at near-zero cost) and
`target_prompt_logprobs` (score chosen token ids at chosen prompt positions).
Caveat for the writeup: the prefix changes the instruction text, so this
measures "prefix effect" — which IS the effort mechanism — not pure effort
isolation.

## Spend so far

~400 prompt + ~3,000 gen tokens + ~800 prefill-scoring tokens on Inkling-Small ≈ **< $0.02** so far.
Baseline screenshot taken separately by owner.

## Blockers

None. Account auth works after billing top-up; both `Inkling` and
`Inkling-Small` (and `:peft:` variants) listed among 31 server models.
