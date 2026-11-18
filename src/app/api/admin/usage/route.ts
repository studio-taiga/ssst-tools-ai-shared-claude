import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { COL, UsageMonthlyRow } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function GET() {
  const current = await getCurrentUser();
  if (
    !current ||
    (current.role !== "system_admin" && current.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getFirestoreDb();
  let records: UsageMonthlyRow[] = [];

  if (current.role === "system_admin") {
    const snap = await db.collection(COL.USAGE_MONTHLY).get();
    records = snap.docs.map((d) => d.data() as UsageMonthlyRow);
  } else if (current.team_id) {
    const snap = await db
      .collection(COL.USAGE_MONTHLY)
      .where("team_id", "==", current.team_id)
      .get();
    records = snap.docs.map((d) => d.data() as UsageMonthlyRow);
  }

  records.sort((a, b) => {
    const mCmp = b.month.localeCompare(a.month);
    if (mCmp !== 0) return mCmp;
    return b.total_tokens - a.total_tokens;
  });

  const months = Array.from(new Set(records.map((r) => r.month))).sort((a, b) =>
    b.localeCompare(a)
  );

  return NextResponse.json({ records, months });
}
