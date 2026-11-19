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
  const project = await store.getProject(id);
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const files = await store.listProjectFiles(id, user.id);
  return NextResponse.json({ project, files });
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
  const project = await store.getProject(id);
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    systemPrompt?: string;
  };

  await store.updateProject(id, {
    name:
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : project.name,
    description:
      typeof body.description === "string"
        ? body.description.trim()
        : project.description,
    system_prompt:
      typeof body.systemPrompt === "string"
        ? body.systemPrompt
        : project.system_prompt,
    updated_at: nowIso(),
  });

  const updated = await store.getProject(id);
  return NextResponse.json({ project: updated });
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
  const project = await store.getProject(id);
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await store.deleteProjectAndFiles(id, user.id);
  return NextResponse.json({ ok: true });
}
