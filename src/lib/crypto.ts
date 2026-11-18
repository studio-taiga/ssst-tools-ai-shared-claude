import crypto from "node:crypto";
import { getFirestoreDb } from "./firebase";

let cachedSecret: Buffer | null = null;

export async function getSecretKey(): Promise<Buffer> {
  if (cachedSecret) return cachedSecret;

  const envSecret = process.env.APP_SECRET || process.env.SESSION_SECRET;
  if (envSecret && envSecret.length >= 16) {
    cachedSecret = crypto.createHash("sha256").update(envSecret).digest();
    return cachedSecret;
  }

  const db = getFirestoreDb();
  const docRef = db.collection("_system").doc("config");
  const snap = await docRef.get();
  if (snap.exists) {
    const hex = snap.data()?.app_secret_hex as string | undefined;
    if (hex) {
      cachedSecret = Buffer.from(hex, "hex");
      return cachedSecret;
    }
  }

  const generated = crypto.randomBytes(32);
  await docRef.set(
    { app_secret_hex: generated.toString("hex"), updated_at: new Date().toISOString() },
    { merge: true }
  );
  cachedSecret = generated;
  return cachedSecret;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export async function encryptText(plaintext: string): Promise<string> {
  const key = await getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export async function decryptText(ciphertext: string): Promise<string> {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return "";
  const [ivHex, tagHex, encHex] = parts;
  const key = await getSecretKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export interface SessionPayload {
  userId: string;
  exp: number;
}

export async function signSessionToken(
  userId: string,
  ttlSeconds = 60 * 60 * 24 * 7
): Promise<string> {
  const key = await getSecretKey();
  const payload: SessionPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", key)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const key = await getSecretKey();
  const expectedSig = crypto
    .createHmac("sha256", key)
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as SessionPayload;
    if (!payload.userId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
