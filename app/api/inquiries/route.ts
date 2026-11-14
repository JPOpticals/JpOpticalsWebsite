import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "../../../lib/env";
import { errorResponse, HttpError, json } from "../../../lib/http";
import { getAdminClient } from "../../../lib/supabase/admin";

export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) {
      throw new HttpError(503, "The contact service is not configured.");
    }
    const body = (await request.json().catch(() => null)) as
      | {
          name?: unknown;
          email?: unknown;
          phone?: unknown;
          subject?: unknown;
          message?: unknown;
          source?: unknown;
        }
      | null;
    if (!body) throw new HttpError(400, "Invalid request body.");

    const email = String(body.email ?? "").trim().toLowerCase();
    const message = String(body.message ?? "").trim();
    const name = String(body.name ?? "").trim() || null;
    const phone = String(body.phone ?? "").trim() || null;
    const subject = String(body.subject ?? "").trim() || null;
    const source = ["contact", "product", "support", "other"].includes(String(body.source))
      ? String(body.source)
      : "contact";

    if (!emailPattern.test(email)) throw new HttpError(400, "Enter a valid email address.");
    if (message.length < 4 || message.length > 5000) {
      throw new HttpError(400, "Message must be between 4 and 5000 characters.");
    }

    const { data, error } = await getAdminClient()
      .from("inquiries")
      .insert({ name, email, phone, subject, message, source })
      .select("id,created_at")
      .single();

    if (error) throw new HttpError(400, error.message);
    return json({ ok: true, inquiry: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
