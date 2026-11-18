import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { COL, nowIso, ProjectFileRow, ProjectRow } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

const MAX_FILE_BYTES = 512 * 1024;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = getFirestoreDb();
  const projRef = db.collection(COL.PROJECTS).doc(id);
  const projSnap = await projRef.get();
  if (!projSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = projSnap.data() as ProjectRow;
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    filename?: string;
    content?: string;
  };

  const filename = (body.filename ?? "").trim();
  const content = body.content ?? "";

  if (!filename || !content.trim()) {
    return NextResponse.json(
      { error: "ファイル名と内容を入力してください。" },
      { status: 400 }
    );
  }

  const sizeBytes = Buffer.byteLength(content, "utf8");
  if (sizeBytes > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "ナレッジファイルは1件あたり512KB以内にしてください。" },
      { status: 400 }
    );
  }

  const fileId = crypto.randomUUID();
  const now = nowIso();
  const fileDoc: ProjectFileRow = {
    id: fileId,
    project_id: id,
    user_id: user.id,
    filename,
    content,
    size_bytes: sizeBytes,
    created_at: now,
  };

  await db.collection(COL.PROJECT_FILES).doc(fileId).set(fileDoc);
  await projRef.update({ updated_at: now });

  return NextResponse.json({ file: fileDoc }, { status: 201 });
}
