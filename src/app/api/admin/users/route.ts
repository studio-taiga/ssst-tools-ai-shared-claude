import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import {
  COL,
  currentMonthKey,
  nowIso,
  TeamRow,
  UserRole,
  UserRow,
} from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function GET() {
  const current = await getCurrentUser();
  if (
    !current ||
    (current.role !== "system_admin" && current.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getFirestoreDb();

  let users: UserRow[] = [];
  if (current.role === "system_admin") {
    const snap = await db
      .collection(COL.USERS)
      .orderBy("created_at", "asc")
      .get();
    users = snap.docs.map((d) => d.data() as UserRow);
  } else if (current.team_id) {
    const snap = await db
      .collection(COL.USERS)
      .where("team_id", "==", current.team_id)
      .orderBy("created_at", "asc")
      .get();
    users = snap.docs.map((d) => d.data() as UserRow);
  }

  const teamsSnap = await db.collection(COL.TEAMS).get();
  const teamMap = new Map<string, string>();
  for (const doc of teamsSnap.docs) {
    const t = doc.data() as TeamRow;
    teamMap.set(t.id, t.name);
  }

  const enriched = await Promise.all(
    users.map(async (u) => {
      const pub = await toPublicUser(
        u,
        u.team_id ? teamMap.get(u.team_id) ?? null : null
      );
      return pub;
    })
  );

  return NextResponse.json({ users: enriched });
}

export async function POST(req: NextRequest) {
  const current = await getCurrentUser();
  if (
    !current ||
    (current.role !== "system_admin" && current.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    username?: string;
    displayName?: string;
    password?: string;
    role?: UserRole;
    teamId?: string | null;
    customInstructions?: string;
    defaultModel?: string;
    defaultConnectionId?: string | null;
    monthlyTokenLimit?: number | null;
  };

  const username = (body.username ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim() || username;
  const password = body.password ?? "";

  if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
    return NextResponse.json(
      {
        error:
          "ユーザー名は3〜32文字の半角英数字・ハイフン・アンダースコアで入力してください。",
      },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "パスワードは6文字以上で入力してください。" },
      { status: 400 }
    );
  }

  // 3階層権限チェック
  let role: UserRole = "member";
  let teamId: string | null = null;

  if (current.role === "system_admin") {
    role =
      body.role === "system_admin" ||
      body.role === "team_admin" ||
      body.role === "member"
        ? body.role
        : "member";
    teamId = body.teamId ?? null;
    if ((role === "team_admin" || role === "member") && !teamId) {
      return NextResponse.json(
        { error: "チーム管理者・一般ユーザーには所属チームを指定してください。" },
        { status: 400 }
      );
    }
  } else {
    // team_admin can only create members in their own team
    if (body.role && body.role !== "member") {
      return NextResponse.json(
        { error: "チーム管理者は一般メンバーのみ作成できます。" },
        { status: 403 }
      );
    }
    if (!current.team_id) {
      return NextResponse.json(
        { error: "所属チームが設定されていません。" },
        { status: 400 }
      );
    }
    role = "member";
    teamId = current.team_id;
  }

  const db = getFirestoreDb();
  const dup = await db
    .collection(COL.USERS)
    .where("username", "==", username)
    .limit(1)
    .get();
  if (!dup.empty) {
    return NextResponse.json(
      { error: "このユーザー名は既に使用されています。" },
      { status: 409 }
    );
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  const userDoc: UserRow = {
    id,
    username,
    display_name: displayName,
    password_hash: hashPassword(password),
    role,
    team_id: teamId,
    custom_instructions: body.customInstructions ?? "",
    default_model: body.defaultModel || "claude-sonnet-5-5",
    default_connection_id: body.defaultConnectionId ?? null,
    monthly_token_limit:
      typeof body.monthlyTokenLimit === "number" ? body.monthlyTokenLimit : null,
    usage_month: currentMonthKey(),
    usage_tokens: 0,
    is_active: true,
    created_at: now,
  };

  await db.collection(COL.USERS).doc(id).set(userDoc);

  return NextResponse.json(
    { user: await toPublicUser(userDoc) },
    { status: 201 }
  );
}
