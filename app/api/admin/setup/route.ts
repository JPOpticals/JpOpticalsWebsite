import type { NextRequest } from "next/server";
import { adminSetupStatus, createInitialAdmin } from "../../../../lib/admin";
import { errorResponse, HttpError, json } from "../../../../lib/http";
import { setSessionCookies } from "../../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ ok: true, ...(await adminSetupStatus()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; email?: unknown; password?: unknown }
      | null;
    if (!body) throw new HttpError(400, "Invalid request body.");

    const result = await createInitialAdmin({
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
    });

    const response = json({ ok: true, user: result.user });
    setSessionCookies(response, result.session);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
