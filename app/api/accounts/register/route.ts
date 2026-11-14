import type { NextRequest } from "next/server";
import { registerCustomer } from "../../../../lib/accounts";
import { errorResponse, HttpError, json } from "../../../../lib/http";
import { setSessionCookies } from "../../../../lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; email?: unknown; password?: unknown }
      | null;
    if (!body) throw new HttpError(400, "Invalid request body.");

    const result = await registerCustomer({
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
