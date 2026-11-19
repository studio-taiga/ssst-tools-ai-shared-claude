export type ConnectionType = "anthropic_api" | "claude_cli";
export type ConnectionScope = "global" | "team";
export type UserRole = "system_admin" | "team_admin" | "member";

export interface TeamRow {
  id: string;
  name: string;
  description: string;
  monthly_token_limit: number | null;
  usage_month: string;
  usage_tokens: number;
  is_active: boolean;
  created_at: string;
}

export interface ClaudeConnectionRow {
  id: string;
  name: string;
  type: ConnectionType;
  scope: ConnectionScope;
  team_id: string | null;
  api_key_encrypted: string | null;
  oauth_token_encrypted: string | null;
  base_url: string | null;
  default_model_override: string | null;
  max_tokens: number | null;
  cli_config_dir: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  team_id: string | null;
  custom_instructions: string;
  default_model: string;
  default_connection_id: string | null;
  monthly_token_limit: number | null;
  usage_month: string;
  usage_tokens: number;
  is_active: boolean;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectFileRow {
  id: string;
  project_id: string;
  user_id: string;
  filename: string;
  content: string;
  size_bytes: number;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  project_id: string | null;
  connection_id: string | null;
  title: string;
  model: string;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageAttachment {
  name: string;
  mimeType: string;
  kind: "image" | "text" | "pdf";
  data: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  thinking_content?: string | null;
  attachments_json: string | null;
  input_tokens: number;
  output_tokens: number;
  model: string | null;
  connection_type: string | null;
  created_at: string;
}

export interface UsageModelBreakdown {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  connection_type: string;
}

export interface UsageMonthlyRow {
  id: string; // `${user_id}_${month}`
  user_id: string;
  team_id: string | null;
  month: string; // YYYY-MM
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cli_tokens: number;
  api_cost_usd: number;
  by_model: Record<string, UsageModelBreakdown>;
  updated_at: string;
}

export const COL = {
  TEAMS: "teams",
  USERS: "users",
  CONNECTIONS: "claude_connections",
  PROJECTS: "projects",
  PROJECT_FILES: "project_files",
  CONVERSATIONS: "conversations",
  MESSAGES: "messages",
  USAGE_MONTHLY: "usage_monthly",
} as const;

export function nowIso(): string {
  return new Date().toISOString();
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

export function getEffectiveMonthlyTokens(row: {
  usage_month?: string;
  usage_tokens?: number;
}): number {
  if (row.usage_month === currentMonthKey()) {
    return row.usage_tokens ?? 0;
  }
  return 0;
}
