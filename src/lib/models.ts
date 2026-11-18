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
