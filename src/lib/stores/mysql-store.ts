import mysql from "mysql2/promise";
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

const globalForMysql = globalThis as unknown as {
  __sharedClaudeMysqlPool?: mysql.Pool;
  __sharedClaudeMysqlSchemaReady?: Promise<void>;
};

function getMysqlPool(): mysql.Pool {
  if (globalForMysql.__sharedClaudeMysqlPool) {
    return globalForMysql.__sharedClaudeMysqlPool;
  }
  const uri = process.env.MYSQL_URL;
  if (!uri) {
    throw new Error("MYSQL_URL が設定されていません。");
  }
  const pool = mysql.createPool(uri);
  globalForMysql.__sharedClaudeMysqlPool = pool;
  return pool;
}

async function ensureMysqlSchema(pool: mysql.Pool): Promise<void> {
  if (!globalForMysql.__sharedClaudeMysqlSchemaReady) {
    globalForMysql.__sharedClaudeMysqlSchemaReady = (async () => {
      const statements = [
        `CREATE TABLE IF NOT EXISTS system_config (
          config_key VARCHAR(128) PRIMARY KEY,
          config_value TEXT NOT NULL,
          updated_at VARCHAR(64) NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS teams (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          monthly_token_limit BIGINT NULL,
          usage_month VARCHAR(16) NOT NULL,
          usage_tokens BIGINT NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at VARCHAR(64) NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(64) NOT NULL UNIQUE,
          display_name VARCHAR(255) NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(32) NOT NULL,
          team_id VARCHAR(64) NULL,
          custom_instructions MEDIUMTEXT NOT NULL,
          default_model VARCHAR(255) NOT NULL,
          default_connection_id VARCHAR(64) NULL,
          monthly_token_limit BIGINT NULL,
          usage_month VARCHAR(16) NOT NULL,
          usage_tokens BIGINT NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_my_users_team (team_id)
        )`,
        `CREATE TABLE IF NOT EXISTS claude_connections (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(32) NOT NULL,
          scope VARCHAR(32) NOT NULL DEFAULT 'global',
          team_id VARCHAR(64) NULL,
          api_key_encrypted TEXT NULL,
          oauth_token_encrypted TEXT NULL,
          base_url TEXT NULL,
          default_model_override VARCHAR(255) NULL,
          max_tokens INT NULL,
          cli_config_dir TEXT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          created_at VARCHAR(64) NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS projects (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          system_prompt MEDIUMTEXT NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64) NOT NULL,
          INDEX idx_my_projects_user (user_id, updated_at)
        )`,
        `CREATE TABLE IF NOT EXISTS project_files (
          id VARCHAR(64) PRIMARY KEY,
          project_id VARCHAR(64) NOT NULL,
          user_id VARCHAR(64) NOT NULL,
          filename VARCHAR(255) NOT NULL,
          content LONGTEXT NOT NULL,
          size_bytes INT NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_my_pf_proj (project_id, user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS conversations (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          project_id VARCHAR(64) NULL,
          connection_id VARCHAR(64) NULL,
          title VARCHAR(255) NOT NULL,
          model VARCHAR(255) NOT NULL,
          is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64) NOT NULL,
          INDEX idx_my_conv_user (user_id, updated_at)
        )`,
        `CREATE TABLE IF NOT EXISTS messages (
          id VARCHAR(64) PRIMARY KEY,
          conversation_id VARCHAR(64) NOT NULL,
          user_id VARCHAR(64) NOT NULL,
          role VARCHAR(32) NOT NULL,
          content LONGTEXT NOT NULL,
          thinking_content LONGTEXT NULL,
          attachments_json LONGTEXT NULL,
          input_tokens INT NOT NULL DEFAULT 0,
          output_tokens INT NOT NULL DEFAULT 0,
          model VARCHAR(255) NULL,
          connection_type VARCHAR(32) NULL,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_my_msg_conv (conversation_id, created_at)
        )`,
        `CREATE TABLE IF NOT EXISTS usage_monthly (
          id VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          team_id VARCHAR(64) NULL,
          month VARCHAR(16) NOT NULL,
          input_tokens BIGINT NOT NULL DEFAULT 0,
          output_tokens BIGINT NOT NULL DEFAULT 0,
          total_tokens BIGINT NOT NULL DEFAULT 0,
          cli_tokens BIGINT NOT NULL DEFAULT 0,
          api_cost_usd DOUBLE NOT NULL DEFAULT 0,
          by_model_json LONGTEXT NOT NULL,
          updated_at VARCHAR(64) NOT NULL,
          INDEX idx_my_usage_user (user_id),
          INDEX idx_my_usage_team (team_id)
        )`,
      ];
      for (const sql of statements) {
        await pool.query(sql);
      }
    })();
  }
  await globalForMysql.__sharedClaudeMysqlSchemaReady;
}

type RawRow = Record<string, unknown>;

function mapTeam(r: RawRow): TeamRow {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description ?? ""),
    monthly_token_limit:
      r.monthly_token_limit === null || r.monthly_token_limit === undefined
        ? null
        : Number(r.monthly_token_limit),
    usage_month: String(r.usage_month),
    usage_tokens: Number(r.usage_tokens ?? 0),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at),
  };
}

function mapUser(r: RawRow): UserRow {
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
    monthly_token_limit:
      r.monthly_token_limit === null || r.monthly_token_limit === undefined
        ? null
        : Number(r.monthly_token_limit),
    usage_month: String(r.usage_month),
    usage_tokens: Number(r.usage_tokens ?? 0),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at),
  };
}

function mapConnection(r: RawRow): ClaudeConnectionRow {
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
    max_tokens:
      r.max_tokens === null || r.max_tokens === undefined
        ? null
        : Number(r.max_tokens),
    cli_config_dir: r.cli_config_dir ? String(r.cli_config_dir) : null,
    is_active: Boolean(r.is_active),
    is_default: Boolean(r.is_default),
    created_at: String(r.created_at),
  };
}

export class MysqlStore implements DataStore {
  private async db(): Promise<mysql.Pool> {
    const pool = getMysqlPool();
    await ensureMysqlSchema(pool);
    return pool;
  }

  async getAppSecretHex(): Promise<string | null> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT config_value FROM system_config WHERE config_key = 'app_secret_hex'"
    );
    return rows[0]?.config_value ? String(rows[0].config_value) : null;
  }

  async setAppSecretHex(hex: string): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO system_config (config_key, config_value, updated_at)
       VALUES ('app_secret_hex', ?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = VALUES(updated_at)`,
      [hex, nowIso()]
    );
  }

  async listTeams(): Promise<TeamRow[]> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM teams ORDER BY created_at ASC"
    );
    return rows.map(mapTeam);
  }

  async getTeam(id: string): Promise<TeamRow | null> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM teams WHERE id = ?",
      [id]
    );
    return rows[0] ? mapTeam(rows[0]) : null;
  }

  async createTeam(team: TeamRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO teams (id, name, description, monthly_token_limit, usage_month, usage_tokens, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
    const m = { ...existing, ...patch };
    const pool = await this.db();
    await pool.query(
      "UPDATE teams SET name=?, description=?, monthly_token_limit=?, is_active=? WHERE id=?",
      [m.name, m.description, m.monthly_token_limit, m.is_active, id]
    );
  }

  async deleteTeam(id: string): Promise<void> {
    const pool = await this.db();
    await pool.query("DELETE FROM teams WHERE id = ?", [id]);
  }

  async hasAnyUsers(): Promise<boolean> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT 1 FROM users LIMIT 1"
    );
    return rows.length > 0;
  }

  async listUsers(teamId?: string): Promise<UserRow[]> {
    const pool = await this.db();
    const [rows] = teamId
      ? await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM users WHERE team_id = ? ORDER BY created_at ASC",
          [teamId]
        )
      : await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM users ORDER BY created_at ASC"
        );
    return rows.map(mapUser);
  }

  async getUser(id: string): Promise<UserRow | null> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM users WHERE id = ?",
      [id]
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async getUserByUsername(username: string): Promise<UserRow | null> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async createUser(user: UserRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO users (
        id, username, display_name, password_hash, role, team_id,
        custom_instructions, default_model, default_connection_id,
        monthly_token_limit, usage_month, usage_tokens, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        username=?, display_name=?, password_hash=?, role=?, team_id=?,
        custom_instructions=?, default_model=?, default_connection_id=?,
        monthly_token_limit=?, is_active=?
       WHERE id=?`,
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
    await pool.query("DELETE FROM users WHERE id = ?", [id]);
  }

  async listConnections(onlyActive = false): Promise<ClaudeConnectionRow[]> {
    const pool = await this.db();
    const [rows] = onlyActive
      ? await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM claude_connections WHERE is_active = TRUE"
        )
      : await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM claude_connections"
        );
    return rows.map(mapConnection);
  }

  async getConnection(id: string): Promise<ClaudeConnectionRow | null> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM claude_connections WHERE id = ?",
      [id]
    );
    return rows[0] ? mapConnection(rows[0]) : null;
  }

  async createConnection(conn: ClaudeConnectionRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO claude_connections (
        id, name, type, scope, team_id, api_key_encrypted, oauth_token_encrypted,
        base_url, default_model_override, max_tokens, cli_config_dir,
        is_active, is_default, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        name=?, scope=?, team_id=?, api_key_encrypted=?, oauth_token_encrypted=?,
        base_url=?, default_model_override=?, max_tokens=?, cli_config_dir=?,
        is_active=?, is_default=?
       WHERE id=?`,
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
    await pool.query("DELETE FROM claude_connections WHERE id = ?", [id]);
  }

  async listProjects(userId: string): Promise<ProjectRow[]> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC",
      [userId]
    );
    return rows as unknown as ProjectRow[];
  }

  async getProject(id: string): Promise<ProjectRow | null> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM projects WHERE id = ?",
      [id]
    );
    return (rows[0] as unknown as ProjectRow | undefined) ?? null;
  }

  async createProject(project: ProjectRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO projects (id, user_id, name, description, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
      "UPDATE projects SET name=?, description=?, system_prompt=?, updated_at=? WHERE id=?",
      [m.name, m.description, m.system_prompt, m.updated_at, id]
    );
  }

  async deleteProjectAndFiles(id: string, userId: string): Promise<void> {
    const pool = await this.db();
    await pool.query(
      "DELETE FROM project_files WHERE project_id = ? AND user_id = ?",
      [id, userId]
    );
    await pool.query("DELETE FROM projects WHERE id = ? AND user_id = ?", [
      id,
      userId,
    ]);
  }

  async listProjectFiles(
    projectId: string,
    userId: string
  ): Promise<ProjectFileRow[]> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM project_files WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC",
      [projectId, userId]
    );
    return rows as unknown as ProjectFileRow[];
  }

  async getProjectFile(id: string): Promise<ProjectFileRow | null> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM project_files WHERE id = ?",
      [id]
    );
    return (rows[0] as unknown as ProjectFileRow | undefined) ?? null;
  }

  async createProjectFile(file: ProjectFileRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO project_files (id, project_id, user_id, filename, content, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
    await pool.query("DELETE FROM project_files WHERE id = ?", [id]);
  }

  async listConversations(
    userId: string,
    projectId?: string | null
  ): Promise<ConversationRow[]> {
    const pool = await this.db();
    const [rows] = projectId
      ? await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM conversations WHERE user_id = ? AND project_id = ? ORDER BY updated_at DESC",
          [userId, projectId]
        )
      : await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
          [userId]
        );
    return rows.map((r) => ({
      ...(r as unknown as ConversationRow),
      is_pinned: Boolean(r.is_pinned),
    }));
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM conversations WHERE id = ?",
      [id]
    );
    if (!rows[0]) return null;
    return {
      ...(rows[0] as unknown as ConversationRow),
      is_pinned: Boolean(rows[0].is_pinned),
    };
  }

  async createConversation(conv: ConversationRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO conversations (id, user_id, project_id, connection_id, title, model, is_pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      "UPDATE conversations SET title=?, model=?, project_id=?, connection_id=?, is_pinned=?, updated_at=? WHERE id=?",
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
    await pool.query("DELETE FROM messages WHERE conversation_id = ?", [id]);
    await pool.query("DELETE FROM conversations WHERE id = ?", [id]);
  }

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    const pool = await this.db();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversationId]
    );
    return rows as unknown as MessageRow[];
  }

  async createMessage(msg: MessageRow): Promise<void> {
    const pool = await this.db();
    await pool.query(
      `INSERT INTO messages (
        id, conversation_id, user_id, role, content, thinking_content,
        attachments_json, input_tokens, output_tokens, model, connection_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    const pool = await this.db();
    for (const m of ordered.slice(idx)) {
      await pool.query("DELETE FROM messages WHERE id = ?", [m.id]);
    }
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
        usage_tokens = IF(usage_month = ?, usage_tokens + ?, ?),
        usage_month = ?
       WHERE id = ?`,
      [month, totalTokens, totalTokens, month, params.userId]
    );

    if (params.teamId) {
      await pool.query(
        `UPDATE teams SET
          usage_tokens = IF(usage_month = ?, usage_tokens + ?, ?),
          usage_month = ?
         WHERE id = ?`,
        [month, totalTokens, totalTokens, month, params.teamId]
      );
    }

    const usageId = `${params.userId}_${month}`;
    const safeModelKey = `${params.model}__${params.connectionType}`.replace(
      /[./~$[\]]/g,
      "_"
    );
    const cliDelta = params.connectionType === "claude_cli" ? totalTokens : 0;

    const [existingRows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM usage_monthly WHERE id = ?",
      [usageId]
    );
    if (existingRows.length === 0) {
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
          total_tokens, cli_tokens, api_cost_usd, by_model_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      const byModel = JSON.parse(
        String(existingRows[0].by_model_json ?? "{}")
      ) as Record<string, UsageModelBreakdown>;
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
          team_id = ?,
          input_tokens = input_tokens + ?,
          output_tokens = output_tokens + ?,
          total_tokens = total_tokens + ?,
          cli_tokens = cli_tokens + ?,
          api_cost_usd = api_cost_usd + ?,
          by_model_json = ?,
          updated_at = ?
         WHERE id = ?`,
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
    const [rows] = filter.userId
      ? await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM usage_monthly WHERE user_id = ?",
          [filter.userId]
        )
      : filter.teamId
      ? await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM usage_monthly WHERE team_id = ?",
          [filter.teamId]
        )
      : await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM usage_monthly"
        );

    return rows.map((r) => ({
      id: String(r.id),
      user_id: String(r.user_id),
      team_id: r.team_id ? String(r.team_id) : null,
      month: String(r.month),
      input_tokens: Number(r.input_tokens ?? 0),
      output_tokens: Number(r.output_tokens ?? 0),
      total_tokens: Number(r.total_tokens ?? 0),
      cli_tokens: Number(r.cli_tokens ?? 0),
      api_cost_usd: Number(r.api_cost_usd ?? 0),
      by_model: JSON.parse(
        String(r.by_model_json ?? "{}")
      ) as Record<string, UsageModelBreakdown>,
      updated_at: String(r.updated_at),
    }));
  }
}
