import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasAnyUsers, setSessionCookie, toPublicUser } from "@/lib/auth";
import { encryptText, hashPassword } from "@/lib/crypto";
import {
  ClaudeConnectionRow,
  COL,
  currentMonthKey,
  nowIso,
  TeamRow,
  UserRow,
} from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function POST(req: NextRequest) {
  if (await hasAnyUsers()) {
    return NextResponse.json(
      { error: "初期セットアップは既に完了しています。" },
      { status: 403 }
    );
  }

  const body = (await req.json()) as {
    username?: string;
    displayName?: string;
    password?: string;
    teamName?: string;
    connectionType?: "anthropic_api" | "claude_cli";
    connectionName?: string;
    apiKey?: string;
    cliConfigDir?: string;
  };

  const username = (body.username ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim() || username;
  const password = body.password ?? "";
  const teamName = (body.teamName ?? "").trim() || "デフォルトチーム";

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

  const db = getFirestoreDb();
  const now = nowIso();
  const month = currentMonthKey();

  // Create initial default team
  const teamId = crypto.randomUUID();
  const teamDoc: TeamRow = {
    id: teamId,
    name: teamName,
    description: "初期作成されたデフォルトチーム",
    monthly_token_limit: null,
    usage_month: month,
    usage_tokens: 0,
    is_active: true,
    created_at: now,
  };
  await db.collection(COL.TEAMS).doc(teamId).set(teamDoc);

  // Optional initial global connection
  let defaultConnectionId: string | null = null;
  if (body.connectionType) {
    const connId = crypto.randomUUID();
    const connName =
      (body.connectionName ?? "").trim() ||
      (body.connectionType === "anthropic_api"
        ? "システム共通 Anthropic API"
        : "Claude プラン契約 (CLI)");

    const encryptedKey =
      body.connectionType === "anthropic_api" && body.apiKey?.trim()
        ? await encryptText(body.apiKey.trim())
        : null;
    const cliDir =
      body.connectionType === "claude_cli" && body.cliConfigDir?.trim()
        ? body.cliConfigDir.trim()
        : null;

    const connDoc: ClaudeConnectionRow = {
      id: connId,
      name: connName,
      type: body.connectionType,
      scope: "global",
      team_id: null,
      api_key_encrypted: encryptedKey,
      cli_config_dir: cliDir,
      is_active: true,
      is_default: true,
      created_at: now,
    };
    await db.collection(COL.CONNECTIONS).doc(connId).set(connDoc);
    defaultConnectionId = connId;
  }

  const userId = crypto.randomUUID();
  const userDoc: UserRow = {
    id: userId,
    username,
    display_name: displayName,
    password_hash: hashPassword(password),
    role: "system_admin",
    team_id: teamId,
    custom_instructions: "",
    default_model: "claude-sonnet-5-5",
    default_connection_id: defaultConnectionId,
    monthly_token_limit: null,
    usage_month: month,
    usage_tokens: 0,
    is_active: true,
    created_at: now,
  };

  await db.collection(COL.USERS).doc(userId).set(userDoc);

  const res = NextResponse.json(
    { user: await toPublicUser(userDoc, teamName) },
    { status: 201 }
  );
  await setSessionCookie(res, userId);
  return res;
}
