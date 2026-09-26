"""`lens prefix-gap` — score a sampled continuation under counterfactual effort prefixes.

Sample a short answer at one effort, then use compute_logprobs to score the
SAME token ids under other effort prefixes. Aligned by construction — we score
the literal generated ids, so only the prefix changes. Exploratory: this
measures the prefix effect (which IS the effort mechanism).
"""

from __future__ import annotations

import asyncio

import tinker
from tinker.types import ModelInput, SamplingParams
from tinker_cookbook import model_info
from tinker_cookbook.renderers import get_renderer
from tinker_cookbook.tokenizer_utils import get_tokenizer

MODEL = "thinkingmachines/Inkling-Small"


async def run(args) -> int:
    from lens._env import ensure_api_key

    ensure_api_key()
    tokenizer = get_tokenizer(MODEL)
    renderer = get_renderer(
        model_info.get_recommended_renderer_name(MODEL), tokenizer
    )
    client = tinker.ServiceClient().create_sampling_client(base_model=MODEL)
    msgs = [{"role": "user", "content": args.question}]
    stop = renderer.get_stop_sequences()

    # 1. sample a short continuation at the gen effort
    gen_prefix = renderer.build_generation_prompt(msgs, effort=args.gen_effort).to_ints()
    resp = await client.sample_async(
        ModelInput.from_ints(gen_prefix),
        num_samples=1,
        sampling_params=SamplingParams(
            max_tokens=512, temperature=0.0, stop=stop
        ),
        topk_sample_logprobs=args.topk,
    )
    seq = resp.sequences[0]
    cont_ids = list(seq.tokens)
    print(
        f"sampled {len(cont_ids)} tokens, stop_reason={seq.stop_reason}"
        + (f", topk={args.topk} captured" if args.topk else "")
    )
    print(f"text tail: {tokenizer.decode(cont_ids)[-120:]!r}")

    # 2. score the same ids under each effort prefix
    score_efforts = [float(e) for e in args.score_efforts.split(",")]
    sums = {}
    for e in score_efforts:
        prefix = renderer.build_generation_prompt(msgs, effort=e).to_ints()
        lps = await client.compute_logprobs_async(
            ModelInput.from_ints(prefix + cont_ids)
        )
        # lps[i] = log P(token i | tokens < i); continuation span starts at len(prefix)
        span = [x for x in lps[len(prefix):] if x is not None]
        sums[e] = {
            "n_scored": len(span),
            "sum_nats": sum(span),
            "mean_per_token": sum(span) / max(len(span), 1),
        }
        print(f"effort={e}: {sums[e]}")

    if len(score_efforts) == 2:
        a, b = score_efforts
        gap = sums[b]["sum_nats"] - sums[a]["sum_nats"]
        print(
            f"\nlog P(tokens | effort {b}) - log P(tokens | effort {a}) = {gap:.2f} nats"
        )
        ok = abs(gap) > 1.0
        print("prefix effect confirmed" if ok else "WARN: gap ~0, prefix may not matter")
        return 0 if ok else 1
    return 0


def main(args) -> int:
    return asyncio.run(run(args))
