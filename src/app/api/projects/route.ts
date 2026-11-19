import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { nowIso, ProjectRow } from "@/lib/db";
import { getStore } from "@/lib/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await getStore().listProjects(user.id);
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    systemPrompt?: string;
  };

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "プロジェクト名を入力してください。" },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const now = nowIso();

  const projectDoc: ProjectRow = {
    id,
    user_id: user.id,
    name,
    description: (body.description ?? "").trim(),
    system_prompt: body.systemPrompt ?? "",
    created_at: now,
    updated_at: now,
  };

  await getStore().createProject(projectDoc);
  return NextResponse.json({ project: projectDoc }, { status: 201 });
}
