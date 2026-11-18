import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

const globalForFirebase = globalThis as unknown as {
  __sharedClaudeFirestore?: Firestore;
};

export function getFirestoreDb(): Firestore {
  if (globalForFirebase.__sharedClaudeFirestore) {
    return globalForFirebase.__sharedClaudeFirestore;
  }

  if (getApps().length === 0) {
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      "shared-claude-4d186";

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const parsed = JSON.parse(serviceAccountJson) as Record<string, string>;
      initializeApp({
        credential: cert(parsed),
        projectId,
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    }
  }

  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  globalForFirebase.__sharedClaudeFirestore = db;
  return db;
}
