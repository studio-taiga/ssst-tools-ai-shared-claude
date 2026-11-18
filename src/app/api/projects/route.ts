import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { COL, nowIso, ProjectRow } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getFirestoreDb();
  const snap = await db
    .collection(COL.PROJECTS)
    .where("user_id", "==", user.id)
    .orderBy("updated_at", "desc")
    .get();

  const projects = snap.docs.map((d) => d.data() as ProjectRow);
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

  const db = getFirestoreDb();
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

  await db.collection(COL.PROJECTS).doc(id).set(projectDoc);
  return NextResponse.json({ project: projectDoc }, { status: 201 });
}
