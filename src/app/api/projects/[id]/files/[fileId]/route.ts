import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { COL, nowIso, ProjectFileRow } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, fileId } = await context.params;
  const db = getFirestoreDb();
  const fileRef = db.collection(COL.PROJECT_FILES).doc(fileId);
  const fileSnap = await fileRef.get();
  if (!fileSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = fileSnap.data() as ProjectFileRow;
  if (file.project_id !== id || file.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await fileRef.delete();
  await db.collection(COL.PROJECTS).doc(id).update({ updated_at: nowIso() });

  return NextResponse.json({ ok: true });
}
