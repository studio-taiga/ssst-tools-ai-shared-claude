import fs from "node:fs";
import path from "node:path";
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

interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

const globalForSqlite = globalThis as unknown as {
  __sharedClaudeNodeSqlite?: SqliteDatabase;
};

async function getSqliteDb(): Promise<SqliteDatabase> {
  if (globalForSqlite.__sharedClaudeNodeSqlite) {
    return globalForSqlite.__sharedClaudeNodeSqlite;
  }

  const sqliteMod = (await import("node:sqlite")) as unknown as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath =
    process.env.SQLITE_PATH || path.join(dataDir, "shared-claude.sqlite");
  const db = new sqliteMod.DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      monthly_token_limit INTEGER,
      usage_month TEXT NOT NULL,
      usage_tokens INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
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
      monthly_token_limit INTEGER,
      usage_month TEXT NOT NULL,
      usage_tokens INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
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
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
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
      is_pinned INTEGER NOT NULL DEFAULT 0,
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
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cli_tokens INTEGER NOT NULL DEFAULT 0,
      api_cost_usd REAL NOT NULL DEFAULT 0,
      by_model_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sq_users_team ON users(team_id);
    CREATE INDEX IF NOT EXISTS idx_sq_projects_user ON projects(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sq_pf_proj ON project_files(project_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_sq_conv_user ON conversations(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sq_msg_conv ON messages(conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_sq_usage_user ON usage_monthly(user_id);
    CREATE INDEX IF NOT EXISTS idx_sq_usage_team ON usage_monthly(team_id);
  `);

  globalForSqlite.__sharedClaudeNodeSqlite = db;
  return db;
}

function mapTeam(r: Record<string, unknown>): TeamRow {
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
    is_active: Number(r.is_active) === 1,
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
    monthly_token_limit:
      r.monthly_token_limit === null || r.monthly_token_limit === undefined
        ? null
        : Number(r.monthly_token_limit),
    usage_month: String(r.usage_month),
    usage_tokens: Number(r.usage_tokens ?? 0),
    is_active: Number(r.is_active) === 1,
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
    max_tokens:
      r.max_tokens === null || r.max_tokens === undefined
        ? null
        : Number(r.max_tokens),
    cli_config_dir: r.cli_config_dir ? String(r.cli_config_dir) : null,
    is_active: Number(r.is_active) === 1,
    is_default: Number(r.is_default) === 1,
    created_at: String(r.created_at),
  };
}

function mapConversation(r: Record<string, unknown>): ConversationRow {
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    project_id: r.project_id ? String(r.project_id) : null,
    connection_id: r.connection_id ? String(r.connection_id) : null,
    title: String(r.title),
    model: String(r.model),
    is_pinned: Number(r.is_pinned) === 1,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export class SqliteStore implements DataStore {
  async getAppSecretHex(): Promise<string | null> {
    const db = await getSqliteDb();
    const row = db
      .prepare("SELECT value FROM system_config WHERE key = 'app_secret_hex'")
      .get();
    return row?.value ? String(row.value) : null;
  }

  async setAppSecretHex(hex: string): Promise<void> {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('app_secret_hex', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(hex, nowIso());
  }

  async listTeams(): Promise<TeamRow[]> {
    const db = await getSqliteDb();
    return db
      .prepare("SELECT * FROM teams ORDER BY created_at ASC")
      .all()
      .map(mapTeam);
  }

  async getTeam(id: string): Promise<TeamRow | null> {
    const db = await getSqliteDb();
    const row = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
    return row ? mapTeam(row) : null;
  }

  async createTeam(team: TeamRow): Promise<void> {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO teams (id, name, description, monthly_token_limit, usage_month, usage_tokens, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      team.id,
      team.name,
      team.description,
      team.monthly_token_limit,
      team.usage_month,
      team.usage_tokens,
      team.is_active ? 1 : 0,
      team.created_at
    );
  }

  async updateTeam(id: string, patch: Partial<TeamRow>): Promise<void> {
    const existing = await this.getTeam(id);
    if (!existing) return;
    const m = { ...existing, ...patch };
    const db = await getSqliteDb();
    db.prepare(
      `UPDATE teams SET name=?, description=?, monthly_token_limit=?, is_active=? WHERE id=?`
    ).run(m.name, m.description, m.monthly_token_limit, m.is_active ? 1 : 0, id);
  }

  async deleteTeam(id: string): Promise<void> {
    const db = await getSqliteDb();
    db.prepare("DELETE FROM teams WHERE id = ?").run(id);
  }

  async hasAnyUsers(): Promise<boolean> {
    const db = await getSqliteDb();
    const row = db.prepare("SELECT 1 as ok FROM users LIMIT 1").get();
    return Boolean(row);
  }

  async listUsers(teamId?: string): Promise<UserRow[]> {
    const db = await getSqliteDb();
    const rows = teamId
      ? db
          .prepare("SELECT * FROM users WHERE team_id = ? ORDER BY created_at ASC")
          .all(teamId)
      : db.prepare("SELECT * FROM users ORDER BY created_at ASC").all();
    return rows.map(mapUser);
  }

  async getUser(id: string): Promise<UserRow | null> {
    const db = await getSqliteDb();
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return row ? mapUser(row) : null;
  }

  async getUserByUsername(username: string): Promise<UserRow | null> {
    const db = await getSqliteDb();
    const row = db
      .prepare("SELECT * FROM users WHERE username = ? LIMIT 1")
      .get(username);
    return row ? mapUser(row) : null;
  }

  async createUser(user: UserRow): Promise<void> {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO users (
        id, username, display_name, password_hash, role, team_id,
        custom_instructions, default_model, default_connection_id,
        monthly_token_limit, usage_month, usage_tokens, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
      user.is_active ? 1 : 0,
      user.created_at
    );
  }

  async updateUser(id: string, patch: Partial<UserRow>): Promise<void> {
    const existing = await this.getUser(id);
    if (!existing) return;
    const m = { ...existing, ...patch };
    const db = await getSqliteDb();
    db.prepare(
      `UPDATE users SET
        username=?, display_name=?, password_hash=?, role=?, team_id=?,
        custom_instructions=?, default_model=?, default_connection_id=?,
        monthly_token_limit=?, is_active=?
       WHERE id=?`
    ).run(
      m.username,
      m.display_name,
      m.password_hash,
      m.role,
      m.team_id,
      m.custom_instructions,
      m.default_model,
      m.default_connection_id,
      m.monthly_token_limit,
      m.is_active ? 1 : 0,
      id
    );
  }

  async deleteUser(id: string): Promise<void> {
    const db = await getSqliteDb();
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }

  async listConnections(onlyActive = false): Promise<ClaudeConnectionRow[]> {
    const db = await getSqliteDb();
    const rows = onlyActive
      ? db.prepare("SELECT * FROM claude_connections WHERE is_active = 1").all()
      : db.prepare("SELECT * FROM claude_connections").all();
    return rows.map(mapConnection);
  }

  async getConnection(id: string): Promise<ClaudeConnectionRow | null> {
    const db = await getSqliteDb();
    const row = db
      .prepare("SELECT * FROM claude_connections WHERE id = ?")
      .get(id);
    return row ? mapConnection(row) : null;
  }

  async createConnection(conn: ClaudeConnectionRow): Promise<void> {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO claude_connections (
        id, name, type, scope, team_id, api_key_encrypted, oauth_token_encrypted,
        base_url, default_model_override, max_tokens, cli_config_dir,
        is_active, is_default, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
      conn.is_active ? 1 : 0,
      conn.is_default ? 1 : 0,
      conn.created_at
    );
  }

  async updateConnection(
    id: string,
    patch: Partial<ClaudeConnectionRow>
  ): Promise<void> {
    const existing = await this.getConnection(id);
    if (!existing) return;
    const m = { ...existing, ...patch };
    const db = await getSqliteDb();
    db.prepare(
      `UPDATE claude_connections SET
        name=?, scope=?, team_id=?, api_key_encrypted=?, oauth_token_encrypted=?,
        base_url=?, default_model_override=?, max_tokens=?, cli_config_dir=?,
        is_active=?, is_default=?
       WHERE id=?`
    ).run(
      m.name,
      m.scope,
      m.team_id,
      m.api_key_encrypted,
      m.oauth_token_encrypted,
      m.base_url,
      m.default_model_override,
      m.max_tokens,
      m.cli_config_dir,
      m.is_active ? 1 : 0,
      m.is_default ? 1 : 0,
      id
    );
  }

  async clearDefaultConnections(): Promise<void> {
    const db = await getSqliteDb();
    db.prepare("UPDATE claude_connections SET is_default = 0").run();
  }

  async deleteConnection(id: string): Promise<void> {
    const db = await getSqliteDb();
    db.prepare("DELETE FROM claude_connections WHERE id = ?").run(id);
  }

  async listProjects(userId: string): Promise<ProjectRow[]> {
    const db = await getSqliteDb();
    return db
      .prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC")
      .all(userId) as unknown as ProjectRow[];
  }

  async getProject(id: string): Promise<ProjectRow | null> {
    const db = await getSqliteDb();
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return (row as unknown as ProjectRow | undefined) ?? null;
  }

  async createProject(project: ProjectRow): Promise<void> {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO projects (id, user_id, name, description, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      project.id,
      project.user_id,
      project.name,
      project.description,
      project.system_prompt,
      project.created_at,
      project.updated_at
    );
  }

  async updateProject(id: string, patch: Partial<ProjectRow>): Promise<void> {
    const existing = await this.getProject(id);
    if (!existing) return;
    const m = { ...existing, ...patch };
    const db = await getSqliteDb();
    db.prepare(
      `UPDATE projects SET name=?, description=?, system_prompt=?, updated_at=? WHERE id=?`
    ).run(m.name, m.description, m.system_prompt, m.updated_at, id);
  }

  async deleteProjectAndFiles(id: string, userId: string): Promise<void> {
    const db = await getSqliteDb();
    db.prepare(
      "DELETE FROM project_files WHERE project_id = ? AND user_id = ?"
    ).run(id, userId);
    db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(
      id,
      userId
    );
  }

  async listProjectFiles(
    projectId: string,
    userId: string
  ): Promise<ProjectFileRow[]> {
    const db = await getSqliteDb();
    return db
      .prepare(
        "SELECT * FROM project_files WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC"
      )
      .all(projectId, userId) as unknown as ProjectFileRow[];
  }

  async getProjectFile(id: string): Promise<ProjectFileRow | null> {
    const db = await getSqliteDb();
    const row = db
      .prepare("SELECT * FROM project_files WHERE id = ?")
      .get(id);
    return (row as unknown as ProjectFileRow | undefined) ?? null;
  }

  async createProjectFile(file: ProjectFileRow): Promise<void> {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO project_files (id, project_id, user_id, filename, content, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      file.id,
      file.project_id,
      file.user_id,
      file.filename,
      file.content,
      file.size_bytes,
      file.created_at
    );
  }

  async deleteProjectFile(id: string): Promise<void> {
    const db = await getSqliteDb();
    db.prepare("DELETE FROM project_files WHERE id = ?").run(id);
  }

  async listConversations(
    userId: string,
    projectId?: string | null
  ): Promise<ConversationRow[]> {
    const db = await getSqliteDb();
    const rows = projectId
      ? db
          .prepare(
            "SELECT * FROM conversations WHERE user_id = ? AND project_id = ? ORDER BY updated_at DESC"
          )
          .all(userId, projectId)
      : db
          .prepare(
            "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
          )
          .all(userId);
    return rows.map(mapConversation);
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    const db = await getSqliteDb();
    const row = db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(id);
    return row ? mapConversation(row) : null;
  }

  async createConversation(conv: ConversationRow): Promise<void> {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO conversations (id, user_id, project_id, connection_id, title, model, is_pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      conv.id,
      conv.user_id,
      conv.project_id,
      conv.connection_id,
      conv.title,
      conv.model,
      conv.is_pinned ? 1 : 0,
      conv.created_at,
      conv.updated_at
    );
  }

  async updateConversation(
    id: string,
    patch: Partial<ConversationRow>
  ): Promise<void> {
    const existing = await this.getConversation(id);
    if (!existing) return;
    const m = { ...existing, ...patch };
    const db = await getSqliteDb();
    db.prepare(
      `UPDATE conversations SET title=?, model=?, project_id=?, connection_id=?, is_pinned=?, updated_at=? WHERE id=?`
    ).run(
      m.title,
      m.model,
      m.project_id,
      m.connection_id,
      m.is_pinned ? 1 : 0,
      m.updated_at,
      id
    );
  }

  async deleteConversationAndMessages(id: string): Promise<void> {
    const db = await getSqliteDb();
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
    db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  }

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    const db = await getSqliteDb();
    return db
      .prepare(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all(conversationId) as unknown as MessageRow[];
  }

  async createMessage(msg: MessageRow): Promise<void> {
    const db = await getSqliteDb();
    db.prepare(
      `INSERT INTO messages (
        id, conversation_id, user_id, role, content, thinking_content,
        attachments_json, input_tokens, output_tokens, model, connection_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
      msg.created_at
    );
  }

  async deleteMessagesFrom(
    conversationId: string,
    fromMessageId: string
  ): Promise<void> {
    const ordered = await this.listMessages(conversationId);
    const idx = ordered.findIndex((m) => m.id === fromMessageId);
    if (idx === -1) return;
    const db = await getSqliteDb();
    const stmt = db.prepare("DELETE FROM messages WHERE id = ?");
    for (const m of ordered.slice(idx)) {
      stmt.run(m.id);
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

    const db = await getSqliteDb();
    const month = currentMonthKey();
    const costUsd = calculateEstimatedCostUsd({
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      connectionType: params.connectionType,
      pricingOverride: params.pricingOverride,
    });

    db.prepare(
      `UPDATE users SET
        usage_tokens = CASE WHEN usage_month = ? THEN usage_tokens + ? ELSE ? END,
        usage_month = ?
       WHERE id = ?`
    ).run(month, totalTokens, totalTokens, month, params.userId);

    if (params.teamId) {
      db.prepare(
        `UPDATE teams SET
          usage_tokens = CASE WHEN usage_month = ? THEN usage_tokens + ? ELSE ? END,
          usage_month = ?
         WHERE id = ?`
      ).run(month, totalTokens, totalTokens, month, params.teamId);
    }

    const usageId = `${params.userId}_${month}`;
    const safeModelKey = `${params.model}__${params.connectionType}`.replace(
      /[./~$[\]]/g,
      "_"
    );
    const cliDelta = params.connectionType === "claude_cli" ? totalTokens : 0;

    const existing = db
      .prepare("SELECT * FROM usage_monthly WHERE id = ?")
      .get(usageId);
    if (!existing) {
      const byModel: Record<string, UsageModelBreakdown> = {
        [safeModelKey]: {
          input_tokens: params.inputTokens,
          output_tokens: params.outputTokens,
          cost_usd: costUsd,
          connection_type: params.connectionType,
        },
      };
      db.prepare(
        `INSERT INTO usage_monthly (
          id, user_id, team_id, month, input_tokens, output_tokens,
          total_tokens, cli_tokens, api_cost_usd, by_model_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
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
        nowIso()
      );
    } else {
      const byModel = JSON.parse(
        String(existing.by_model_json ?? "{}")
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
      db.prepare(
        `UPDATE usage_monthly SET
          team_id = ?,
          input_tokens = input_tokens + ?,
          output_tokens = output_tokens + ?,
          total_tokens = total_tokens + ?,
          cli_tokens = cli_tokens + ?,
          api_cost_usd = api_cost_usd + ?,
          by_model_json = ?,
          updated_at = ?
         WHERE id = ?`
      ).run(
        params.teamId,
        params.inputTokens,
        params.outputTokens,
        totalTokens,
        cliDelta,
        costUsd,
        JSON.stringify(byModel),
        nowIso(),
        usageId
      );
    }
  }

  async listUsageMonthly(filter: {
    userId?: string;
    teamId?: string;
  }): Promise<UsageMonthlyRow[]> {
    const db = await getSqliteDb();
    const rows = filter.userId
      ? db
          .prepare("SELECT * FROM usage_monthly WHERE user_id = ?")
          .all(filter.userId)
      : filter.teamId
      ? db
          .prepare("SELECT * FROM usage_monthly WHERE team_id = ?")
          .all(filter.teamId)
      : db.prepare("SELECT * FROM usage_monthly").all();

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
