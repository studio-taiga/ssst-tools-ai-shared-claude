import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "./firebase";

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

export const COL = {
  TEAMS: "teams",
  USERS: "users",
  CONNECTIONS: "claude_connections",
  PROJECTS: "projects",
  PROJECT_FILES: "project_files",
  CONVERSATIONS: "conversations",
  MESSAGES: "messages",
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
  tokens: number;
}): Promise<void> {
  if (params.tokens <= 0) return;
  const db = getFirestoreDb();
  const month = currentMonthKey();

  const userRef = db.collection(COL.USERS).doc(params.userId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const data = snap.data() as UserRow;
    if (data.usage_month === month) {
      tx.update(userRef, {
        usage_tokens: FieldValue.increment(params.tokens),
      });
    } else {
      tx.update(userRef, {
        usage_month: month,
        usage_tokens: params.tokens,
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
          usage_tokens: FieldValue.increment(params.tokens),
        });
      } else {
        tx.update(teamRef, {
          usage_month: month,
          usage_tokens: params.tokens,
        });
      }
    });
  }
}
