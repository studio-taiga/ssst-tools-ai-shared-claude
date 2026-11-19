import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConversationRow, nowIso } from "@/lib/db";
import { getStore } from "@/lib/store";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  const store = getStore();
  const [rows, projects] = await Promise.all([
    store.listConversations(user.id, projectId),
    store.listProjects(user.id),
  ]);

  const projectMap = new Map<string, string>();
  for (const p of projects) {
    projectMap.set(p.id, p.name);
  }

  const conversations = rows
    .map((c) => ({
      ...c,
      is_pinned: Boolean(c.is_pinned),
      project_name: c.project_id ? projectMap.get(c.project_id) ?? null : null,
    }))
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    projectId?: string | null;
    connectionId?: string | null;
    model?: string;
  };

  const store = getStore();
  let projectName: string | null = null;

  if (body.projectId) {
    const proj = await store.getProject(body.projectId);
    if (!proj || proj.user_id !== user.id) {
      return NextResponse.json(
        { error: "指定されたプロジェクトが見つかりません。" },
        { status: 404 }
      );
    }
    projectName = proj.name;
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  const title = (body.title ?? "").trim() || "新しいチャット";
  const model = (body.model ?? "").trim() || user.default_model;
  const connectionId =
    body.connectionId !== undefined
      ? body.connectionId
      : user.default_connection_id;

  const convDoc: ConversationRow = {
    id,
    user_id: user.id,
    project_id: body.projectId ?? null,
    connection_id: connectionId ?? null,
    title,
    model,
    is_pinned: false,
    created_at: now,
    updated_at: now,
  };

  await store.createConversation(convDoc);

  return NextResponse.json(
    { conversation: { ...convDoc, project_name: projectName } },
    { status: 201 }
  );
}
