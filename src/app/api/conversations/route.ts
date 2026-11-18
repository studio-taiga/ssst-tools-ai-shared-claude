import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { COL, ConversationRow, nowIso, ProjectRow } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  const db = getFirestoreDb();

  let query = db
    .collection(COL.CONVERSATIONS)
    .where("user_id", "==", user.id);

  if (projectId) {
    query = query.where("project_id", "==", projectId);
  }

  const snap = await query.orderBy("updated_at", "desc").get();
  const rows = snap.docs.map((d) => d.data() as ConversationRow);

  const projectsSnap = await db
    .collection(COL.PROJECTS)
    .where("user_id", "==", user.id)
    .get();
  const projectMap = new Map<string, string>();
  for (const doc of projectsSnap.docs) {
    const p = doc.data() as ProjectRow;
    projectMap.set(p.id, p.name);
  }

  const conversations = rows.map((c) => ({
    ...c,
    project_name: c.project_id ? projectMap.get(c.project_id) ?? null : null,
  }));

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

  const db = getFirestoreDb();
  let projectName: string | null = null;

  if (body.projectId) {
    const projSnap = await db
      .collection(COL.PROJECTS)
      .doc(body.projectId)
      .get();
    if (!projSnap.exists) {
      return NextResponse.json(
        { error: "指定されたプロジェクトが見つかりません。" },
        { status: 404 }
      );
    }
    const proj = projSnap.data() as ProjectRow;
    if (proj.user_id !== user.id) {
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
    created_at: now,
    updated_at: now,
  };

  await db.collection(COL.CONVERSATIONS).doc(id).set(convDoc);

  return NextResponse.json(
    { conversation: { ...convDoc, project_name: projectName } },
    { status: 201 }
  );
}
