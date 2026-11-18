import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  COL,
  ConversationRow,
  MessageRow,
  nowIso,
  ProjectRow,
} from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = getFirestoreDb();
  const convSnap = await db.collection(COL.CONVERSATIONS).doc(id).get();
  if (!convSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conversation = convSnap.data() as ConversationRow;
  if (conversation.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let projectName: string | null = null;
  if (conversation.project_id) {
    const projSnap = await db
      .collection(COL.PROJECTS)
      .doc(conversation.project_id)
      .get();
    if (projSnap.exists) {
      projectName = (projSnap.data() as ProjectRow).name;
    }
  }

  const msgSnap = await db
    .collection(COL.MESSAGES)
    .where("conversation_id", "==", id)
    .orderBy("created_at", "asc")
    .get();
  const messages = msgSnap.docs.map((d) => d.data() as MessageRow);

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
  const db = getFirestoreDb();
  const ref = db.collection(COL.CONVERSATIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = snap.data() as ConversationRow;
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    title?: string;
    model?: string;
    projectId?: string | null;
    connectionId?: string | null;
  };

  if (body.projectId) {
    const projSnap = await db
      .collection(COL.PROJECTS)
      .doc(body.projectId)
      .get();
    if (
      !projSnap.exists ||
      (projSnap.data() as ProjectRow).user_id !== user.id
    ) {
      return NextResponse.json(
        { error: "指定されたプロジェクトが見つかりません。" },
        { status: 404 }
      );
    }
  }

  const nextProjectId =
    body.projectId !== undefined ? body.projectId : existing.project_id;

  await ref.update({
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
    updated_at: nowIso(),
  });

  const updated = (await ref.get()).data() as ConversationRow;
  let projectName: string | null = null;
  if (updated.project_id) {
    const projSnap = await db
      .collection(COL.PROJECTS)
      .doc(updated.project_id)
      .get();
    if (projSnap.exists) {
      projectName = (projSnap.data() as ProjectRow).name;
    }
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
  const db = getFirestoreDb();
  const ref = db.collection(COL.CONVERSATIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = snap.data() as ConversationRow;
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const msgSnap = await db
    .collection(COL.MESSAGES)
    .where("conversation_id", "==", id)
    .get();
  const batch = db.batch();
  for (const m of msgSnap.docs) {
    batch.delete(m.ref);
  }
  batch.delete(ref);
  await batch.commit();

  return NextResponse.json({ ok: true });
}
