import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { getStore } from "@/lib/store";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    displayName?: string;
    customInstructions?: string;
    defaultModel?: string;
    defaultConnectionId?: string | null;
    currentPassword?: string;
    newPassword?: string;
  };

  const displayName =
    typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim()
      : user.display_name;
  const customInstructions =
    typeof body.customInstructions === "string"
      ? body.customInstructions
      : user.custom_instructions;
  const defaultModel =
    typeof body.defaultModel === "string" && body.defaultModel.trim()
      ? body.defaultModel.trim()
      : user.default_model;
  const defaultConnectionId =
    body.defaultConnectionId !== undefined
      ? body.defaultConnectionId
      : user.default_connection_id;

  let passwordHash = user.password_hash;
  if (body.newPassword) {
    if (
      !body.currentPassword ||
      !verifyPassword(body.currentPassword, user.password_hash)
    ) {
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません。" },
        { status: 400 }
      );
    }
    if (body.newPassword.length < 6) {
      return NextResponse.json(
        { error: "新しいパスワードは6文字以上で入力してください。" },
        { status: 400 }
      );
    }
    passwordHash = hashPassword(body.newPassword);
  }

  const store = getStore();
  await store.updateUser(user.id, {
    display_name: displayName,
    custom_instructions: customInstructions,
    default_model: defaultModel,
    default_connection_id: defaultConnectionId,
    password_hash: passwordHash,
  });

  const updated = await store.getUser(user.id);
  return NextResponse.json({ user: await toPublicUser(updated!) });
}
