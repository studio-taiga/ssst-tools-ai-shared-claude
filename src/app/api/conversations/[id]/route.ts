import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { nowIso } from "@/lib/db";
import { getStore } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const store = getStore();
  const conversation = await store.getConversation(id);
  if (!conversation || conversation.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let projectName: string | null = null;
  if (conversation.project_id) {
    const proj = await store.getProject(conversation.project_id);
    if (proj) projectName = proj.name;
  }

  const messages = await store.listMessages(id);

  return NextResponse.json({
    conversation: { ...conversation, project_name: projectName },
    messages,
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const store = getStore();
  const existing = await store.getConversation(id);
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    title?: string;
    model?: string;
    projectId?: string | null;
    connectionId?: string | null;
    isPinned?: boolean;
  };

  if (body.projectId) {
    const proj = await store.getProject(body.projectId);
    if (!proj || proj.user_id !== user.id) {
      return NextResponse.json(
        { error: "指定されたプロジェクトが見つかりません。" },
        { status: 404 }
      );
    }
  }

  const nextProjectId =
    body.projectId !== undefined ? body.projectId : existing.project_id;

  await store.updateConversation(id, {
    title:
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : existing.title,
    model:
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : existing.model,
    project_id: nextProjectId,
    connection_id:
      body.connectionId !== undefined
        ? body.connectionId
        : existing.connection_id,
    is_pinned:
      typeof body.isPinned === "boolean"
        ? body.isPinned
        : Boolean(existing.is_pinned),
    updated_at: nowIso(),
  });

  const updated = (await store.getConversation(id))!;
  let projectName: string | null = null;
  if (updated.project_id) {
    const proj = await store.getProject(updated.project_id);
    if (proj) projectName = proj.name;
  }

  return NextResponse.json({
    conversation: { ...updated, project_name: projectName },
  });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const store = getStore();
  const existing = await store.getConversation(id);
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await store.deleteConversationAndMessages(id);
  return NextResponse.json({ ok: true });
}
