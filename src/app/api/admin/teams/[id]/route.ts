import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { COL, getEffectiveMonthlyTokens, TeamRow } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "system_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const db = getFirestoreDb();
  const ref = db.collection(COL.TEAMS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = snap.data() as TeamRow;
  const body = (await req.json()) as {
    name?: string;
    description?: string;
    monthlyTokenLimit?: number | null;
    isActive?: boolean;
  };

  await ref.update({
    name:
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : existing.name,
    description:
      typeof body.description === "string"
        ? body.description.trim()
        : existing.description,
    monthly_token_limit:
      body.monthlyTokenLimit !== undefined
        ? body.monthlyTokenLimit
        : existing.monthly_token_limit,
    is_active:
      typeof body.isActive === "boolean" ? body.isActive : existing.is_active,
  });

  const updated = (await ref.get()).data() as TeamRow;
  return NextResponse.json({
    team: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      monthlyTokenLimit: updated.monthly_token_limit,
      monthlyTokens: getEffectiveMonthlyTokens(updated),
      isActive: updated.is_active,
      createdAt: updated.created_at,
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "system_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const db = getFirestoreDb();
  const ref = db.collection(COL.TEAMS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.team_id === id) {
    return NextResponse.json(
      { error: "自分自身が所属しているチームは削除できません。" },
      { status: 400 }
    );
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
