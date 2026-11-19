import {
  ClaudeConnectionRow,
  ConversationRow,
  MessageRow,
  ProjectFileRow,
  ProjectRow,
  TeamRow,
  UsageMonthlyRow,
  UserRow,
} from "./db";
import { ModelPricing } from "./pricing";

export interface DataStore {
  getAppSecretHex(): Promise<string | null>;
  setAppSecretHex(hex: string): Promise<void>;

  listTeams(): Promise<TeamRow[]>;
  getTeam(id: string): Promise<TeamRow | null>;
  createTeam(team: TeamRow): Promise<void>;
  updateTeam(id: string, patch: Partial<TeamRow>): Promise<void>;
  deleteTeam(id: string): Promise<void>;

  hasAnyUsers(): Promise<boolean>;
  listUsers(teamId?: string): Promise<UserRow[]>;
  getUser(id: string): Promise<UserRow | null>;
  getUserByUsername(username: string): Promise<UserRow | null>;
  createUser(user: UserRow): Promise<void>;
  updateUser(id: string, patch: Partial<UserRow>): Promise<void>;
  deleteUser(id: string): Promise<void>;

  listConnections(onlyActive?: boolean): Promise<ClaudeConnectionRow[]>;
  getConnection(id: string): Promise<ClaudeConnectionRow | null>;
  createConnection(conn: ClaudeConnectionRow): Promise<void>;
  updateConnection(
    id: string,
    patch: Partial<ClaudeConnectionRow>
  ): Promise<void>;
  clearDefaultConnections(): Promise<void>;
  deleteConnection(id: string): Promise<void>;

  listProjects(userId: string): Promise<ProjectRow[]>;
  getProject(id: string): Promise<ProjectRow | null>;
  createProject(project: ProjectRow): Promise<void>;
  updateProject(id: string, patch: Partial<ProjectRow>): Promise<void>;
  deleteProjectAndFiles(id: string, userId: string): Promise<void>;

  listProjectFiles(
    projectId: string,
    userId: string
  ): Promise<ProjectFileRow[]>;
  getProjectFile(id: string): Promise<ProjectFileRow | null>;
  createProjectFile(file: ProjectFileRow): Promise<void>;
  deleteProjectFile(id: string): Promise<void>;

  listConversations(
    userId: string,
    projectId?: string | null
  ): Promise<ConversationRow[]>;
  getConversation(id: string): Promise<ConversationRow | null>;
  createConversation(conv: ConversationRow): Promise<void>;
  updateConversation(
    id: string,
    patch: Partial<ConversationRow>
  ): Promise<void>;
  deleteConversationAndMessages(id: string): Promise<void>;

  listMessages(conversationId: string): Promise<MessageRow[]>;
  createMessage(msg: MessageRow): Promise<void>;
  deleteMessagesFrom(
    conversationId: string,
    fromMessageId: string
  ): Promise<void>;

  recordTokenUsage(params: {
    userId: string;
    teamId: string | null;
    inputTokens: number;
    outputTokens: number;
    model: string;
    connectionType: string;
    pricingOverride?: ModelPricing;
  }): Promise<void>;
  listUsageMonthly(filter: {
    userId?: string;
    teamId?: string;
  }): Promise<UsageMonthlyRow[]>;
}
