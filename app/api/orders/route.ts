import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "../../../lib/env";
import { errorResponse, HttpError, json } from "../../../lib/http";
import { getAdminClient } from "../../../lib/supabase/admin";
import { readAuth } from "../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type OrderItemInput = {
  productId?: unknown;
  variantId?: unknown;
  customizerFrameId?: unknown;
  customizerLensId?: unknown;
  quantity?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) throw new HttpError(503, "Orders are not configured.");
    const auth = await readAuth(request);
    if (!auth.user) throw new HttpError(401, "Please sign in to view your orders.");

    const { data, error } = await getAdminClient()
      .from("orders")
      .select(
        "id,order_number,status,payment_status,fulfillment_status,subtotal,shipping_total,tax_total,discount_total,total,currency,placed_at,order_items(id,product_id,name,image_url,unit_price,quantity,line_total)",
      )
      .eq("customer_id", auth.user.id)
      .order("placed_at", { ascending: false })
      .limit(50);

    if (error) throw new HttpError(400, error.message);
    return json({ ok: true, orders: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) throw new HttpError(503, "Orders are not configured.");

    const body = (await request.json().catch(() => null)) as
      | {
          email?: unknown;
          items?: unknown;
          shippingAddress?: unknown;
          billingAddress?: unknown;
          notes?: unknown;
        }
      | null;
    if (!body) throw new HttpError(400, "Invalid request body.");

    const auth = await readAuth(request);
    const email = String(body.email ?? auth.user?.email ?? "").trim().toLowerCase();
    if (!emailPattern.test(email)) throw new HttpError(400, "Enter a valid email address.");

    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
      throw new HttpError(400, "Your bag is empty.");
    }

    const items = (body.items as OrderItemInput[]).map((item) => {
      const productId = Number(item.productId);
      const quantity = Math.min(20, Math.max(1, Number(item.quantity) || 1));
      const variantId = Number(item.variantId);
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new HttpError(400, "Invalid product in order.");
      }
      const customizerFrameId = String(item.customizerFrameId ?? "").trim();
      const customizerLensId = String(item.customizerLensId ?? "").trim();
      if ((customizerFrameId && !customizerLensId) || (!customizerFrameId && customizerLensId)) {
        throw new HttpError(400, "A custom frame and lens must be selected together.");
      }
      return {
        productId,
        quantity,
        ...(Number.isInteger(variantId) && variantId > 0 ? { variantId } : {}),
        ...(customizerFrameId && customizerLensId
          ? { customizerFrameId, customizerLensId }
          : {}),
      };
    });

    const { data, error } = await getAdminClient().rpc("place_order", {
      p_email: email,
      p_items: items,
      p_customer_id: auth.user?.id ?? null,
      p_shipping_address: body.shippingAddress ?? null,
      p_billing_address: body.billingAddress ?? null,
      p_notes: String(body.notes ?? "").trim() || null,
      p_metadata: { payment_provider: "none" },
    });

    if (error) throw new HttpError(400, error.message);
    const order = Array.isArray(data) ? data[0] : data;
    return json(
      {
        ok: true,
        order: order
          ? {
              id: order.id,
              orderNumber: order.order_number,
              status: order.status,
              total: order.total,
              currency: order.currency,
            }
          : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
