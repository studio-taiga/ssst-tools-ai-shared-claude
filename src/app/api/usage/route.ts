import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const records = (await getStore().listUsageMonthly({ userId: user.id })).sort(
    (a, b) => b.month.localeCompare(a.month)
  );

  return NextResponse.json({ records });
}
