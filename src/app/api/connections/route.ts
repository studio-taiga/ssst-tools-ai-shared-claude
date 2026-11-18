import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ClaudeConnectionRow, COL } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export interface PublicConnection {
  id: string;
  name: string;
  type: "anthropic_api" | "claude_cli";
  scope: "global" | "team";
  teamId: string | null;
  hasCustomApiKey: boolean;
  hasOauthToken: boolean;
  cliConfigDir: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
}

export function toPublicConnection(row: ClaudeConnectionRow): PublicConnection {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    scope: row.scope ?? "global",
    teamId: row.team_id ?? null,
    hasCustomApiKey: Boolean(row.api_key_encrypted),
    hasOauthToken: Boolean(row.oauth_token_encrypted),
    cliConfigDir: row.cli_config_dir,
    isActive: row.is_active,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getFirestoreDb();
  const snap = await db
    .collection(COL.CONNECTIONS)
    .where("is_active", "==", true)
    .get();

  const rows = snap.docs
    .map((d) => d.data() as ClaudeConnectionRow)
    .filter(
      (c) =>
        c.scope === "global" ||
        (c.scope === "team" && user.team_id && c.team_id === user.team_id)
    )
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.created_at.localeCompare(b.created_at);
    });

  return NextResponse.json({
    connections: rows.map(toPublicConnection),
  });
}
