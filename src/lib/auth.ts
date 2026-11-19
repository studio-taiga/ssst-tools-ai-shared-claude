import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signSessionToken, verifySessionToken } from "./crypto";
import {
  getEffectiveMonthlyTokens,
  UserRole,
  UserRow,
} from "./db";
import { getStore } from "./store";

export const SESSION_COOKIE_NAME = "shared_claude_session";

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  teamId: string | null;
  teamName: string | null;
  customInstructions: string;
  defaultModel: string;
  defaultConnectionId: string | null;
  monthlyTokenLimit: number | null;
  monthlyTokens: number;
  isActive: boolean;
  createdAt: string;
}

export async function toPublicUser(
  row: UserRow,
  teamName?: string | null
): Promise<PublicUser> {
  let resolvedTeamName = teamName ?? null;
  if (resolvedTeamName === null && row.team_id) {
    const team = await getStore().getTeam(row.team_id);
    if (team) {
      resolvedTeamName = team.name;
    }
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    teamId: row.team_id,
    teamName: resolvedTeamName,
    customInstructions: row.custom_instructions,
    defaultModel: row.default_model,
    defaultConnectionId: row.default_connection_id,
    monthlyTokenLimit: row.monthly_token_limit,
    monthlyTokens: getEffectiveMonthlyTokens(row),
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export async function hasAnyUsers(): Promise<boolean> {
  return getStore().hasAnyUsers();
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await getStore().getUser(payload.userId);
  if (!user || !user.is_active) return null;

  return user;
}

export async function setSessionCookie(
  res: NextResponse,
  userId: string
): Promise<void> {
  const token = await signSessionToken(userId);
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_INSECURE_COOKIE !== "1",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
