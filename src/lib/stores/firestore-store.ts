import { FieldValue } from "firebase-admin/firestore";
import {
  ClaudeConnectionRow,
  COL,
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
import { getFirestoreDb } from "../firebase";
import { calculateEstimatedCostUsd, ModelPricing } from "../pricing";
import { DataStore } from "../store-types";

export class FirestoreStore implements DataStore {
  private get db() {
    return getFirestoreDb();
  }

  async getAppSecretHex(): Promise<string | null> {
    const snap = await this.db.collection("_system").doc("config").get();
    if (!snap.exists) return null;
    return (snap.data()?.app_secret_hex as string | undefined) ?? null;
  }

  async setAppSecretHex(hex: string): Promise<void> {
    await this.db
      .collection("_system")
      .doc("config")
      .set(
        { app_secret_hex: hex, updated_at: nowIso() },
        { merge: true }
      );
  }

  async listTeams(): Promise<TeamRow[]> {
    const snap = await this.db
      .collection(COL.TEAMS)
      .orderBy("created_at", "asc")
      .get();
    return snap.docs.map((d) => d.data() as TeamRow);
  }

  async getTeam(id: string): Promise<TeamRow | null> {
    const snap = await this.db.collection(COL.TEAMS).doc(id).get();
    return snap.exists ? (snap.data() as TeamRow) : null;
  }

  async createTeam(team: TeamRow): Promise<void> {
    await this.db.collection(COL.TEAMS).doc(team.id).set(team);
  }

  async updateTeam(id: string, patch: Partial<TeamRow>): Promise<void> {
    await this.db.collection(COL.TEAMS).doc(id).update(patch);
  }

  async deleteTeam(id: string): Promise<void> {
    await this.db.collection(COL.TEAMS).doc(id).delete();
  }

  async hasAnyUsers(): Promise<boolean> {
    const snap = await this.db.collection(COL.USERS).limit(1).get();
    return !snap.empty;
  }

  async listUsers(teamId?: string): Promise<UserRow[]> {
    const snap = teamId
      ? await this.db
          .collection(COL.USERS)
          .where("team_id", "==", teamId)
          .orderBy("created_at", "asc")
          .get()
      : await this.db
          .collection(COL.USERS)
          .orderBy("created_at", "asc")
          .get();
    return snap.docs.map((d) => d.data() as UserRow);
  }

  async getUser(id: string): Promise<UserRow | null> {
    const snap = await this.db.collection(COL.USERS).doc(id).get();
    return snap.exists ? (snap.data() as UserRow) : null;
  }

  async getUserByUsername(username: string): Promise<UserRow | null> {
    const snap = await this.db
      .collection(COL.USERS)
      .where("username", "==", username)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as UserRow);
  }

  async createUser(user: UserRow): Promise<void> {
    await this.db.collection(COL.USERS).doc(user.id).set(user);
  }

  async updateUser(id: string, patch: Partial<UserRow>): Promise<void> {
    await this.db.collection(COL.USERS).doc(id).update(patch);
  }

  async deleteUser(id: string): Promise<void> {
    await this.db.collection(COL.USERS).doc(id).delete();
  }

  async listConnections(onlyActive = false): Promise<ClaudeConnectionRow[]> {
    const snap = onlyActive
      ? await this.db
          .collection(COL.CONNECTIONS)
          .where("is_active", "==", true)
          .get()
      : await this.db.collection(COL.CONNECTIONS).get();
    return snap.docs.map((d) => d.data() as ClaudeConnectionRow);
  }

  async getConnection(id: string): Promise<ClaudeConnectionRow | null> {
    const snap = await this.db.collection(COL.CONNECTIONS).doc(id).get();
    return snap.exists ? (snap.data() as ClaudeConnectionRow) : null;
  }

  async createConnection(conn: ClaudeConnectionRow): Promise<void> {
    await this.db.collection(COL.CONNECTIONS).doc(conn.id).set(conn);
  }

  async updateConnection(
    id: string,
    patch: Partial<ClaudeConnectionRow>
  ): Promise<void> {
    await this.db.collection(COL.CONNECTIONS).doc(id).update(patch);
  }

  async clearDefaultConnections(): Promise<void> {
    const snap = await this.db.collection(COL.CONNECTIONS).get();
    const batch = this.db.batch();
    for (const d of snap.docs) {
      batch.update(d.ref, { is_default: false });
    }
    await batch.commit();
  }

  async deleteConnection(id: string): Promise<void> {
    await this.db.collection(COL.CONNECTIONS).doc(id).delete();
  }

  async listProjects(userId: string): Promise<ProjectRow[]> {
    const snap = await this.db
      .collection(COL.PROJECTS)
      .where("user_id", "==", userId)
      .orderBy("updated_at", "desc")
      .get();
    return snap.docs.map((d) => d.data() as ProjectRow);
  }

  async getProject(id: string): Promise<ProjectRow | null> {
    const snap = await this.db.collection(COL.PROJECTS).doc(id).get();
    return snap.exists ? (snap.data() as ProjectRow) : null;
  }

  async createProject(project: ProjectRow): Promise<void> {
    await this.db.collection(COL.PROJECTS).doc(project.id).set(project);
  }

  async updateProject(id: string, patch: Partial<ProjectRow>): Promise<void> {
    await this.db.collection(COL.PROJECTS).doc(id).update(patch);
  }

  async deleteProjectAndFiles(id: string, userId: string): Promise<void> {
    const filesSnap = await this.db
      .collection(COL.PROJECT_FILES)
      .where("project_id", "==", id)
      .where("user_id", "==", userId)
      .get();
    const batch = this.db.batch();
    for (const f of filesSnap.docs) {
      batch.delete(f.ref);
    }
    batch.delete(this.db.collection(COL.PROJECTS).doc(id));
    await batch.commit();
  }

  async listProjectFiles(
    projectId: string,
    userId: string
  ): Promise<ProjectFileRow[]> {
    const snap = await this.db
      .collection(COL.PROJECT_FILES)
      .where("project_id", "==", projectId)
      .where("user_id", "==", userId)
      .orderBy("created_at", "desc")
      .get();
    return snap.docs.map((d) => d.data() as ProjectFileRow);
  }

  async getProjectFile(id: string): Promise<ProjectFileRow | null> {
    const snap = await this.db.collection(COL.PROJECT_FILES).doc(id).get();
    return snap.exists ? (snap.data() as ProjectFileRow) : null;
  }

  async createProjectFile(file: ProjectFileRow): Promise<void> {
    await this.db.collection(COL.PROJECT_FILES).doc(file.id).set(file);
  }

  async deleteProjectFile(id: string): Promise<void> {
    await this.db.collection(COL.PROJECT_FILES).doc(id).delete();
  }

  async listConversations(
    userId: string,
    projectId?: string | null
  ): Promise<ConversationRow[]> {
    let query = this.db
      .collection(COL.CONVERSATIONS)
      .where("user_id", "==", userId);
    if (projectId) {
      query = query.where("project_id", "==", projectId);
    }
    const snap = await query.orderBy("updated_at", "desc").get();
    return snap.docs.map((d) => d.data() as ConversationRow);
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    const snap = await this.db.collection(COL.CONVERSATIONS).doc(id).get();
    return snap.exists ? (snap.data() as ConversationRow) : null;
  }

  async createConversation(conv: ConversationRow): Promise<void> {
    await this.db.collection(COL.CONVERSATIONS).doc(conv.id).set(conv);
  }

  async updateConversation(
    id: string,
    patch: Partial<ConversationRow>
  ): Promise<void> {
    await this.db.collection(COL.CONVERSATIONS).doc(id).update(patch);
  }

  async deleteConversationAndMessages(id: string): Promise<void> {
    const msgSnap = await this.db
      .collection(COL.MESSAGES)
      .where("conversation_id", "==", id)
      .get();
    const batch = this.db.batch();
    for (const m of msgSnap.docs) {
      batch.delete(m.ref);
    }
    batch.delete(this.db.collection(COL.CONVERSATIONS).doc(id));
    await batch.commit();
  }

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    const snap = await this.db
      .collection(COL.MESSAGES)
      .where("conversation_id", "==", conversationId)
      .orderBy("created_at", "asc")
      .get();
    return snap.docs.map((d) => d.data() as MessageRow);
  }

  async createMessage(msg: MessageRow): Promise<void> {
    await this.db.collection(COL.MESSAGES).doc(msg.id).set(msg);
  }

  async deleteMessagesFrom(
    conversationId: string,
    fromMessageId: string
  ): Promise<void> {
    const existingSnap = await this.db
      .collection(COL.MESSAGES)
      .where("conversation_id", "==", conversationId)
      .orderBy("created_at", "asc")
      .get();
    const docs = existingSnap.docs;
    const idx = docs.findIndex((d) => d.id === fromMessageId);
    if (idx === -1) return;
    const batch = this.db.batch();
    for (let i = idx; i < docs.length; i++) {
      batch.delete(docs[i].ref);
    }
    await batch.commit();
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

    const userRef = this.db.collection(COL.USERS).doc(params.userId);
    await this.db.runTransaction(async (tx) => {
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
      const teamRef = this.db.collection(COL.TEAMS).doc(params.teamId);
      await this.db.runTransaction(async (tx) => {
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

    const usageId = `${params.userId}_${month}`;
    const usageRef = this.db.collection(COL.USAGE_MONTHLY).doc(usageId);
    const safeModelKey = `${params.model}__${params.connectionType}`.replace(
      /[./~$[\]]/g,
      "_"
    );
    const cliDelta = params.connectionType === "claude_cli" ? totalTokens : 0;

    await this.db.runTransaction(async (tx) => {
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
          api_cost_usd: Number(
            ((existing.api_cost_usd ?? 0) + costUsd).toFixed(6)
          ),
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

  async listUsageMonthly(filter: {
    userId?: string;
    teamId?: string;
  }): Promise<UsageMonthlyRow[]> {
    let snap;
    if (filter.userId) {
      snap = await this.db
        .collection(COL.USAGE_MONTHLY)
        .where("user_id", "==", filter.userId)
        .get();
    } else if (filter.teamId) {
      snap = await this.db
        .collection(COL.USAGE_MONTHLY)
        .where("team_id", "==", filter.teamId)
        .get();
    } else {
      snap = await this.db.collection(COL.USAGE_MONTHLY).get();
    }
    return snap.docs.map((d) => d.data() as UsageMonthlyRow);
  }
}
