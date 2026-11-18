import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { COL, nowIso, ProjectFileRow, ProjectRow } from "@/lib/db";
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
  const projSnap = await db.collection(COL.PROJECTS).doc(id).get();
  if (!projSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = projSnap.data() as ProjectRow;
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filesSnap = await db
    .collection(COL.PROJECT_FILES)
    .where("project_id", "==", id)
    .where("user_id", "==", user.id)
    .orderBy("created_at", "desc")
    .get();

  const files = filesSnap.docs.map((d) => d.data() as ProjectFileRow);
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
  const db = getFirestoreDb();
  const ref = db.collection(COL.PROJECTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = snap.data() as ProjectRow;
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    systemPrompt?: string;
  };

  await ref.update({
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

  const updated = (await ref.get()).data() as ProjectRow;
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
  const db = getFirestoreDb();
  const ref = db.collection(COL.PROJECTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = snap.data() as ProjectRow;
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filesSnap = await db
    .collection(COL.PROJECT_FILES)
    .where("project_id", "==", id)
    .where("user_id", "==", user.id)
    .get();

  const batch = db.batch();
  for (const f of filesSnap.docs) {
    batch.delete(f.ref);
  }
  batch.delete(ref);
  await batch.commit();

  return NextResponse.json({ ok: true });
}
