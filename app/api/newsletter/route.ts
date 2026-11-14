import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "../../../lib/env";
import { errorResponse, HttpError, json } from "../../../lib/http";
import { getAdminClient } from "../../../lib/supabase/admin";

export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) {
      throw new HttpError(503, "The newsletter service is not configured.");
    }
    const body = (await request.json().catch(() => null)) as
      | { email?: unknown; source?: unknown }
      | null;
    if (!body) throw new HttpError(400, "Invalid request body.");

    const email = String(body.email ?? "").trim().toLowerCase();
    const source = String(body.source ?? "footer").trim().slice(0, 40) || "footer";
    if (!emailPattern.test(email)) throw new HttpError(400, "Enter a valid email address.");

    const admin = getAdminClient();
    const { data: existing, error: lookupError } = await admin
      .from("newsletter_subscribers")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (lookupError) throw new HttpError(400, lookupError.message);

    if (existing?.id) {
      const { error } = await admin
        .from("newsletter_subscribers")
        .update({ is_active: true, source })
        .eq("id", existing.id);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true, subscribed: true, existing: true });
    }

    const { error } = await admin
      .from("newsletter_subscribers")
      .insert({ email, source, is_active: true });
    if (error) throw new HttpError(400, error.message);
    return json({ ok: true, subscribed: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
