export interface ModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

// Anthropic API 目安単価 (USD per 1M tokens)
const MODEL_PRICING_RULES: Array<{ match: RegExp; pricing: ModelPricing }> = [
  {
    match: /haiku/i,
    pricing: { inputPerMillionUsd: 1.0, outputPerMillionUsd: 5.0 },
  },
  {
    match: /sonnet/i,
    pricing: { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 },
  },
  {
    match: /opus|fable|mythos/i,
    pricing: { inputPerMillionUsd: 15.0, outputPerMillionUsd: 75.0 },
  },
];

const DEFAULT_API_PRICING: ModelPricing = {
  inputPerMillionUsd: 3.0,
  outputPerMillionUsd: 15.0,
};

export function getModelPricing(modelId: string): ModelPricing {
  for (const rule of MODEL_PRICING_RULES) {
    if (rule.match.test(modelId)) {
      return rule.pricing;
    }
  }
  return DEFAULT_API_PRICING;
}

export function calculateEstimatedCostUsd(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  connectionType: string;
}): number {
  if (params.connectionType === "claude_cli") {
    return 0;
  }
  const pricing = getModelPricing(params.model);
  const inCost = (params.inputTokens / 1_000_000) * pricing.inputPerMillionUsd;
  const outCost =
    (params.outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return Number((inCost + outCost).toFixed(6));
}
