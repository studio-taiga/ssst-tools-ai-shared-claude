import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie, toPublicUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { COL, UserRow } from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    username?: string;
    password?: string;
  };

  const username = (body.username ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "ユーザー名とパスワードを入力してください。" },
      { status: 400 }
    );
  }

  const db = getFirestoreDb();
  const snap = await db
    .collection(COL.USERS)
    .where("username", "==", username)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json(
      { error: "ユーザー名またはパスワードが正しくありません。" },
      { status: 401 }
    );
  }

  const user = snap.docs[0].data() as UserRow;
  if (!verifyPassword(password, user.password_hash)) {
    return NextResponse.json(
      { error: "ユーザー名またはパスワードが正しくありません。" },
      { status: 401 }
    );
  }

  if (!user.is_active) {
    return NextResponse.json(
      { error: "このアカウントは無効化されています。管理者に連絡してください。" },
      { status: 403 }
    );
  }

  const res = NextResponse.json({ user: await toPublicUser(user) });
  await setSessionCookie(res, user.id);
  return res;
}
