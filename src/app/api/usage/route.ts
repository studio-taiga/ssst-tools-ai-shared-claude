import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { COL, UsageMonthlyRow } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getFirestoreDb();
  const snap = await db
    .collection(COL.USAGE_MONTHLY)
    .where("user_id", "==", user.id)
    .get();

  const records = snap.docs
    .map((d) => d.data() as UsageMonthlyRow)
    .sort((a, b) => b.month.localeCompare(a.month));

  return NextResponse.json({ records });
}
