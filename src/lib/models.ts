export interface ClaudeModelOption {
  id: string;
  label: string;
  description: string;
  cliAlias: string;
}

export const CLAUDE_MODELS: ClaudeModelOption[] = [
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    description: "速度と知性のバランスに優れた標準モデル",
    cliAlias: "sonnet",
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    description: "高度な推論・コーディング・長文タスク向け",
    cliAlias: "opus",
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    description: "高速・低コストな軽量モデル",
    cliAlias: "haiku",
  },
  {
    id: "claude-fable-5-2",
    label: "Claude Fable 5.2",
    description: "最高峰の長期的推論・エージェント向けモデル",
    cliAlias: "claude-fable-5-2",
  },
];

export function resolveCliModel(modelId: string): string {
  const found = CLAUDE_MODELS.find((m) => m.id === modelId);
  return found ? found.cliAlias : modelId;
}

export interface ResponseStyleOption {
  id: string;
  label: string;
  instruction: string;
}

export const RESPONSE_STYLES: ResponseStyleOption[] = [
  {
    id: "normal",
    label: "標準",
    instruction: "",
  },
  {
    id: "concise",
    label: "簡潔",
    instruction: "結論を先に述べ、要点を箇条書きなどで簡潔・短めに回答してください。",
  },
  {
    id: "explanatory",
    label: "解説調",
    instruction: "初学者にも分かりやすいように、背景・具体例・ステップを交えて丁寧に解説してください。",
  },
  {
    id: "formal",
    label: "フォーマル",
    instruction: "ビジネス文書や学術用途に適した、論理的で丁寧な敬体・フォーマルな文体で回答してください。",
  },
  {
    id: "code",
    label: "コード重視",
    instruction: "余計な前置きを省き、実用的なコード例と技術的ポイントを中心に回答してください。",
  },
];
