import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { ClaudeConnectionRow, COL } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

interface RawModelEntry {
  id: string;
  display_name?: string;
  name?: string;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = getFirestoreDb();
  const snap = await db.collection(COL.CONNECTIONS).doc(id).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conn = snap.data() as ClaudeConnectionRow;
  if (
    !conn.is_active ||
    (conn.scope === "team" && conn.team_id !== user.team_id)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (conn.type !== "anthropic_api") {
    return NextResponse.json({ models: [] });
  }

  const apiKey = conn.api_key_encrypted
    ? await decryptText(conn.api_key_encrypted)
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ models: [] });
  }

  const baseUrl = conn.base_url?.trim();
  const collected: Array<{ id: string; displayName: string }> = [];

  try {
    if (baseUrl) {
      // OpenRouter / 互換エンドポイントは /v1/models で全件を返すことが多いため直接取得
      const normalized = baseUrl.replace(/\/+$/, "");
      const endpoint = normalized.endsWith("/v1")
        ? `${normalized}/models`
        : `${normalized}/v1/models`;

      const res = await fetch(endpoint, {
        headers: {
          "x-api-key": apiKey,
          Authorization: `Bearer ${apiKey}`,
          "anthropic-version": "2023-06-01",
        },
      });

      if (res.ok) {
        const json = (await res.json()) as { data?: RawModelEntry[] };
        if (Array.isArray(json.data)) {
          for (const m of json.data) {
            if (!m?.id) continue;
            collected.push({
              id: m.id,
              displayName: m.display_name || m.name || m.id,
            });
          }
        }
      }
    }

    if (collected.length === 0) {
      const client = new Anthropic({
        apiKey,
        baseURL: baseUrl || undefined,
      });
      const list = await client.models.list({ limit: 1000 });
      for (const m of list.data) {
        collected.push({
          id: m.id,
          displayName: m.display_name || m.id,
        });
      }
    }

    collected.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "en", {
        sensitivity: "base",
        numeric: true,
      })
    );

    return NextResponse.json({ models: collected });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
