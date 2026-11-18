import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import {
  ClaudeConnectionRow,
  COL,
  ConnectionScope,
  nowIso,
} from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";
import { toPublicConnection } from "@/app/api/connections/route";

export async function GET() {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== "system_admin" && user.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getFirestoreDb();
  const snap = await db.collection(COL.CONNECTIONS).get();

  const rows = snap.docs
    .map((d) => d.data() as ClaudeConnectionRow)
    .filter((c) => {
      if (user.role === "system_admin") return true;
      return (
        c.scope === "global" ||
        (c.scope === "team" && user.team_id && c.team_id === user.team_id)
      );
    })
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.created_at.localeCompare(b.created_at);
    });

  return NextResponse.json({
    connections: rows.map(toPublicConnection),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== "system_admin" && user.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    name?: string;
    type?: "anthropic_api" | "claude_cli";
    scope?: ConnectionScope;
    teamId?: string | null;
    apiKey?: string;
    oauthToken?: string;
    baseUrl?: string;
    defaultModelOverride?: string;
    cliConfigDir?: string;
    isDefault?: boolean;
  };

  const name = (body.name ?? "").trim();
  const type = body.type;
  if (!name || (type !== "anthropic_api" && type !== "claude_cli")) {
    return NextResponse.json(
      { error: "接続名と種別（anthropic_api / claude_cli）を指定してください。" },
      { status: 400 }
    );
  }

  let scope: ConnectionScope = "global";
  let teamId: string | null = null;
  if (user.role === "system_admin") {
    scope = body.scope === "team" ? "team" : "global";
    teamId = scope === "team" ? body.teamId ?? null : null;
    if (scope === "team" && !teamId) {
      return NextResponse.json(
        { error: "チーム専用接続には対象チームを指定してください。" },
        { status: 400 }
      );
    }
  } else {
    if (!user.team_id) {
      return NextResponse.json(
        { error: "所属チームが設定されていません。" },
        { status: 400 }
      );
    }
    scope = "team";
    teamId = user.team_id;
  }

  const db = getFirestoreDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  const encryptedKey =
    type === "anthropic_api" && body.apiKey?.trim()
      ? await encryptText(body.apiKey.trim())
      : null;
  const encryptedOauthToken =
    type === "claude_cli" && body.oauthToken?.trim()
      ? await encryptText(body.oauthToken.trim())
      : null;
  const cliDir =
    type === "claude_cli" && body.cliConfigDir?.trim()
      ? body.cliConfigDir.trim()
      : null;

  const existingSnap = await db.collection(COL.CONNECTIONS).get();
  const isDefault =
    user.role === "system_admin" &&
    (Boolean(body.isDefault) || existingSnap.empty);

  if (isDefault) {
    const batch = db.batch();
    for (const d of existingSnap.docs) {
      batch.update(d.ref, { is_default: false });
    }
    await batch.commit();
  }

  const doc: ClaudeConnectionRow = {
    id,
    name,
    type,
    scope,
    team_id: teamId,
    api_key_encrypted: encryptedKey,
    oauth_token_encrypted: encryptedOauthToken,
    base_url: body.baseUrl?.trim() || null,
    default_model_override: body.defaultModelOverride?.trim() || null,
    cli_config_dir: cliDir,
    is_active: true,
    is_default: isDefault,
    created_at: now,
  };

  await db.collection(COL.CONNECTIONS).doc(id).set(doc);

  return NextResponse.json(
    { connection: toPublicConnection(doc) },
    { status: 201 }
  );
}
