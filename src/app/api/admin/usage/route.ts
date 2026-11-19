import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { UsageMonthlyRow } from "@/lib/db";
import { getStore } from "@/lib/store";

export async function GET() {
  const current = await getCurrentUser();
  if (
    !current ||
    (current.role !== "system_admin" && current.role !== "team_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const store = getStore();
  let records: UsageMonthlyRow[] = [];

  if (current.role === "system_admin") {
    records = await store.listUsageMonthly({});
  } else if (current.team_id) {
    records = await store.listUsageMonthly({ teamId: current.team_id });
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
