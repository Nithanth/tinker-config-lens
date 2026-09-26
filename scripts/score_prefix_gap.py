"""Smoke test: does compute_logprobs let us score a fixed continuation under
counterfactual effort prefixes?

This is the primitive behind the (optional, exploratory) prefix-gap probe:
for an example that flips between effort levels, score the *same* generated
token ids under each effort prefix and report the logprob gap in nats.

Costs: 1 tiny sample + 2 prefills. Well under $0.01.
"""

import asyncio
import os

import tinker
from tinker_cookbook.renderers import Message, get_text_content
from tinker_cookbook.renderers.tml_v0 import TmlV0Renderer
from tinker_cookbook.tokenizer_utils import get_tokenizer

MODEL = "thinkingmachines/Inkling-Small"
QUESTION = "What is 47 * 6? Show your work, then give the final number."


async def main():
    assert os.environ.get("TINKER_API_KEY"), "TINKER_API_KEY missing"
    tokenizer = get_tokenizer(MODEL)
    renderer = TmlV0Renderer(tokenizer)
    client = tinker.ServiceClient().create_sampling_client(base_model=MODEL)

    messages = [Message(role="user", content=QUESTION)]

    # 1) Generate a short continuation at effort 0.9 (the "producing" prefix).
    prompt_09 = renderer.build_generation_prompt(messages, effort=0.9)
    resp = await client.sample_async(
        prompt=prompt_09,
        num_samples=1,
        sampling_params=tinker.SamplingParams(
            max_tokens=512, temperature=0.0, stop=renderer.get_stop_sequences()
        ),
    )
    gen_tokens = list(resp.sequences[0].tokens)
    message, term = renderer.parse_response(gen_tokens)
    print(f"sampled {len(gen_tokens)} tokens, termination={term}")
    print("text tail:", get_text_content(message)[-120:].replace("\n", " "))

    # 2) Score the SAME token ids under each effort prefix.
    #    Sequence = [rendered prompt tokens] + [generated tokens]; the
    #    continuation's logprobs are the positions after the prompt span.
    results = {}
    for effort in (0.0, 0.9):
        prompt = renderer.build_generation_prompt(messages, effort=effort)
        full = tinker.ModelInput.from_ints(prompt.to_ints() + gen_tokens)
        lps = await client.compute_logprobs_async(full)
        cont = [lp for lp in lps[len(prompt.to_ints()):] if lp is not None]
        results[effort] = {
            "n_scored": len(cont),
            "sum_nats": sum(cont),
            "mean_per_token": sum(cont) / len(cont) if cont else None,
        }
        print(f"effort={effort}: {results[effort]}")

    gap = results[0.9]["sum_nats"] - results[0.0]["sum_nats"]
    print(f"\nlog P(tokens | effort 0.9) - log P(tokens | effort 0.0) = {gap:.2f} nats")
    print("=> prefix effect is real if |gap| is clearly nonzero and numbers are finite")


if __name__ == "__main__":
    asyncio.run(main())
