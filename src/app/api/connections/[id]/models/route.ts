import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { ClaudeConnectionRow, COL } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";
import { fetchConnectionModels } from "@/lib/pricing";

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

  try {
    const models = await fetchConnectionModels({
      connectionId: conn.id,
      apiKey,
      baseUrl: conn.base_url,
    });
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
