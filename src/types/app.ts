export type ConnectionType = "anthropic_api" | "claude_cli";
export type ConnectionScope = "global" | "team";
export type UserRole = "system_admin" | "team_admin" | "member";

export interface TeamItem {
  id: string;
  name: string;
  description: string;
  monthlyTokenLimit: number | null;
  monthlyTokens: number;
  memberCount?: number;
  isActive: boolean;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  teamId: string | null;
  teamName: string | null;
  customInstructions: string;
  defaultModel: string;
  defaultConnectionId: string | null;
  monthlyTokenLimit: number | null;
  monthlyTokens: number;
  isActive: boolean;
  createdAt: string;
}

export interface PublicConnection {
  id: string;
  name: string;
  type: ConnectionType;
  scope: ConnectionScope;
  teamId: string | null;
  hasCustomApiKey: boolean;
  hasOauthToken: boolean;
  baseUrl: string | null;
  defaultModelOverride: string | null;
  maxTokens: number | null;
  cliConfigDir: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface ProjectItem {
  id: string;
  user_id: string;
  name: string;
  description: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectFileItem {
  id: string;
  project_id: string;
  user_id: string;
  filename: string;
  content: string;
  size_bytes: number;
  created_at: string;
}

export interface ConversationItem {
  id: string;
  user_id: string;
  project_id: string | null;
  project_name?: string | null;
  connection_id: string | null;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface MessageAttachment {
  name: string;
  mimeType: string;
  kind: "image" | "text" | "pdf";
  data: string;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  user_id?: string;
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
