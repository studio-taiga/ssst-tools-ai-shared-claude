import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  currentMonthKey,
  getEffectiveMonthlyTokens,
  nowIso,
  TeamRow,
} from "@/lib/db";
import { getStore } from "@/lib/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "system_admin" && user.role !== "team_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const store = getStore();
  let teams: TeamRow[] = [];

  if (user.role === "system_admin") {
    teams = await store.listTeams();
  } else if (user.team_id) {
    const t = await store.getTeam(user.team_id);
    if (t) teams = [t];
  }

  const users =
    user.role === "system_admin"
      ? await store.listUsers()
      : user.team_id
      ? await store.listUsers(user.team_id)
      : [];

  const memberCountByTeam = new Map<string, number>();
  for (const u of users) {
    if (u.team_id) {
      memberCountByTeam.set(
        u.team_id,
        (memberCountByTeam.get(u.team_id) ?? 0) + 1
      );
    }
  }

  const enriched = teams.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    monthlyTokenLimit: t.monthly_token_limit,
    monthlyTokens: getEffectiveMonthlyTokens(t),
    memberCount: memberCountByTeam.get(t.id) ?? 0,
    isActive: t.is_active,
    createdAt: t.created_at,
  }));

  return NextResponse.json({ teams: enriched });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "system_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    monthlyTokenLimit?: number | null;
  };

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "チーム名を入力してください。" },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  const teamDoc: TeamRow = {
    id,
    name,
    description: (body.description ?? "").trim(),
    monthly_token_limit:
      typeof body.monthlyTokenLimit === "number" ? body.monthlyTokenLimit : null,
    usage_month: currentMonthKey(),
    usage_tokens: 0,
    is_active: true,
    created_at: now,
  };

  await getStore().createTeam(teamDoc);

  return NextResponse.json(
    {
      team: {
        id: teamDoc.id,
        name: teamDoc.name,
        description: teamDoc.description,
        monthlyTokenLimit: teamDoc.monthly_token_limit,
        monthlyTokens: 0,
        memberCount: 0,
        isActive: teamDoc.is_active,
        createdAt: teamDoc.created_at,
      },
    },
    { status: 201 }
  );
}
