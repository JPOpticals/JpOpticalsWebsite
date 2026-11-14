import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "../../../lib/env";
import { errorResponse, HttpError, json } from "../../../lib/http";
import { getAdminClient } from "../../../lib/supabase/admin";
import { requireUser } from "../../../lib/supabase/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) {
      return json({ ok: true, reviews: [] });
    }
    const productId = request.nextUrl.searchParams.get("productId");
    const admin = getAdminClient();
    let query = admin
      .from("reviews")
      .select("id,product_id,author_name,rating,title,body,created_at,is_verified")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(50);
    if (productId && /^\d+$/.test(productId)) {
      query = query.eq("product_id", Number(productId));
    }
    const { data, error } = await query;
    if (error) throw new HttpError(500, error.message);
    return json({ ok: true, reviews: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) throw new HttpError(503, "Reviews are not configured.");
    const auth = await requireUser(request);
    const body = (await request.json().catch(() => null)) as
      | { productId?: unknown; rating?: unknown; title?: unknown; body?: unknown }
      | null;
    if (!body) throw new HttpError(400, "Invalid request body.");

    const productId = Number(body.productId);
    const rating = Number(body.rating);
    const text = String(body.body ?? "").trim();
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new HttpError(400, "A product is required.");
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpError(400, "Rating must be between 1 and 5.");
    }
    if (text.length < 4 || text.length > 4000) {
      throw new HttpError(400, "Review must be between 4 and 4000 characters.");
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("reviews")
      .insert({
        product_id: productId,
        customer_id: auth.user!.id,
        author_name: auth.user!.fullName,
        author_email: auth.user!.email,
        rating,
        title: String(body.title ?? "").trim() || null,
        body: text,
        source: "site",
        status: "pending",
      })
      .select("id,status,created_at")
      .single();

    if (error) throw new HttpError(400, error.message);
    return json({ ok: true, review: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
