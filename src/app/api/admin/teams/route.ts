import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  COL,
  currentMonthKey,
  getEffectiveMonthlyTokens,
  nowIso,
  TeamRow,
  UserRow,
} from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "system_admin" && user.role !== "team_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getFirestoreDb();
  let teams: TeamRow[] = [];

  if (user.role === "system_admin") {
    const snap = await db
      .collection(COL.TEAMS)
      .orderBy("created_at", "asc")
      .get();
    teams = snap.docs.map((d) => d.data() as TeamRow);
  } else if (user.team_id) {
    const snap = await db.collection(COL.TEAMS).doc(user.team_id).get();
    if (snap.exists) {
      teams = [snap.data() as TeamRow];
    }
  }

  const usersSnap =
    user.role === "system_admin"
      ? await db.collection(COL.USERS).get()
      : user.team_id
      ? await db
          .collection(COL.USERS)
          .where("team_id", "==", user.team_id)
          .get()
      : null;

  const memberCountByTeam = new Map<string, number>();
  if (usersSnap) {
    for (const doc of usersSnap.docs) {
      const u = doc.data() as UserRow;
      if (u.team_id) {
        memberCountByTeam.set(
          u.team_id,
          (memberCountByTeam.get(u.team_id) ?? 0) + 1
        );
      }
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

  const db = getFirestoreDb();
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

  await db.collection(COL.TEAMS).doc(id).set(teamDoc);

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
