import { errorResponse, json } from "../../../../lib/http";
import { clearSessionCookies } from "../../../../lib/supabase/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const response = json({ ok: true });
    clearSessionCookies(response);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
