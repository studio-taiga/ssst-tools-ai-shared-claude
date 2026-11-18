import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "./firebase";
import { calculateEstimatedCostUsd } from "./pricing";

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

export async function recordTokenUsage(params: {
  userId: string;
  teamId: string | null;
  inputTokens: number;
  outputTokens: number;
  model: string;
  connectionType: string;
}): Promise<void> {
  const totalTokens = params.inputTokens + params.outputTokens;
  if (totalTokens <= 0) return;

  const db = getFirestoreDb();
  const month = currentMonthKey();
  const costUsd = calculateEstimatedCostUsd({
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    connectionType: params.connectionType,
  });

  const userRef = db.collection(COL.USERS).doc(params.userId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const data = snap.data() as UserRow;
    if (data.usage_month === month) {
      tx.update(userRef, {
        usage_tokens: FieldValue.increment(totalTokens),
      });
    } else {
      tx.update(userRef, {
        usage_month: month,
        usage_tokens: totalTokens,
      });
    }
  });

  if (params.teamId) {
    const teamRef = db.collection(COL.TEAMS).doc(params.teamId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(teamRef);
      if (!snap.exists) return;
      const data = snap.data() as TeamRow;
      if (data.usage_month === month) {
        tx.update(teamRef, {
          usage_tokens: FieldValue.increment(totalTokens),
        });
      } else {
        tx.update(teamRef, {
          usage_month: month,
          usage_tokens: totalTokens,
        });
      }
    });
  }

  // 月別・モデル別の詳細利用履歴を更新
  const usageId = `${params.userId}_${month}`;
  const usageRef = db.collection(COL.USAGE_MONTHLY).doc(usageId);
  const safeModelKey = `${params.model}__${params.connectionType}`.replace(
    /[./~$[\]]/g,
    "_"
  );
  const cliDelta = params.connectionType === "claude_cli" ? totalTokens : 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    if (!snap.exists) {
      const doc: UsageMonthlyRow = {
        id: usageId,
        user_id: params.userId,
        team_id: params.teamId,
        month,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        total_tokens: totalTokens,
        cli_tokens: cliDelta,
        api_cost_usd: costUsd,
        by_model: {
          [safeModelKey]: {
            input_tokens: params.inputTokens,
            output_tokens: params.outputTokens,
            cost_usd: costUsd,
            connection_type: params.connectionType,
          },
        },
        updated_at: nowIso(),
      };
      tx.set(usageRef, doc);
    } else {
      const existing = snap.data() as UsageMonthlyRow;
      const prevModel = existing.by_model?.[safeModelKey] ?? {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        connection_type: params.connectionType,
      };
      tx.update(usageRef, {
        team_id: params.teamId,
        input_tokens: FieldValue.increment(params.inputTokens),
        output_tokens: FieldValue.increment(params.outputTokens),
        total_tokens: FieldValue.increment(totalTokens),
        cli_tokens: FieldValue.increment(cliDelta),
        api_cost_usd: Number(((existing.api_cost_usd ?? 0) + costUsd).toFixed(6)),
        [`by_model.${safeModelKey}`]: {
          input_tokens: prevModel.input_tokens + params.inputTokens,
          output_tokens: prevModel.output_tokens + params.outputTokens,
          cost_usd: Number((prevModel.cost_usd + costUsd).toFixed(6)),
          connection_type: params.connectionType,
        },
        updated_at: nowIso(),
      });
    }
  });
}
