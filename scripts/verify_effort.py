"""Effort-conditioning verification probe for Inkling models.

Diagnostic calls only — not a sweep. ~11 sampling calls, max_tokens=2048 each.
Verifies:
  - effort prefix is accepted and visible in the rendered prompt
  - temperature=0.0 accepted
  - parse_response works and stop reasons/terminations are visible
  - prompt/gen token counts move with effort
  - repeat cells for determinism checks
"""

import asyncio
import json
import os

import tinker
from tinker_cookbook.renderers import Message, get_text_content
from tinker_cookbook.renderers.tml_v0 import TmlV0Renderer
from tinker_cookbook.tokenizer_utils import get_tokenizer

MODEL = "thinkingmachines/Inkling-Small"
EFFORTS = [0.0, 0.9, 0.99]
MAX_TOKENS = 2048
TEMPERATURE = 0.0

PROMPTS = {
    "math": "What is 347 * 28? Show your work and give the final number.",
    "yesno": "Is 104729 prime? Answer yes or no, then justify in one sentence.",
    "choice": (
        "A drawer has 4 red socks and 4 blue socks. You pull two at random "
        "in the dark. What's the minimum number you must pull to guarantee a "
        "matching pair? Answer with a single number."
    ),
}

# (prompt_id, effort, label). Extra repeat cells check determinism.
CELLS = [(pid, e) for pid in PROMPTS for e in EFFORTS] + [
    ("math", 0.9, "repeat"),
    ("yesno", 0.0, "repeat"),
]


async def run_cell(client, renderer, prompt_id, effort, label):
    messages = [Message(role="user", content=PROMPTS[prompt_id])]
    prompt = renderer.build_generation_prompt(messages, effort=effort)
    n_prompt_tokens = prompt.length
    response = await client.sample_async(
        prompt=prompt,
        num_samples=1,
        sampling_params=tinker.SamplingParams(
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
            stop=renderer.get_stop_sequences(),
        ),
    )
    seq = response.sequences[0]
    message, termination = renderer.parse_response(seq.tokens)
    text = get_text_content(message)
    return {
        "prompt_id": prompt_id,
        "effort": effort,
        "label": label or "base",
        "prompt_tokens": n_prompt_tokens,
        "gen_tokens": len(seq.tokens),
        "termination": str(termination),
        "answer_tail": text[-300:],
        "n_prompt_tokens_rendered": prompt.length,
    }


async def main():
    assert os.environ.get("TINKER_API_KEY"), "TINKER_API_KEY missing"
    tokenizer = get_tokenizer(MODEL)
    renderer = TmlV0Renderer(tokenizer)

    # Offline check: does effort change the rendered prefix? (free, no API call)
    msgs = [Message(role="user", content="hi")]
    p00 = renderer.build_generation_prompt(msgs, effort=0.0)
    p99 = renderer.build_generation_prompt(msgs, effort=0.99)
    print("prompt len effort0.0:", p00.length, "| effort0.99:", p99.length)
    # Decode a slice where the effort system message should live
    print("effort0.0  prefix:", tokenizer.decode(p00.to_ints()[:60])[:200].replace("\n", " "))
    print("effort0.99 prefix:", tokenizer.decode(p99.to_ints()[:60])[:200].replace("\n", " "))

    client = tinker.ServiceClient().create_sampling_client(base_model=MODEL)
    results = []
    for pid, effort, *rest in CELLS:
        label = rest[0] if rest else "base"
        r = await run_cell(client, renderer, pid, effort, label)
        results.append(r)
        print(json.dumps({k: v for k, v in r.items() if k != "answer_tail"}))
        print("  tail:", r["answer_tail"][-120:].replace("\n", " "))

    with open("runs/effort_diagnostics.json", "w") as f:
        json.dump(results, f, indent=2)
    print("wrote runs/effort_diagnostics.json")


if __name__ == "__main__":
    asyncio.run(main())
