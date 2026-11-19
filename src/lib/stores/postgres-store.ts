import { Pool } from "pg";
import {
  ClaudeConnectionRow,
  ConversationRow,
  currentMonthKey,
  MessageRow,
  nowIso,
  ProjectFileRow,
  ProjectRow,
  TeamRow,
  UsageModelBreakdown,
  UsageMonthlyRow,
  UserRow,
} from "../db";
import { calculateEstimatedCostUsd, ModelPricing } from "../pricing";
import { DataStore } from "../store-types";

const globalForPg = globalThis as unknown as {
  __sharedClaudePgPool?: Pool;
  __sharedClaudePgSchemaReady?: Promise<void>;
};

function getPool(): Pool {
  if (globalForPg.__sharedClaudePgPool) {
    return globalForPg.__sharedClaudePgPool;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL が設定されていません。");
  }
  const pool = new Pool({
    connectionString,
    ssl:
      connectionString.includes("sslmode=require") ||
      process.env.PG_SSL === "1"
        ? { rejectUnauthorized: false }
        : undefined,
  });
  globalForPg.__sharedClaudePgPool = pool;
  return pool;
}

async function ensureSchema(pool: Pool): Promise<void> {
  if (!globalForPg.__sharedClaudePgSchemaReady) {
    globalForPg.__sharedClaudePgSchemaReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS system_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          monthly_token_limit BIGINT,
          usage_month TEXT NOT NULL,
          usage_tokens BIGINT NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          team_id TEXT,
          custom_instructions TEXT NOT NULL DEFAULT '',
          default_model TEXT NOT NULL,
          default_connection_id TEXT,
          monthly_token_limit BIGINT,
          usage_month TEXT NOT NULL,
          usage_tokens BIGINT NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS claude_connections (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT 'global',
          team_id TEXT,
          api_key_encrypted TEXT,
          oauth_token_encrypted TEXT,
          base_url TEXT,
          default_model_override TEXT,
          max_tokens INTEGER,
          cli_config_dir TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          system_prompt TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_files (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          content TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT,
          connection_id TEXT,
          title TEXT NOT NULL,
          model TEXT NOT NULL,
          is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          thinking_content TEXT,
          attachments_json TEXT,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          model TEXT,
          connection_type TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usage_monthly (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          team_id TEXT,
          month TEXT NOT NULL,
          input_tokens BIGINT NOT NULL DEFAULT 0,
          output_tokens BIGINT NOT NULL DEFAULT 0,
          total_tokens BIGINT NOT NULL DEFAULT 0,
          cli_tokens BIGINT NOT NULL DEFAULT 0,
          api_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          by_model JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pg_users_team ON users(team_id);
        CREATE INDEX IF NOT EXISTS idx_pg_projects_user ON projects(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pg_project_files_proj ON project_files(project_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_pg_conv_user ON conversations(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pg_msg_conv ON messages(conversation_id, created_at ASC);
        CREATE INDEX IF NOT EXISTS idx_pg_usage_user ON usage_monthly(user_id);
        CREATE INDEX IF NOT EXISTS idx_pg_usage_team ON usage_monthly(team_id);
      `)
      .then(() => undefined);
  }
  await globalForPg.__sharedClaudePgSchemaReady;
}

function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

function toNullableNum(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapTeam(r: Record<string, unknown>): TeamRow {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description ?? ""),
    monthly_token_limit: toNullableNum(r.monthly_token_limit),
    usage_month: String(r.usage_month),
    usage_tokens: toNum(r.usage_tokens),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at),
  };
}

function mapUser(r: Record<string, unknown>): UserRow {
  return {
    id: String(r.id),
    username: String(r.username),
    display_name: String(r.display_name),
    password_hash: String(r.password_hash),
    role: r.role as UserRow["role"],
    team_id: r.team_id ? String(r.team_id) : null,
    custom_instructions: String(r.custom_instructions ?? ""),
    default_model: String(r.default_model),
    default_connection_id: r.default_connection_id
      ? String(r.default_connection_id)
      : null,
    monthly_token_limit: toNullableNum(r.monthly_token_limit),
    usage_month: String(r.usage_month),
    usage_tokens: toNum(r.usage_tokens),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at),
  };
}

function mapConnection(r: Record<string, unknown>): ClaudeConnectionRow {
  return {
    id: String(r.id),
    name: String(r.name),
    type: r.type as ClaudeConnectionRow["type"],
    scope: (r.scope as ClaudeConnectionRow["scope"]) ?? "global",
    team_id: r.team_id ? String(r.team_id) : null,
    api_key_encrypted: r.api_key_encrypted ? String(r.api_key_encrypted) : null,
    oauth_token_encrypted: r.oauth_token_encrypted
      ? String(r.oauth_token_encrypted)
      : null,
    base_url: r.base_url ? String(r.base_url) : null,
    default_model_override: r.default_model_override
      ? String(r.default_model_override)
      : null,
    max_tokens: toNullableNum(r.max_tokens),
    cli_config_dir: r.cli_config_dir ? String(r.cli_config_dir) : null,
    is_active: Boolean(r.is_active),
    is_default: Boolean(r.is_default),
    created_at: String(r.created_at),
  };
}

export class PostgresStore implements DataStore {
  private async db(): Promise<Pool> {
    const pool = getPool();
    await ensureSchema(pool);
    return pool;
  }

  async getAppSecretHex(): Promise<string | null> {
    const pool = await this.db();
    const res = await pool.query(
      "SELECT value FROM system_config WHERE key = 'app_secret_hex'"
    );
    return res.rows[0]?.value ? String(res.rows[0].value) : null;
  }

  async setAppSecretHex(hex: string): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('app_secret_hex', $1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [hex, nowIso()]
    );
  }

  async listTeams(): Promise<TeamRow[]> {
    const pool = await this.db();
    const res = await pool.query("SELECT * FROM teams ORDER BY created_at ASC");
    return res.rows.map(mapTeam);
  }

  async getTeam(id: string): Promise<TeamRow | null> {
    const pool = await this.db();
    const res = await pool.query("SELECT * FROM teams WHERE id = $1", [id]);
    return res.rows[0] ? mapTeam(res.rows[0]) : null;
  }

  async createTeam(team: TeamRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO teams (id, name, description, monthly_token_limit, usage_month, usage_tokens, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        team.id,
        team.name,
        team.description,
        team.monthly_token_limit,
        team.usage_month,
        team.usage_tokens,
        team.is_active,
        team.created_at,
      ]
    );
  }

  async updateTeam(id: string, patch: Partial<TeamRow>): Promise<void> {
    const existing = await this.getTeam(id);
    if (!existing) return;
    const merged = { ...existing, ...patch };
    const pool = await this.db();
    await pool.query(
      `UPDATE teams SET name=$1, description=$2, monthly_token_limit=$3, is_active=$4 WHERE id=$5`,
      [
        merged.name,
        merged.description,
        merged.monthly_token_limit,
        merged.is_active,
        id,
      ]
    );
  }

  async deleteTeam(id: string): Promise<void> {
    const pool = await this.db();
    await pool.query("DELETE FROM teams WHERE id = $1", [id]);
  }

  async hasAnyUsers(): Promise<boolean> {
    const pool = await this.db();
    const res = await pool.query("SELECT 1 FROM users LIMIT 1");
    return res.rows.length > 0;
  }

  async listUsers(teamId?: string): Promise<UserRow[]> {
    const pool = await this.db();
    const res = teamId
      ? await pool.query(
          "SELECT * FROM users WHERE team_id = $1 ORDER BY created_at ASC",
          [teamId]
        )
      : await pool.query("SELECT * FROM users ORDER BY created_at ASC");
    return res.rows.map(mapUser);
  }

  async getUser(id: string): Promise<UserRow | null> {
    const pool = await this.db();
    const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return res.rows[0] ? mapUser(res.rows[0]) : null;
  }

  async getUserByUsername(username: string): Promise<UserRow | null> {
    const pool = await this.db();
    const res = await pool.query(
      "SELECT * FROM users WHERE username = $1 LIMIT 1",
      [username]
    );
    return res.rows[0] ? mapUser(res.rows[0]) : null;
  }

  async createUser(user: UserRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO users (
        id, username, display_name, password_hash, role, team_id,
        custom_instructions, default_model, default_connection_id,
        monthly_token_limit, usage_month, usage_tokens, is_active, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        user.id,
        user.username,
        user.display_name,
        user.password_hash,
        user.role,
        user.team_id,
        user.custom_instructions,
        user.default_model,
        user.default_connection_id,
        user.monthly_token_limit,
        user.usage_month,
        user.usage_tokens,
        user.is_active,
        user.created_at,
      ]
    );
  }

  async updateUser(id: string, patch: Partial<UserRow>): Promise<void> {
    const existing = await this.getUser(id);
    if (!existing) return;
    const m = { ...existing, ...patch };
    const pool = await this.db();
    await pool.query(
      `UPDATE users SET
        username=$1, display_name=$2, password_hash=$3, role=$4, team_id=$5,
        custom_instructions=$6, default_model=$7, default_connection_id=$8,
        monthly_token_limit=$9, is_active=$10
       WHERE id=$11`,
      [
        m.username,
        m.display_name,
        m.password_hash,
        m.role,
        m.team_id,
        m.custom_instructions,
        m.default_model,
        m.default_connection_id,
        m.monthly_token_limit,
        m.is_active,
        id,
      ]
    );
  }

  async deleteUser(id: string): Promise<void> {
    const pool = await this.db();
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
  }

  async listConnections(onlyActive = false): Promise<ClaudeConnectionRow[]> {
    const pool = await this.db();
    const res = onlyActive
      ? await pool.query("SELECT * FROM claude_connections WHERE is_active = TRUE")
      : await pool.query("SELECT * FROM claude_connections");
    return res.rows.map(mapConnection);
  }

  async getConnection(id: string): Promise<ClaudeConnectionRow | null> {
    const pool = await this.db();
    const res = await pool.query(
      "SELECT * FROM claude_connections WHERE id = $1",
      [id]
    );
    return res.rows[0] ? mapConnection(res.rows[0]) : null;
  }

  async createConnection(conn: ClaudeConnectionRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO claude_connections (
        id, name, type, scope, team_id, api_key_encrypted, oauth_token_encrypted,
        base_url, default_model_override, max_tokens, cli_config_dir,
        is_active, is_default, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        conn.id,
        conn.name,
        conn.type,
        conn.scope,
        conn.team_id,
        conn.api_key_encrypted,
        conn.oauth_token_encrypted,
        conn.base_url,
        conn.default_model_override,
        conn.max_tokens,
        conn.cli_config_dir,
        conn.is_active,
        conn.is_default,
        conn.created_at,
      ]
    );
  }

  async updateConnection(
    id: string,
    patch: Partial<ClaudeConnectionRow>
  ): Promise<void> {
    const existing = await this.getConnection(id);
    if (!existing) return;
    const m = { ...existing, ...patch };
    const pool = await this.db();
    await pool.query(
      `UPDATE claude_connections SET
        name=$1, scope=$2, team_id=$3, api_key_encrypted=$4, oauth_token_encrypted=$5,
        base_url=$6, default_model_override=$7, max_tokens=$8, cli_config_dir=$9,
        is_active=$10, is_default=$11
       WHERE id=$12`,
      [
        m.name,
        m.scope,
        m.team_id,
        m.api_key_encrypted,
        m.oauth_token_encrypted,
        m.base_url,
        m.default_model_override,
        m.max_tokens,
        m.cli_config_dir,
        m.is_active,
        m.is_default,
        id,
      ]
    );
  }

  async clearDefaultConnections(): Promise<void> {
    const pool = await this.db();
    await pool.query("UPDATE claude_connections SET is_default = FALSE");
  }

  async deleteConnection(id: string): Promise<void> {
    const pool = await this.db();
    await pool.query("DELETE FROM claude_connections WHERE id = $1", [id]);
  }

  async listProjects(userId: string): Promise<ProjectRow[]> {
    const pool = await this.db();
    const res = await pool.query(
      "SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC",
      [userId]
    );
    return res.rows as ProjectRow[];
  }

  async getProject(id: string): Promise<ProjectRow | null> {
    const pool = await this.db();
    const res = await pool.query("SELECT * FROM projects WHERE id = $1", [id]);
    return (res.rows[0] as ProjectRow | undefined) ?? null;
  }

  async createProject(project: ProjectRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO projects (id, user_id, name, description, system_prompt, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        project.id,
        project.user_id,
        project.name,
        project.description,
        project.system_prompt,
        project.created_at,
        project.updated_at,
      ]
    );
  }

  async updateProject(id: string, patch: Partial<ProjectRow>): Promise<void> {
    const existing = await this.getProject(id);
    if (!existing) return;
    const m = { ...existing, ...patch };
    const pool = await this.db();
    await pool.query(
      `UPDATE projects SET name=$1, description=$2, system_prompt=$3, updated_at=$4 WHERE id=$5`,
      [m.name, m.description, m.system_prompt, m.updated_at, id]
    );
  }

  async deleteProjectAndFiles(id: string, userId: string): Promise<void> {
    const pool = await this.db();
    await pool.query(
      "DELETE FROM project_files WHERE project_id = $1 AND user_id = $2",
      [id, userId]
    );
    await pool.query("DELETE FROM projects WHERE id = $1 AND user_id = $2", [
      id,
      userId,
    ]);
  }

  async listProjectFiles(
    projectId: string,
    userId: string
  ): Promise<ProjectFileRow[]> {
    const pool = await this.db();
    const res = await pool.query(
      "SELECT * FROM project_files WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC",
      [projectId, userId]
    );
    return res.rows as ProjectFileRow[];
  }

  async getProjectFile(id: string): Promise<ProjectFileRow | null> {
    const pool = await this.db();
    const res = await pool.query("SELECT * FROM project_files WHERE id = $1", [
      id,
    ]);
    return (res.rows[0] as ProjectFileRow | undefined) ?? null;
  }

  async createProjectFile(file: ProjectFileRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO project_files (id, project_id, user_id, filename, content, size_bytes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        file.id,
        file.project_id,
        file.user_id,
        file.filename,
        file.content,
        file.size_bytes,
        file.created_at,
      ]
    );
  }

  async deleteProjectFile(id: string): Promise<void> {
    const pool = await this.db();
    await pool.query("DELETE FROM project_files WHERE id = $1", [id]);
  }

  async listConversations(
    userId: string,
    projectId?: string | null
  ): Promise<ConversationRow[]> {
    const pool = await this.db();
    const res = projectId
      ? await pool.query(
          "SELECT * FROM conversations WHERE user_id = $1 AND project_id = $2 ORDER BY updated_at DESC",
          [userId, projectId]
        )
      : await pool.query(
          "SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC",
          [userId]
        );
    return res.rows.map((r) => ({
      ...(r as ConversationRow),
      is_pinned: Boolean(r.is_pinned),
    }));
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    const pool = await this.db();
    const res = await pool.query("SELECT * FROM conversations WHERE id = $1", [
      id,
    ]);
    if (!res.rows[0]) return null;
    return {
      ...(res.rows[0] as ConversationRow),
      is_pinned: Boolean(res.rows[0].is_pinned),
    };
  }

  async createConversation(conv: ConversationRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO conversations (id, user_id, project_id, connection_id, title, model, is_pinned, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        conv.id,
        conv.user_id,
        conv.project_id,
        conv.connection_id,
        conv.title,
        conv.model,
        Boolean(conv.is_pinned),
        conv.created_at,
        conv.updated_at,
      ]
    );
  }

  async updateConversation(
    id: string,
    patch: Partial<ConversationRow>
  ): Promise<void> {
    const existing = await this.getConversation(id);
    if (!existing) return;
    const m = { ...existing, ...patch };
    const pool = await this.db();
    await pool.query(
      `UPDATE conversations SET title=$1, model=$2, project_id=$3, connection_id=$4, is_pinned=$5, updated_at=$6 WHERE id=$7`,
      [
        m.title,
        m.model,
        m.project_id,
        m.connection_id,
        Boolean(m.is_pinned),
        m.updated_at,
        id,
      ]
    );
  }

  async deleteConversationAndMessages(id: string): Promise<void> {
    const pool = await this.db();
    await pool.query("DELETE FROM messages WHERE conversation_id = $1", [id]);
    await pool.query("DELETE FROM conversations WHERE id = $1", [id]);
  }

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    const pool = await this.db();
    const res = await pool.query(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [conversationId]
    );
    return res.rows as MessageRow[];
  }

  async createMessage(msg: MessageRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO messages (
        id, conversation_id, user_id, role, content, thinking_content,
        attachments_json, input_tokens, output_tokens, model, connection_type, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        msg.id,
        msg.conversation_id,
        msg.user_id,
        msg.role,
        msg.content,
        msg.thinking_content ?? null,
        msg.attachments_json,
        msg.input_tokens,
        msg.output_tokens,
        msg.model,
        msg.connection_type,
        msg.created_at,
      ]
    );
  }

  async deleteMessagesFrom(
    conversationId: string,
    fromMessageId: string
  ): Promise<void> {
    const ordered = await this.listMessages(conversationId);
    const idx = ordered.findIndex((m) => m.id === fromMessageId);
    if (idx === -1) return;
    const ids = ordered.slice(idx).map((m) => m.id);
    const pool = await this.db();
    await pool.query("DELETE FROM messages WHERE id = ANY($1::text[])", [ids]);
  }

  async recordTokenUsage(params: {
    userId: string;
    teamId: string | null;
    inputTokens: number;
    outputTokens: number;
    model: string;
    connectionType: string;
    pricingOverride?: ModelPricing;
  }): Promise<void> {
    const totalTokens = params.inputTokens + params.outputTokens;
    if (totalTokens <= 0) return;

    const pool = await this.db();
    const month = currentMonthKey();
    const costUsd = calculateEstimatedCostUsd({
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      connectionType: params.connectionType,
      pricingOverride: params.pricingOverride,
    });

    await pool.query(
      `UPDATE users SET
        usage_tokens = CASE WHEN usage_month = $1 THEN usage_tokens + $2 ELSE $2 END,
        usage_month = $1
       WHERE id = $3`,
      [month, totalTokens, params.userId]
    );

    if (params.teamId) {
      await pool.query(
        `UPDATE teams SET
          usage_tokens = CASE WHEN usage_month = $1 THEN usage_tokens + $2 ELSE $2 END,
          usage_month = $1
         WHERE id = $3`,
        [month, totalTokens, params.teamId]
      );
    }

    const usageId = `${params.userId}_${month}`;
    const safeModelKey = `${params.model}__${params.connectionType}`.replace(
      /[./~$[\]]/g,
      "_"
    );
    const cliDelta = params.connectionType === "claude_cli" ? totalTokens : 0;

    const existingRes = await pool.query(
      "SELECT * FROM usage_monthly WHERE id = $1",
      [usageId]
    );
    if (existingRes.rows.length === 0) {
      const byModel: Record<string, UsageModelBreakdown> = {
        [safeModelKey]: {
          input_tokens: params.inputTokens,
          output_tokens: params.outputTokens,
          cost_usd: costUsd,
          connection_type: params.connectionType,
        },
      };
      await pool.query(
        `INSERT INTO usage_monthly (
          id, user_id, team_id, month, input_tokens, output_tokens,
          total_tokens, cli_tokens, api_cost_usd, by_model, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
        [
          usageId,
          params.userId,
          params.teamId,
          month,
          params.inputTokens,
          params.outputTokens,
          totalTokens,
          cliDelta,
          costUsd,
          JSON.stringify(byModel),
          nowIso(),
        ]
      );
    } else {
      const prevRow = existingRes.rows[0];
      const byModel = (prevRow.by_model ?? {}) as Record<
        string,
        UsageModelBreakdown
      >;
      const prevM = byModel[safeModelKey] ?? {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        connection_type: params.connectionType,
      };
      byModel[safeModelKey] = {
        input_tokens: prevM.input_tokens + params.inputTokens,
        output_tokens: prevM.output_tokens + params.outputTokens,
        cost_usd: Number((prevM.cost_usd + costUsd).toFixed(6)),
        connection_type: params.connectionType,
      };
      await pool.query(
        `UPDATE usage_monthly SET
          team_id = $1,
          input_tokens = input_tokens + $2,
          output_tokens = output_tokens + $3,
          total_tokens = total_tokens + $4,
          cli_tokens = cli_tokens + $5,
          api_cost_usd = api_cost_usd + $6,
          by_model = $7::jsonb,
          updated_at = $8
         WHERE id = $9`,
        [
          params.teamId,
          params.inputTokens,
          params.outputTokens,
          totalTokens,
          cliDelta,
          costUsd,
          JSON.stringify(byModel),
          nowIso(),
          usageId,
        ]
      );
    }
  }

  async listUsageMonthly(filter: {
    userId?: string;
    teamId?: string;
  }): Promise<UsageMonthlyRow[]> {
    const pool = await this.db();
    const res = filter.userId
      ? await pool.query("SELECT * FROM usage_monthly WHERE user_id = $1", [
          filter.userId,
        ])
      : filter.teamId
      ? await pool.query("SELECT * FROM usage_monthly WHERE team_id = $1", [
          filter.teamId,
        ])
      : await pool.query("SELECT * FROM usage_monthly");

    return res.rows.map((r) => ({
      id: String(r.id),
      user_id: String(r.user_id),
      team_id: r.team_id ? String(r.team_id) : null,
      month: String(r.month),
      input_tokens: toNum(r.input_tokens),
      output_tokens: toNum(r.output_tokens),
      total_tokens: toNum(r.total_tokens),
      cli_tokens: toNum(r.cli_tokens),
      api_cost_usd: Number(r.api_cost_usd ?? 0),
      by_model: (r.by_model ?? {}) as Record<string, UsageModelBreakdown>,
      updated_at: String(r.updated_at),
    }));
  }
}
