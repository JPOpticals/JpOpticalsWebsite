import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "../../../../lib/env";
import { errorResponse, json } from "../../../../lib/http";
import { applyAuthCookies, readAuth } from "../../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await readAuth(request);
    const response = json({
      ok: true,
      configured: isSupabaseConfigured,
      user: auth.user,
    });
    applyAuthCookies(response, auth);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
