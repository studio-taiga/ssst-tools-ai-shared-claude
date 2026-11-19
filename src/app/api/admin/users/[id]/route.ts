import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { UserRole } from "@/lib/db";
import { getStore } from "@/lib/store";

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
  const store = getStore();
  const target = await store.getUser(id);

  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (current.role === "team_admin") {
    if (target.team_id !== current.team_id || target.role !== "member") {
      return NextResponse.json(
        { error: "自チームの一般メンバーのみ編集できます。" },
        { status: 403 }
      );
    }
  }

  const body = (await req.json()) as {
    username?: string;
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

  let nextUsername = target.username;
  if (typeof body.username === "string" && body.username.trim()) {
    const normalized = body.username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(normalized)) {
      return NextResponse.json(
        {
          error:
            "ユーザー名は3〜32文字の半角英数字・ハイフン・アンダースコアで入力してください。",
        },
        { status: 400 }
      );
    }
    if (normalized !== target.username) {
      const dup = await store.getUserByUsername(normalized);
      if (dup) {
        return NextResponse.json(
          { error: "このユーザー名は既に使用されています。" },
          { status: 409 }
        );
      }
      nextUsername = normalized;
    }
  }

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

  await store.updateUser(id, {
    username: nextUsername,
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

  const updated = (await store.getUser(id))!;
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

  const store = getStore();
  const target = await store.getUser(id);
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    current.role === "team_admin" &&
    (target.team_id !== current.team_id || target.role !== "member")
  ) {
    return NextResponse.json(
      { error: "自チームの一般メンバーのみ削除できます。" },
      { status: 403 }
    );
  }

  await store.deleteUser(id);
  return NextResponse.json({ ok: true });
}
