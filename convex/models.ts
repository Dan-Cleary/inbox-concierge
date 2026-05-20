// Single source of truth for which models can be benchmarked / used in
// production. Cost numbers are USD per 1M tokens (input / output) and are
// approximate as of the build date — used only for relative comparison
// in the eval UI, not billing.

export type ModelProvider = "openai" | "anthropic";

export type ModelConfig = {
  id: string;
  label: string;
  provider: ModelProvider;
  // Provider-side model identifier (passed to ai-sdk).
  apiModel: string;
  inputUsdPerM: number;
  outputUsdPerM: number;
};

export const MODELS: ReadonlyArray<ModelConfig> = [
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    apiModel: "claude-sonnet-4-6",
    inputUsdPerM: 3,
    outputUsdPerM: 15,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    apiModel: "claude-haiku-4-5",
    inputUsdPerM: 1,
    outputUsdPerM: 5,
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    apiModel: "gpt-4o",
    inputUsdPerM: 2.5,
    outputUsdPerM: 10,
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    provider: "openai",
    apiModel: "gpt-4o-mini",
    inputUsdPerM: 0.15,
    outputUsdPerM: 0.6,
  },
];

export function getModel(id: string): ModelConfig {
  const m = MODELS.find((m) => m.id === id);
  if (!m) throw new Error(`Unknown model id: ${id}`);
  return m;
}
