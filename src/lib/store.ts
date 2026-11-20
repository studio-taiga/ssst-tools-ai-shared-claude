import { DataStore } from "./store-types";
import { FirestoreStore } from "./stores/firestore-store";
import { LocalFileStore } from "./stores/local-store";
import { MongoDbStore } from "./stores/mongodb-store";
import { MysqlStore } from "./stores/mysql-store";
import { PostgresStore } from "./stores/postgres-store";
import { SqliteStore } from "./stores/sqlite-store";

export type DbProvider =
  | "firestore"
  | "postgres"
  | "mysql"
  | "mongodb"
  | "sqlite"
  | "local";

const globalForStore = globalThis as unknown as {
  __sharedClaudeStore?: DataStore;
  __sharedClaudeProvider?: DbProvider;
};

export function resolveDbProvider(): DbProvider {
  const explicit = (process.env.DB_PROVIDER ?? "").trim().toLowerCase();
  if (
    explicit === "firestore" ||
    explicit === "postgres" ||
    explicit === "mysql" ||
    explicit === "mongodb" ||
    explicit === "sqlite" ||
    explicit === "local"
  ) {
    return explicit;
  }
  if (process.env.DATABASE_URL) {
    return "postgres";
  }
  if (process.env.MYSQL_URL) {
    return "mysql";
  }
  if (process.env.MONGODB_URI) {
    return "mongodb";
  }
  if (
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_CLOUD_PROJECT
  ) {
    return "firestore";
  }
  if (process.env.SQLITE_PATH) {
    return "sqlite";
  }
  return "local";
}

export function getStore(): DataStore {
  const provider = resolveDbProvider();
  if (
    globalForStore.__sharedClaudeStore &&
    globalForStore.__sharedClaudeProvider === provider
  ) {
    return globalForStore.__sharedClaudeStore;
  }

  let store: DataStore;
  switch (provider) {
    case "postgres":
      store = new PostgresStore();
      break;
    case "mysql":
      store = new MysqlStore();
      break;
    case "mongodb":
      store = new MongoDbStore();
      break;
    case "firestore":
      store = new FirestoreStore();
      break;
    case "sqlite":
      store = new SqliteStore();
      break;
    default:
      store = new LocalFileStore();
      break;
  }

  globalForStore.__sharedClaudeStore = store;
  globalForStore.__sharedClaudeProvider = provider;
  return store;
}
