"""`lens verify` — cheap instrument check before any bulk sampling.

Does the effort dial reach the model, does sampling parse cleanly, and is it
deterministic? ~11 API calls, < $0.02. Gate before any sweep.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import tinker
from tinker.types import ModelInput, SamplingParams
from tinker_cookbook import model_info
from tinker_cookbook.renderers import get_renderer, get_text_content
from tinker_cookbook.renderers.base import ParseTermination
from tinker_cookbook.tokenizer_utils import get_tokenizer

MODEL = "thinkingmachines/Inkling-Small"

PROMPTS = {
    "math": [{"role": "user", "content": "Compute 47*6. Show your work briefly."}],
    "yesno": [
        {
            "role": "user",
            "content": "Is 104729 prime? Answer yes or no, then justify in one sentence.",
        }
    ],
    "choice": [
        {
            "role": "user",
            "content": "A drawer has 3 red, 4 blue, 5 green socks. Minimum draws to guarantee a matching pair? Answer with just the number.",
        }
    ],
}

# (prompt, effort) cells; trailing entries repeat earlier cells to check determinism
CELLS = [(p, e) for p in PROMPTS for e in [0.0, 0.9, 0.99]] + [
    ("math", 0.9),
    ("yesno", 0.0),
]


async def run(args) -> int:
    from lens._env import ensure_api_key

    tokenizer = get_tokenizer(MODEL)
    renderer = get_renderer(model_info.get_recommended_renderer_name(MODEL), tokenizer)

    print("=== prefix check (offline, free) ===")
    msgs = [{"role": "user", "content": "hi"}]
    for e in [0.0, 0.9, 0.99]:
        toks = renderer.build_generation_prompt(msgs, effort=e).to_ints()
        dec = tokenizer.decode(toks)
        print(f"effort={e}: {dec[:70].replace(chr(10), ' ')}")
        assert "Thinking effort" in dec, f"no effort prefix at {e}"

    if args.offline:
        print("offline mode — prefix check passed, skipping sampling")
        return 0

    ensure_api_key()
    client = tinker.ServiceClient().create_sampling_client(base_model=MODEL)

    print("\n=== sampling ===")
    results: dict[str, dict] = {}
    for i, (pname, effort) in enumerate(CELLS):
        prompt_toks = renderer.build_generation_prompt(
            PROMPTS[pname], effort=effort
        ).to_ints()
        resp = await client.sample_async(
            ModelInput.from_ints(prompt_toks),
            num_samples=1,
            sampling_params=SamplingParams(
                max_tokens=2048,
                temperature=0.0,
                stop=renderer.get_stop_sequences(),
            ),
        )
        seq = resp.sequences[0]
        msg, term = renderer.parse_response(seq.tokens)
        text = get_text_content(msg)
        key = f"{pname}@{effort}" + (f"#{i}" if f"{pname}@{effort}" in results else "")
        results[key] = {
            "text": text,
            "prompt_tokens": len(prompt_toks),
            "gen_tokens": len(seq.tokens),
            "stop_reason": seq.stop_reason,
            "parse_termination": term.value,
        }
        print(
            f"{key:>18}: {len(seq.tokens):>4} gen tokens, {seq.stop_reason}/{term.value}, "
            f"text[:40]={text[:40]!r}"
        )

    Path(args.out).parent.mkdir(exist_ok=True)
    Path(args.out).write_text(json.dumps(results, indent=2))

    print("\n=== checks ===")
    stops_ok = all(
        r["parse_termination"] == ParseTermination.STOP_SEQUENCE.value
        for r in results.values()
    )
    det_ok = (
        results["math@0.9"]["text"] == results["math@0.9#9"]["text"]
        and results["yesno@0.0"]["text"] == results["yesno@0.0#10"]["text"]
    )
    tok_varies = len(
        {results[f"math@{e}"]["gen_tokens"] for e in [0.0, 0.9, 0.99]}
    ) > 1
    print(f"all cells parse cleanly: {stops_ok}")
    print(f"repeated cells deterministic: {det_ok}")
    print(f"effort moves behavior (math token counts differ): {tok_varies}")
    print(f"wrote {args.out}")
    return 0 if (stops_ok and det_ok and tok_varies) else 1


def main(args) -> int:
    return asyncio.run(run(args))
