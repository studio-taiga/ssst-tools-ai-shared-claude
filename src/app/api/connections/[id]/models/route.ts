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
  const seen = new Set<string>();

  try {
    if (baseUrl) {
      // OpenRouter 等では anthropic-version ヘッダーを付けない方が全件を一度に返す
      const normalized = baseUrl.replace(/\/+$/, "");
      const baseEndpoint = normalized.endsWith("/v1")
        ? `${normalized}/models`
        : `${normalized}/v1/models`;

      let afterId: string | null = null;
      for (let page = 0; page < 10; page++) {
        const url = afterId
          ? `${baseEndpoint}?limit=1000&after_id=${encodeURIComponent(afterId)}`
          : baseEndpoint;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "x-api-key": apiKey,
          },
        });

        if (!res.ok) break;
        const json = (await res.json()) as {
          data?: RawModelEntry[];
          has_more?: boolean;
          last_id?: string;
        };

        if (Array.isArray(json.data)) {
          for (const m of json.data) {
            if (!m?.id || seen.has(m.id)) continue;
            seen.add(m.id);
            collected.push({
              id: m.id,
              displayName: m.display_name || m.name || m.id,
            });
          }
        }

        if (json.has_more && json.last_id) {
          afterId = json.last_id;
        } else {
          break;
        }
      }
    }

    if (collected.length === 0) {
      const client = new Anthropic({
        apiKey,
        baseURL: baseUrl || undefined,
      });
      for await (const m of client.models.list({ limit: 100 })) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
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
