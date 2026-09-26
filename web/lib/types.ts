// Mirrors src/lens/bundle.py — RunBundle v1. Keep the two in sync.

export interface RunConfig {
  model_id: string;
  renderer: string;
  renderer_version: string;
  effort: number | null;
  prompt_template_id: string | null;
  decoding: { temperature: number; seed: number | null; max_tokens: number; stop: string[] };
  benchmark_id: string | null;
  grader_id: string | null;
  grader_version: string | null;
}

export interface GraderRecord {
  verdict: number | null;
  rationale: string | null;
  version: string | null;
}

export interface Output {
  final_answer: string | null;
  raw_output: string | null;
  prompt_tokens: number | null;
  gen_tokens: number | null;
  stop_reason: string | null;
  grader: GraderRecord;
  est_cost_usd: number | null;
  error: string | null;
  topk_logprobs: [number, number][][] | null;
  mean_logprob: number | null;
}

export interface Row {
  row_id: string;
  prompt: string;
  gold: string | null;
  source_ids: Record<string, string>;
  outputs: Output[];
}

export interface RunBundle {
  schema_version: "runbundle/v1";
  run_id: string;
  created_at: string;
  config: RunConfig;
  manifest_hash: string;
  config_hash: string;
  provenance: Record<string, string>;
  rows: Row[];
}

export const runKey = (b: RunBundle) =>
  `${b.config.model_id.split("/").pop()}@e${b.config.effort ?? "∅"}`;
