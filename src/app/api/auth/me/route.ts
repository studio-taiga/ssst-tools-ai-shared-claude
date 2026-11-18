import { connection, NextResponse } from "next/server";
import { getCurrentUser, hasAnyUsers, toPublicUser } from "@/lib/auth";
import { getEffectiveMonthlyTokens } from "@/lib/db";

export async function GET() {
  await connection();
  try {
    const needsSetup = !(await hasAnyUsers());
    if (needsSetup) {
      return NextResponse.json({
        needsSetup: true,
        user: null,
        monthlyTokens: 0,
      });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({
        needsSetup: false,
        user: null,
        monthlyTokens: 0,
      });
    }

    const publicUser = await toPublicUser(user);
    return NextResponse.json({
      needsSetup: false,
      user: publicUser,
      monthlyTokens: getEffectiveMonthlyTokens(user),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        needsSetup: false,
        user: null,
        monthlyTokens: 0,
        error: `Firestore接続エラー: ${message}`,
      },
      { status: 500 }
    );
  }
}
