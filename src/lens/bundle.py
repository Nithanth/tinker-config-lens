"""RunBundle v1 — the interchange format every command reads or writes.

One run over a frozen manifest at one config = one bundle. `sweep` and
`import-evalstore` write them; `compare` and the web app read them.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

SCHEMA_VERSION = "runbundle/v1"


class Decoding(BaseModel):
    temperature: float = 0.0
    seed: int | None = None
    max_tokens: int = 2048
    stop: list[str] = Field(default_factory=list)


class RunConfig(BaseModel):
    model_id: str
    renderer: str
    renderer_version: str
    effort: float | None = None
    prompt_template_id: str | None = None
    decoding: Decoding = Field(default_factory=Decoding)
    benchmark_id: str | None = None
    grader_id: str | None = None
    grader_version: str | None = None


class GraderRecord(BaseModel):
    verdict: float | None = None
    rationale: str | None = None
    version: str | None = None


class Output(BaseModel):
    final_answer: str | None = None
    raw_output: str | None = None
    prompt_tokens: int | None = None
    gen_tokens: int | None = None
    stop_reason: str | None = None
    grader: GraderRecord = Field(default_factory=GraderRecord)
    est_cost_usd: float | None = None
    error: str | None = None
    # top-K (token_id, logprob) pairs per generated position — bulky; stripped
    # by `lens export-web` in favor of the per-token chosen-token trace
    topk_logprobs: list[list[tuple[int, float]]] | None = None
    # logprob of the sampled token at each position (greedy: top-1)
    token_logprobs: list[float] | None = None
    # mean of token_logprobs — per-row confidence scalar
    mean_logprob: float | None = None


class Row(BaseModel):
    row_id: str
    prompt: str
    gold: str | None = None
    source_ids: dict[str, str] = Field(default_factory=dict)
    outputs: list[Output] = Field(default_factory=list)


class RunBundle(BaseModel):
    schema_version: Literal["runbundle/v1"] = SCHEMA_VERSION
    run_id: str
    created_at: str
    config: RunConfig
    manifest_hash: str
    config_hash: str
    provenance: dict[str, str] = Field(default_factory=dict)
    rows: list[Row] = Field(default_factory=list)

    def write(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(self.model_dump_json(indent=2))
        tmp.replace(path)  # atomic

    @classmethod
    def read(cls, path: str | Path) -> "RunBundle":
        return cls.model_validate_json(Path(path).read_text())
