import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { ClaudeConnectionRow, COL } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function POST(
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
  const snap = await db.collection(COL.CONNECTIONS).doc(id).get();

  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conn = snap.data() as ClaudeConnectionRow;
  if (
    user.role === "team_admin" &&
    conn.scope === "team" &&
    conn.team_id !== user.team_id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (conn.type === "anthropic_api") {
    const apiKey = conn.api_key_encrypted
      ? await decryptText(conn.api_key_encrypted)
      : process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, message: "APIキーが未設定です。" },
        { status: 400 }
      );
    }

    try {
      const client = new Anthropic({ apiKey });
      const models = await client.models.list({ limit: 5 });
      return NextResponse.json({
        ok: true,
        message: `接続成功！(${models.data.length}件のモデルを確認)`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "接続に失敗しました";
      return NextResponse.json({ ok: false, message: msg }, { status: 400 });
    }
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  if (conn.cli_config_dir?.trim()) {
    env.CLAUDE_CONFIG_DIR = conn.cli_config_dir.trim();
  }

  const result = await new Promise<{ ok: boolean; message: string }>(
    (resolve) => {
      const child = spawn(
        "claude",
        [
          "-p",
          "Reply with only OK",
          "--output-format",
          "json",
          "--tools",
          "",
          "--no-session-persistence",
          "--model",
          "haiku",
        ],
        { env, stdio: ["ignore", "pipe", "pipe"] }
      );

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ ok: false, message: "CLI 応答がタイムアウトしました (20秒)" });
      }, 20000);

      child.on("error", (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (err.code === "ENOENT") {
          resolve({
            ok: false,
            message:
              "`claude` コマンドが見つかりません。Firebase App Hosting 等のサーバーレス環境では Anthropic API（従量課金）をご利用ください。",
          });
        } else {
          resolve({ ok: false, message: err.message });
        }
      });

      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString("utf8");
      });
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString("utf8");
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({
            ok: true,
            message: "Claude CLI (プラン契約) 接続成功！",
          });
        } else {
          resolve({
            ok: false,
            message:
              stderr.trim() ||
              stdout.trim() ||
              `Claude CLI が終了コード ${code} で終了しました。`,
          });
        }
      });
    }
  );

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
