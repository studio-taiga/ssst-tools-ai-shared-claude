import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { ClaudeConnectionRow, COL } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";
import { toPublicConnection } from "@/app/api/connections/route";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== "system_admin" && user.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const db = getFirestoreDb();
  const ref = db.collection(COL.CONNECTIONS).doc(id);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = snap.data() as ClaudeConnectionRow;
  if (
    user.role === "team_admin" &&
    (existing.scope !== "team" || existing.team_id !== user.team_id)
  ) {
    return NextResponse.json(
      { error: "自チーム専用の接続のみ編集できます。" },
      { status: 403 }
    );
  }

  const body = (await req.json()) as {
    name?: string;
    scope?: "global" | "team";
    teamId?: string | null;
    apiKey?: string;
    oauthToken?: string;
    baseUrl?: string | null;
    defaultModelOverride?: string | null;
    maxTokens?: number | null;
    cliConfigDir?: string | null;
    isActive?: boolean;
    isDefault?: boolean;
  };

  let encryptedKey = existing.api_key_encrypted;
  if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    encryptedKey = await encryptText(body.apiKey.trim());
  }

  let encryptedOauthToken = existing.oauth_token_encrypted ?? null;
  if (typeof body.oauthToken === "string" && body.oauthToken.trim()) {
    encryptedOauthToken = await encryptText(body.oauthToken.trim());
  }

  const isDefault =
    user.role === "system_admin" && typeof body.isDefault === "boolean"
      ? body.isDefault
      : existing.is_default;

  if (isDefault && !existing.is_default) {
    const allSnap = await db.collection(COL.CONNECTIONS).get();
    const batch = db.batch();
    for (const d of allSnap.docs) {
      batch.update(d.ref, { is_default: false });
    }
    await batch.commit();
  }

  let nextScope = existing.scope ?? "global";
  let nextTeamId = existing.team_id ?? null;
  if (user.role === "system_admin" && (body.scope === "global" || body.scope === "team")) {
    nextScope = body.scope;
    nextTeamId = nextScope === "team" ? (body.teamId ?? nextTeamId) : null;
  }

  await ref.update({
    name:
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : existing.name,
    scope: nextScope,
    team_id: nextTeamId,
    api_key_encrypted: encryptedKey,
    oauth_token_encrypted: encryptedOauthToken,
    base_url:
      body.baseUrl !== undefined
        ? body.baseUrl?.trim() || null
        : existing.base_url ?? null,
    default_model_override:
      body.defaultModelOverride !== undefined
        ? body.defaultModelOverride?.trim() || null
        : existing.default_model_override ?? null,
    max_tokens:
      body.maxTokens !== undefined
        ? typeof body.maxTokens === "number" && body.maxTokens > 0
          ? body.maxTokens
          : null
        : existing.max_tokens ?? null,
    cli_config_dir:
      body.cliConfigDir !== undefined
        ? body.cliConfigDir?.trim() || null
        : existing.cli_config_dir,
    is_active:
      typeof body.isActive === "boolean" ? body.isActive : existing.is_active,
    is_default: isDefault,
  });

  const updated = (await ref.get()).data() as ClaudeConnectionRow;
  return NextResponse.json({ connection: toPublicConnection(updated) });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== "system_admin" && user.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const db = getFirestoreDb();
  const ref = db.collection(COL.CONNECTIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = snap.data() as ClaudeConnectionRow;
  if (
    user.role === "team_admin" &&
    (existing.scope !== "team" || existing.team_id !== user.team_id)
  ) {
    return NextResponse.json(
      { error: "自チーム専用の接続のみ削除できます。" },
      { status: 403 }
    );
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
