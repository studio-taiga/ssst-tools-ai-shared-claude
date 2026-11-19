import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { nowIso } from "@/lib/db";
import { getStore } from "@/lib/store";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, fileId } = await context.params;
  const store = getStore();
  const file = await store.getProjectFile(fileId);
  if (!file || file.project_id !== id || file.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await store.deleteProjectFile(fileId);
  await store.updateProject(id, { updated_at: nowIso() });

  return NextResponse.json({ ok: true });
}
