import Anthropic from "@anthropic-ai/sdk";

export interface ModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  isExact?: boolean;
}

export interface ConnectionModelInfo {
  id: string;
  displayName: string;
  pricing?: ModelPricing;
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
  if (/:free$/i.test(modelId) || /^openrouter\/free$/i.test(modelId)) {
    return { inputPerMillionUsd: 0, outputPerMillionUsd: 0, isExact: true };
  }
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
  pricingOverride?: ModelPricing;
}): number {
  if (
    params.connectionType === "claude_cli" ||
    /:free$/i.test(params.model) ||
    /^openrouter\/free$/i.test(params.model)
  ) {
    return 0;
  }
  const pricing = params.pricingOverride ?? getModelPricing(params.model);
  const inCost = (params.inputTokens / 1_000_000) * pricing.inputPerMillionUsd;
  const outCost =
    (params.outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return Number((inCost + outCost).toFixed(6));
}

interface RawModelEntry {
  id: string;
  display_name?: string;
  name?: string;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
}

const modelCache = new Map<
  string,
  { expiresAt: number; models: ConnectionModelInfo[] }
>();

export async function fetchConnectionModels(params: {
  connectionId: string;
  apiKey: string;
  baseUrl?: string | null;
}): Promise<ConnectionModelInfo[]> {
  const cacheKey = `${params.connectionId}:${params.baseUrl || ""}`;
  const cached = modelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.models;
  }

  const baseUrl = params.baseUrl?.trim();
  const collected: ConnectionModelInfo[] = [];
  const seen = new Set<string>();

  if (baseUrl) {
    const normalized = baseUrl.replace(/\/+$/, "");
    const baseEndpoint = normalized.endsWith("/v1")
      ? `${normalized}/models`
      : `${normalized}/v1/models`;

    let afterId: string | null = null;
    for (let page = 0; page < 10; page++) {
      const url = afterId
        ? `${baseEndpoint}?limit=1000&after_id=${encodeURIComponent(afterId)}`
        : baseEndpoint;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "x-api-key": params.apiKey,
        },
      });

      if (!res.ok) break;
      const json = (await res.json()) as {
        data?: RawModelEntry[];
        has_more?: boolean;
        last_id?: string;
      };

      if (Array.isArray(json.data)) {
        for (const m of json.data) {
          if (!m?.id || seen.has(m.id)) continue;
          seen.add(m.id);

          let pricing: ModelPricing | undefined;
          if (
            m.pricing &&
            m.pricing.prompt !== undefined &&
            m.pricing.completion !== undefined
          ) {
            const p = Number(m.pricing.prompt);
            const c = Number(m.pricing.completion);
            if (!Number.isNaN(p) && !Number.isNaN(c) && p >= 0 && c >= 0) {
              pricing = {
                inputPerMillionUsd: Number((p * 1_000_000).toFixed(4)),
                outputPerMillionUsd: Number((c * 1_000_000).toFixed(4)),
                isExact: true,
              };
            }
          }

          collected.push({
            id: m.id,
            displayName: m.display_name || m.name || m.id,
            pricing: pricing ?? getModelPricing(m.id),
          });
        }
      }

      if (json.has_more && json.last_id) {
        afterId = json.last_id;
      } else {
        break;
      }
    }
  }

  if (collected.length === 0) {
    const client = new Anthropic({
      apiKey: params.apiKey,
      baseURL: baseUrl || undefined,
    });
    for await (const m of client.models.list({ limit: 100 })) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      collected.push({
        id: m.id,
        displayName: m.display_name || m.id,
        pricing: getModelPricing(m.id),
      });
    }
  }

  collected.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "en", {
      sensitivity: "base",
      numeric: true,
    })
  );

  modelCache.set(cacheKey, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    models: collected,
  });

  return collected;
}
