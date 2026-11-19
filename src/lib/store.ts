import { DataStore } from "./store-types";
import { FirestoreStore } from "./stores/firestore-store";
import { LocalFileStore } from "./stores/local-store";
import { PostgresStore } from "./stores/postgres-store";

export type DbProvider = "firestore" | "postgres" | "local";

const globalForStore = globalThis as unknown as {
  __sharedClaudeStore?: DataStore;
  __sharedClaudeProvider?: DbProvider;
};

export function resolveDbProvider(): DbProvider {
  const explicit = (process.env.DB_PROVIDER ?? "").trim().toLowerCase();
  if (explicit === "firestore" || explicit === "postgres" || explicit === "local") {
    return explicit;
  }
  if (process.env.DATABASE_URL) {
    return "postgres";
  }
  if (
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_CLOUD_PROJECT
  ) {
    return "firestore";
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
  if (provider === "postgres") {
    store = new PostgresStore();
  } else if (provider === "firestore") {
    store = new FirestoreStore();
  } else {
    store = new LocalFileStore();
  }

  globalForStore.__sharedClaudeStore = store;
  globalForStore.__sharedClaudeProvider = provider;
  return store;
}
