import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { COL, UserRole, UserRow } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const current = await getCurrentUser();
  if (
    !current ||
    (current.role !== "system_admin" && current.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const db = getFirestoreDb();
  const ref = db.collection(COL.USERS).doc(id);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = snap.data() as UserRow;

  // team_admin 境界チェック
  if (current.role === "team_admin") {
    if (target.team_id !== current.team_id || target.role !== "member") {
      return NextResponse.json(
        { error: "自チームの一般メンバーのみ編集できます。" },
        { status: 403 }
      );
    }
  }

  const body = (await req.json()) as {
    displayName?: string;
    role?: UserRole;
    teamId?: string | null;
    password?: string;
    customInstructions?: string;
    defaultModel?: string;
    defaultConnectionId?: string | null;
    monthlyTokenLimit?: number | null;
    isActive?: boolean;
  };

  if (id === current.id && body.isActive === false) {
    return NextResponse.json(
      { error: "自分自身のアカウントは無効化できません。" },
      { status: 400 }
    );
  }
  if (id === current.id && body.role && body.role !== current.role) {
    return NextResponse.json(
      { error: "自分自身の権限は変更できません。" },
      { status: 400 }
    );
  }

  let nextRole = target.role;
  let nextTeamId = target.team_id;
  if (current.role === "system_admin") {
    if (
      body.role === "system_admin" ||
      body.role === "team_admin" ||
      body.role === "member"
    ) {
      nextRole = body.role;
    }
    if (body.teamId !== undefined) {
      nextTeamId = body.teamId;
    }
  }

  let passwordHash = target.password_hash;
  if (body.password) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "パスワードは6文字以上で入力してください。" },
        { status: 400 }
      );
    }
    passwordHash = hashPassword(body.password);
  }

  await ref.update({
    display_name:
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : target.display_name,
    role: nextRole,
    team_id: nextTeamId,
    password_hash: passwordHash,
    custom_instructions:
      typeof body.customInstructions === "string"
        ? body.customInstructions
        : target.custom_instructions,
    default_model:
      typeof body.defaultModel === "string" && body.defaultModel.trim()
        ? body.defaultModel.trim()
        : target.default_model,
    default_connection_id:
      body.defaultConnectionId !== undefined
        ? body.defaultConnectionId
        : target.default_connection_id,
    monthly_token_limit:
      body.monthlyTokenLimit !== undefined
        ? body.monthlyTokenLimit
        : target.monthly_token_limit,
    is_active:
      typeof body.isActive === "boolean" ? body.isActive : target.is_active,
  });

  const updated = (await ref.get()).data() as UserRow;
  return NextResponse.json({ user: await toPublicUser(updated) });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const current = await getCurrentUser();
  if (
    !current ||
    (current.role !== "system_admin" && current.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (id === current.id) {
    return NextResponse.json(
      { error: "自分自身のアカウントは削除できません。" },
      { status: 400 }
    );
  }

  const db = getFirestoreDb();
  const ref = db.collection(COL.USERS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = snap.data() as UserRow;
  if (
    current.role === "team_admin" &&
    (target.team_id !== current.team_id || target.role !== "member")
  ) {
    return NextResponse.json(
      { error: "自チームの一般メンバーのみ削除できます。" },
      { status: 403 }
    );
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
