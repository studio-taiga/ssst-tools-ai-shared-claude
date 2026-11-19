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
  UsageMonthlyRow,
  UserRow,
} from "../db";
import { calculateEstimatedCostUsd, ModelPricing } from "../pricing";
import { DataStore } from "../store-types";

interface LocalDbData {
  appSecretHex: string | null;
  teams: TeamRow[];
  users: UserRow[];
  connections: ClaudeConnectionRow[];
  projects: ProjectRow[];
  projectFiles: ProjectFileRow[];
  conversations: ConversationRow[];
  messages: MessageRow[];
  usageMonthly: UsageMonthlyRow[];
}

function defaultData(): LocalDbData {
  return {
    appSecretHex: null,
    teams: [],
    users: [],
    connections: [],
    projects: [],
    projectFiles: [],
    conversations: [],
    messages: [],
    usageMonthly: [],
  };
}

export class LocalFileStore implements DataStore {
  private filePath: string;
  private data: LocalDbData;
  private writeChain: Promise<void> = Promise.resolve();

  constructor() {
    const dir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, "shared-claude-store.json");
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf8");
        this.data = { ...defaultData(), ...(JSON.parse(raw) as Partial<LocalDbData>) };
      } catch {
        this.data = defaultData();
      }
    } else {
      this.data = defaultData();
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writeChain = this.writeChain.then(() =>
      fs.promises.writeFile(this.filePath, snapshot, { mode: 0o600 })
    );
    return this.writeChain;
  }

  async getAppSecretHex(): Promise<string | null> {
    return this.data.appSecretHex;
  }

  async setAppSecretHex(hex: string): Promise<void> {
    this.data.appSecretHex = hex;
    await this.persist();
  }

  async listTeams(): Promise<TeamRow[]> {
    return [...this.data.teams].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
  }

  async getTeam(id: string): Promise<TeamRow | null> {
    return this.data.teams.find((t) => t.id === id) ?? null;
  }

  async createTeam(team: TeamRow): Promise<void> {
    this.data.teams.push(team);
    await this.persist();
  }

  async updateTeam(id: string, patch: Partial<TeamRow>): Promise<void> {
    const idx = this.data.teams.findIndex((t) => t.id === id);
    if (idx !== -1) {
      this.data.teams[idx] = { ...this.data.teams[idx], ...patch };
      await this.persist();
    }
  }

  async deleteTeam(id: string): Promise<void> {
    this.data.teams = this.data.teams.filter((t) => t.id !== id);
    await this.persist();
  }

  async hasAnyUsers(): Promise<boolean> {
    return this.data.users.length > 0;
  }

  async listUsers(teamId?: string): Promise<UserRow[]> {
    const list = teamId
      ? this.data.users.filter((u) => u.team_id === teamId)
      : this.data.users;
    return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getUser(id: string): Promise<UserRow | null> {
    return this.data.users.find((u) => u.id === id) ?? null;
  }

  async getUserByUsername(username: string): Promise<UserRow | null> {
    return this.data.users.find((u) => u.username === username) ?? null;
  }

  async createUser(user: UserRow): Promise<void> {
    this.data.users.push(user);
    await this.persist();
  }

  async updateUser(id: string, patch: Partial<UserRow>): Promise<void> {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx !== -1) {
      this.data.users[idx] = { ...this.data.users[idx], ...patch };
      await this.persist();
    }
  }

  async deleteUser(id: string): Promise<void> {
    this.data.users = this.data.users.filter((u) => u.id !== id);
    await this.persist();
  }

  async listConnections(onlyActive = false): Promise<ClaudeConnectionRow[]> {
    const list = onlyActive
      ? this.data.connections.filter((c) => c.is_active)
      : this.data.connections;
    return [...list];
  }

  async getConnection(id: string): Promise<ClaudeConnectionRow | null> {
    return this.data.connections.find((c) => c.id === id) ?? null;
  }

  async createConnection(conn: ClaudeConnectionRow): Promise<void> {
    this.data.connections.push(conn);
    await this.persist();
  }

  async updateConnection(
    id: string,
    patch: Partial<ClaudeConnectionRow>
  ): Promise<void> {
    const idx = this.data.connections.findIndex((c) => c.id === id);
    if (idx !== -1) {
      this.data.connections[idx] = { ...this.data.connections[idx], ...patch };
      await this.persist();
    }
  }

  async clearDefaultConnections(): Promise<void> {
    for (const c of this.data.connections) {
      c.is_default = false;
    }
    await this.persist();
  }

  async deleteConnection(id: string): Promise<void> {
    this.data.connections = this.data.connections.filter((c) => c.id !== id);
    await this.persist();
  }

  async listProjects(userId: string): Promise<ProjectRow[]> {
    return this.data.projects
      .filter((p) => p.user_id === userId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async getProject(id: string): Promise<ProjectRow | null> {
    return this.data.projects.find((p) => p.id === id) ?? null;
  }

  async createProject(project: ProjectRow): Promise<void> {
    this.data.projects.push(project);
    await this.persist();
  }

  async updateProject(id: string, patch: Partial<ProjectRow>): Promise<void> {
    const idx = this.data.projects.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.data.projects[idx] = { ...this.data.projects[idx], ...patch };
      await this.persist();
    }
  }

  async deleteProjectAndFiles(id: string, userId: string): Promise<void> {
    this.data.projectFiles = this.data.projectFiles.filter(
      (f) => !(f.project_id === id && f.user_id === userId)
    );
    this.data.projects = this.data.projects.filter(
      (p) => !(p.id === id && p.user_id === userId)
    );
    await this.persist();
  }

  async listProjectFiles(
    projectId: string,
    userId: string
  ): Promise<ProjectFileRow[]> {
    return this.data.projectFiles
      .filter((f) => f.project_id === projectId && f.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getProjectFile(id: string): Promise<ProjectFileRow | null> {
    return this.data.projectFiles.find((f) => f.id === id) ?? null;
  }

  async createProjectFile(file: ProjectFileRow): Promise<void> {
    this.data.projectFiles.push(file);
    await this.persist();
  }

  async deleteProjectFile(id: string): Promise<void> {
    this.data.projectFiles = this.data.projectFiles.filter((f) => f.id !== id);
    await this.persist();
  }

  async listConversations(
    userId: string,
    projectId?: string | null
  ): Promise<ConversationRow[]> {
    return this.data.conversations
      .filter((c) => {
        if (c.user_id !== userId) return false;
        if (projectId && c.project_id !== projectId) return false;
        return true;
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    return this.data.conversations.find((c) => c.id === id) ?? null;
  }

  async createConversation(conv: ConversationRow): Promise<void> {
    this.data.conversations.push(conv);
    await this.persist();
  }

  async updateConversation(
    id: string,
    patch: Partial<ConversationRow>
  ): Promise<void> {
    const idx = this.data.conversations.findIndex((c) => c.id === id);
    if (idx !== -1) {
      this.data.conversations[idx] = {
        ...this.data.conversations[idx],
        ...patch,
      };
      await this.persist();
    }
  }

  async deleteConversationAndMessages(id: string): Promise<void> {
    this.data.messages = this.data.messages.filter(
      (m) => m.conversation_id !== id
    );
    this.data.conversations = this.data.conversations.filter(
      (c) => c.id !== id
    );
    await this.persist();
  }

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    return this.data.messages
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async createMessage(msg: MessageRow): Promise<void> {
    this.data.messages.push(msg);
    await this.persist();
  }

  async deleteMessagesFrom(
    conversationId: string,
    fromMessageId: string
  ): Promise<void> {
    const ordered = await this.listMessages(conversationId);
    const idx = ordered.findIndex((m) => m.id === fromMessageId);
    if (idx === -1) return;
    const toDelete = new Set(ordered.slice(idx).map((m) => m.id));
    this.data.messages = this.data.messages.filter((m) => !toDelete.has(m.id));
    await this.persist();
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

    const month = currentMonthKey();
    const costUsd = calculateEstimatedCostUsd({
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      connectionType: params.connectionType,
      pricingOverride: params.pricingOverride,
    });

    const user = this.data.users.find((u) => u.id === params.userId);
    if (user) {
      if (user.usage_month === month) {
        user.usage_tokens += totalTokens;
      } else {
        user.usage_month = month;
        user.usage_tokens = totalTokens;
      }
    }

    if (params.teamId) {
      const team = this.data.teams.find((t) => t.id === params.teamId);
      if (team) {
        if (team.usage_month === month) {
          team.usage_tokens += totalTokens;
        } else {
          team.usage_month = month;
          team.usage_tokens = totalTokens;
        }
      }
    }

    const usageId = `${params.userId}_${month}`;
    const safeModelKey = `${params.model}__${params.connectionType}`.replace(
      /[./~$[\]]/g,
      "_"
    );
    const cliDelta = params.connectionType === "claude_cli" ? totalTokens : 0;

    let usageDoc = this.data.usageMonthly.find((u) => u.id === usageId);
    if (!usageDoc) {
      usageDoc = {
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
      this.data.usageMonthly.push(usageDoc);
    } else {
      usageDoc.team_id = params.teamId;
      usageDoc.input_tokens += params.inputTokens;
      usageDoc.output_tokens += params.outputTokens;
      usageDoc.total_tokens += totalTokens;
      usageDoc.cli_tokens += cliDelta;
      usageDoc.api_cost_usd = Number((usageDoc.api_cost_usd + costUsd).toFixed(6));
      const prev = usageDoc.by_model[safeModelKey] ?? {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        connection_type: params.connectionType,
      };
      usageDoc.by_model[safeModelKey] = {
        input_tokens: prev.input_tokens + params.inputTokens,
        output_tokens: prev.output_tokens + params.outputTokens,
        cost_usd: Number((prev.cost_usd + costUsd).toFixed(6)),
        connection_type: params.connectionType,
      };
      usageDoc.updated_at = nowIso();
    }

    await this.persist();
  }

  async listUsageMonthly(filter: {
    userId?: string;
    teamId?: string;
  }): Promise<UsageMonthlyRow[]> {
    return this.data.usageMonthly.filter((r) => {
      if (filter.userId && r.user_id !== filter.userId) return false;
      if (filter.teamId && r.team_id !== filter.teamId) return false;
      return true;
    });
  }
}
