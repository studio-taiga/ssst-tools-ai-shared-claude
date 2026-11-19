import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEffectiveMonthlyTokens } from "@/lib/db";
import { getStore } from "@/lib/store";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "system_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const store = getStore();
  const existing = await store.getTeam(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    monthlyTokenLimit?: number | null;
    isActive?: boolean;
  };

  await store.updateTeam(id, {
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

  const updated = (await store.getTeam(id))!;
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
  const store = getStore();
  const existing = await store.getTeam(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.team_id === id) {
    return NextResponse.json(
      { error: "自分自身が所属しているチームは削除できません。" },
      { status: 400 }
    );
  }

  await store.deleteTeam(id);
  return NextResponse.json({ ok: true });
}
