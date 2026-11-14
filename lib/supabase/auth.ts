import type { NextRequest, NextResponse } from "next/server";
import type { Session, User } from "@supabase/supabase-js";
import {
  AUTH_COOKIE_ACCESS,
  AUTH_COOKIE_REFRESH,
  isSupabaseConfigured,
} from "../env";
import { HttpError } from "../http";
import { getAdminClient } from "./admin";
import { getAnonClient } from "./anon";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: "customer" | "admin";
  phone: string | null;
};

export type AuthResult = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  refreshedSession: Session | null;
};

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function profileFor(user: User): Promise<AuthUser> {
  const fallbackName =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Account";

  if (!isSupabaseConfigured) {
    return {
      id: user.id,
      email: user.email ?? "",
      fullName: fallbackName,
      role: "customer",
      phone: null,
    };
  }

  try {
    const { data } = await getAdminClient()
      .from("customers")
      .select("id, email, full_name, role, phone")
      .eq("id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: data?.email || user.email || "",
      fullName: data?.full_name || fallbackName,
      role: data?.role === "admin" ? "admin" : "customer",
      phone: data?.phone ?? null,
    };
  } catch {
    return {
      id: user.id,
      email: user.email ?? "",
      fullName: fallbackName,
      role: "customer",
      phone: null,
    };
  }
}

export async function readAuth(request: NextRequest): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { user: null, accessToken: null, refreshToken: null, refreshedSession: null };
  }

  const cookieAccess = request.cookies.get(AUTH_COOKIE_ACCESS)?.value ?? null;
  const cookieRefresh = request.cookies.get(AUTH_COOKIE_REFRESH)?.value ?? null;
  const accessToken = bearerToken(request) || cookieAccess;
  const refreshToken = cookieRefresh;
  const anon = getAnonClient();

  if (accessToken) {
    try {
      const { data, error } = await anon.auth.getUser(accessToken);
      if (!error && data.user) {
        return {
          user: await profileFor(data.user),
          accessToken,
          refreshToken,
          refreshedSession: null,
        };
      }
    } catch {
      // Fall through to the refresh-token path.
    }
  }

  if (refreshToken) {
    try {
      const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
      if (!error && data.session && data.user) {
        return {
          user: await profileFor(data.user),
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          refreshedSession: data.session,
        };
      }
    } catch {
      // Treat an expired refresh token as signed out.
    }
  }

  return { user: null, accessToken: null, refreshToken: null, refreshedSession: null };
}

export async function requireUser(request: NextRequest) {
  const auth = await readAuth(request);
  if (!auth.user) throw new HttpError(401, "Please sign in to continue.");
  return auth;
}

export async function requireAdmin(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.user?.role !== "admin") {
    throw new HttpError(403, "Administrator access is required.");
  }
  return auth;
}

export function setSessionCookies(
  response: NextResponse,
  session: Pick<Session, "access_token" | "refresh_token" | "expires_in">,
) {
  const accessMaxAge = Math.max(60, session.expires_in ?? 3600);
  response.cookies.set(AUTH_COOKIE_ACCESS, session.access_token, cookieOptions(accessMaxAge));
  response.cookies.set(
    AUTH_COOKIE_REFRESH,
    session.refresh_token,
    cookieOptions(60 * 60 * 24 * 30),
  );
}

export function applyAuthCookies(response: NextResponse, auth: AuthResult) {
  if (auth.refreshedSession) setSessionCookies(response, auth.refreshedSession);
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_ACCESS, "", cookieOptions(0));
  response.cookies.set(AUTH_COOKIE_REFRESH, "", cookieOptions(0));
}
