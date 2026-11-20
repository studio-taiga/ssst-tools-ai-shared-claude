import { Db, MongoClient } from "mongodb";
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

const globalForMongo = globalThis as unknown as {
  __sharedClaudeMongoClient?: MongoClient;
  __sharedClaudeMongoIndexesReady?: Promise<void>;
};

async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI が設定されていません。");
  }
  if (!globalForMongo.__sharedClaudeMongoClient) {
    const client = new MongoClient(uri);
    await client.connect();
    globalForMongo.__sharedClaudeMongoClient = client;
  }
  const dbName = process.env.MONGODB_DB_NAME || "shared_claude";
  const db = globalForMongo.__sharedClaudeMongoClient.db(dbName);

  if (!globalForMongo.__sharedClaudeMongoIndexesReady) {
    globalForMongo.__sharedClaudeMongoIndexesReady = Promise.all([
      db.collection("users").createIndex({ username: 1 }, { unique: true }),
      db.collection("users").createIndex({ team_id: 1 }),
      db.collection("projects").createIndex({ user_id: 1, updated_at: -1 }),
      db.collection("project_files").createIndex({ project_id: 1, user_id: 1 }),
      db.collection("conversations").createIndex({ user_id: 1, updated_at: -1 }),
      db.collection("messages").createIndex({ conversation_id: 1, created_at: 1 }),
      db.collection("usage_monthly").createIndex({ user_id: 1 }),
      db.collection("usage_monthly").createIndex({ team_id: 1 }),
    ]).then(() => undefined);
  }
  await globalForMongo.__sharedClaudeMongoIndexesReady;
  return db;
}

function stripId<T>(doc: (T & { _id?: unknown }) | null): T | null {
  if (!doc) return null;
  const copy = { ...doc };
  delete copy._id;
  return copy as T;
}

export class MongoDbStore implements DataStore {
  async getAppSecretHex(): Promise<string | null> {
    const db = await getMongoDb();
    const doc = await db
      .collection<{ _id: string; app_secret_hex?: string }>("_system")
      .findOne({ _id: "config" });
    return doc?.app_secret_hex ?? null;
  }

  async setAppSecretHex(hex: string): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<{ _id: string; app_secret_hex: string; updated_at: string }>(
        "_system"
      )
      .updateOne(
        { _id: "config" },
        { $set: { app_secret_hex: hex, updated_at: nowIso() } },
        { upsert: true }
      );
  }

  async listTeams(): Promise<TeamRow[]> {
    const db = await getMongoDb();
    const docs = await db
      .collection<TeamRow>("teams")
      .find({})
      .sort({ created_at: 1 })
      .toArray();
    return docs.map((d) => stripId(d)!);
  }

  async getTeam(id: string): Promise<TeamRow | null> {
    const db = await getMongoDb();
    return stripId(await db.collection<TeamRow>("teams").findOne({ id }));
  }

  async createTeam(team: TeamRow): Promise<void> {
    const db = await getMongoDb();
    await db.collection<TeamRow>("teams").insertOne({ ...team });
  }

  async updateTeam(id: string, patch: Partial<TeamRow>): Promise<void> {
    const db = await getMongoDb();
    await db.collection<TeamRow>("teams").updateOne({ id }, { $set: patch });
  }

  async deleteTeam(id: string): Promise<void> {
    const db = await getMongoDb();
    await db.collection<TeamRow>("teams").deleteOne({ id });
  }

  async hasAnyUsers(): Promise<boolean> {
    const db = await getMongoDb();
    const doc = await db.collection<UserRow>("users").findOne({});
    return Boolean(doc);
  }

  async listUsers(teamId?: string): Promise<UserRow[]> {
    const db = await getMongoDb();
    const query = teamId ? { team_id: teamId } : {};
    const docs = await db
      .collection<UserRow>("users")
      .find(query)
      .sort({ created_at: 1 })
      .toArray();
    return docs.map((d) => stripId(d)!);
  }

  async getUser(id: string): Promise<UserRow | null> {
    const db = await getMongoDb();
    return stripId(await db.collection<UserRow>("users").findOne({ id }));
  }

  async getUserByUsername(username: string): Promise<UserRow | null> {
    const db = await getMongoDb();
    return stripId(
      await db.collection<UserRow>("users").findOne({ username })
    );
  }

  async createUser(user: UserRow): Promise<void> {
    const db = await getMongoDb();
    await db.collection<UserRow>("users").insertOne({ ...user });
  }

  async updateUser(id: string, patch: Partial<UserRow>): Promise<void> {
    const db = await getMongoDb();
    await db.collection<UserRow>("users").updateOne({ id }, { $set: patch });
  }

  async deleteUser(id: string): Promise<void> {
    const db = await getMongoDb();
    await db.collection<UserRow>("users").deleteOne({ id });
  }

  async listConnections(onlyActive = false): Promise<ClaudeConnectionRow[]> {
    const db = await getMongoDb();
    const query = onlyActive ? { is_active: true } : {};
    const docs = await db
      .collection<ClaudeConnectionRow>("claude_connections")
      .find(query)
      .toArray();
    return docs.map((d) => stripId(d)!);
  }

  async getConnection(id: string): Promise<ClaudeConnectionRow | null> {
    const db = await getMongoDb();
    return stripId(
      await db.collection<ClaudeConnectionRow>("claude_connections").findOne({ id })
    );
  }

  async createConnection(conn: ClaudeConnectionRow): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<ClaudeConnectionRow>("claude_connections")
      .insertOne({ ...conn });
  }

  async updateConnection(
    id: string,
    patch: Partial<ClaudeConnectionRow>
  ): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<ClaudeConnectionRow>("claude_connections")
      .updateOne({ id }, { $set: patch });
  }

  async clearDefaultConnections(): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<ClaudeConnectionRow>("claude_connections")
      .updateMany({}, { $set: { is_default: false } });
  }

  async deleteConnection(id: string): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<ClaudeConnectionRow>("claude_connections")
      .deleteOne({ id });
  }

  async listProjects(userId: string): Promise<ProjectRow[]> {
    const db = await getMongoDb();
    const docs = await db
      .collection<ProjectRow>("projects")
      .find({ user_id: userId })
      .sort({ updated_at: -1 })
      .toArray();
    return docs.map((d) => stripId(d)!);
  }

  async getProject(id: string): Promise<ProjectRow | null> {
    const db = await getMongoDb();
    return stripId(await db.collection<ProjectRow>("projects").findOne({ id }));
  }

  async createProject(project: ProjectRow): Promise<void> {
    const db = await getMongoDb();
    await db.collection<ProjectRow>("projects").insertOne({ ...project });
  }

  async updateProject(id: string, patch: Partial<ProjectRow>): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<ProjectRow>("projects")
      .updateOne({ id }, { $set: patch });
  }

  async deleteProjectAndFiles(id: string, userId: string): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<ProjectFileRow>("project_files")
      .deleteMany({ project_id: id, user_id: userId });
    await db
      .collection<ProjectRow>("projects")
      .deleteOne({ id, user_id: userId });
  }

  async listProjectFiles(
    projectId: string,
    userId: string
  ): Promise<ProjectFileRow[]> {
    const db = await getMongoDb();
    const docs = await db
      .collection<ProjectFileRow>("project_files")
      .find({ project_id: projectId, user_id: userId })
      .sort({ created_at: -1 })
      .toArray();
    return docs.map((d) => stripId(d)!);
  }

  async getProjectFile(id: string): Promise<ProjectFileRow | null> {
    const db = await getMongoDb();
    return stripId(
      await db.collection<ProjectFileRow>("project_files").findOne({ id })
    );
  }

  async createProjectFile(file: ProjectFileRow): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<ProjectFileRow>("project_files")
      .insertOne({ ...file });
  }

  async deleteProjectFile(id: string): Promise<void> {
    const db = await getMongoDb();
    await db.collection<ProjectFileRow>("project_files").deleteOne({ id });
  }

  async listConversations(
    userId: string,
    projectId?: string | null
  ): Promise<ConversationRow[]> {
    const db = await getMongoDb();
    const query = projectId
      ? { user_id: userId, project_id: projectId }
      : { user_id: userId };
    const docs = await db
      .collection<ConversationRow>("conversations")
      .find(query)
      .sort({ updated_at: -1 })
      .toArray();
    return docs.map((d) => stripId(d)!);
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    const db = await getMongoDb();
    return stripId(
      await db.collection<ConversationRow>("conversations").findOne({ id })
    );
  }

  async createConversation(conv: ConversationRow): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<ConversationRow>("conversations")
      .insertOne({ ...conv });
  }

  async updateConversation(
    id: string,
    patch: Partial<ConversationRow>
  ): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<ConversationRow>("conversations")
      .updateOne({ id }, { $set: patch });
  }

  async deleteConversationAndMessages(id: string): Promise<void> {
    const db = await getMongoDb();
    await db
      .collection<MessageRow>("messages")
      .deleteMany({ conversation_id: id });
    await db.collection<ConversationRow>("conversations").deleteOne({ id });
  }

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    const db = await getMongoDb();
    const docs = await db
      .collection<MessageRow>("messages")
      .find({ conversation_id: conversationId })
      .sort({ created_at: 1 })
      .toArray();
    return docs.map((d) => stripId(d)!);
  }

  async createMessage(msg: MessageRow): Promise<void> {
    const db = await getMongoDb();
    await db.collection<MessageRow>("messages").insertOne({ ...msg });
  }

  async deleteMessagesFrom(
    conversationId: string,
    fromMessageId: string
  ): Promise<void> {
    const ordered = await this.listMessages(conversationId);
    const idx = ordered.findIndex((m) => m.id === fromMessageId);
    if (idx === -1) return;
    const ids = ordered.slice(idx).map((m) => m.id);
    const db = await getMongoDb();
    await db
      .collection<MessageRow>("messages")
      .deleteMany({ id: { $in: ids } });
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

    const db = await getMongoDb();
    const month = currentMonthKey();
    const costUsd = calculateEstimatedCostUsd({
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      connectionType: params.connectionType,
      pricingOverride: params.pricingOverride,
    });

    const user = await this.getUser(params.userId);
    if (user) {
      if (user.usage_month === month) {
        await db
          .collection<UserRow>("users")
          .updateOne(
            { id: params.userId },
            { $inc: { usage_tokens: totalTokens } }
          );
      } else {
        await db
          .collection<UserRow>("users")
          .updateOne(
            { id: params.userId },
            { $set: { usage_month: month, usage_tokens: totalTokens } }
          );
      }
    }

    if (params.teamId) {
      const team = await this.getTeam(params.teamId);
      if (team) {
        if (team.usage_month === month) {
          await db
            .collection<TeamRow>("teams")
            .updateOne(
              { id: params.teamId },
              { $inc: { usage_tokens: totalTokens } }
            );
        } else {
          await db
            .collection<TeamRow>("teams")
            .updateOne(
              { id: params.teamId },
              { $set: { usage_month: month, usage_tokens: totalTokens } }
            );
        }
      }
    }

    const usageId = `${params.userId}_${month}`;
    const safeModelKey = `${params.model}__${params.connectionType}`.replace(
      /[./~$[\]]/g,
      "_"
    );
    const cliDelta = params.connectionType === "claude_cli" ? totalTokens : 0;

    const existing = await db
      .collection<UsageMonthlyRow>("usage_monthly")
      .findOne({ id: usageId });
    if (!existing) {
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
      await db.collection<UsageMonthlyRow>("usage_monthly").insertOne(doc);
    } else {
      const prevM: UsageModelBreakdown = existing.by_model?.[safeModelKey] ?? {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        connection_type: params.connectionType,
      };
      await db.collection<UsageMonthlyRow>("usage_monthly").updateOne(
        { id: usageId },
        {
          $set: {
            team_id: params.teamId,
            api_cost_usd: Number(
              ((existing.api_cost_usd ?? 0) + costUsd).toFixed(6)
            ),
            [`by_model.${safeModelKey}`]: {
              input_tokens: prevM.input_tokens + params.inputTokens,
              output_tokens: prevM.output_tokens + params.outputTokens,
              cost_usd: Number((prevM.cost_usd + costUsd).toFixed(6)),
              connection_type: params.connectionType,
            },
            updated_at: nowIso(),
          },
          $inc: {
            input_tokens: params.inputTokens,
            output_tokens: params.outputTokens,
            total_tokens: totalTokens,
            cli_tokens: cliDelta,
          },
        }
      );
    }
  }

  async listUsageMonthly(filter: {
    userId?: string;
    teamId?: string;
  }): Promise<UsageMonthlyRow[]> {
    const db = await getMongoDb();
    const query = filter.userId
      ? { user_id: filter.userId }
      : filter.teamId
      ? { team_id: filter.teamId }
      : {};
    const docs = await db
      .collection<UsageMonthlyRow>("usage_monthly")
      .find(query)
      .toArray();
    return docs.map((d) => stripId(d)!);
  }
}
