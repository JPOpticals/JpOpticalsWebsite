import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "../../../lib/env";
import { errorResponse, HttpError, json } from "../../../lib/http";
import { getAdminClient } from "../../../lib/supabase/admin";
import { readAuth } from "../../../lib/supabase/auth";
import {
  CUSTOMIZER_OPTIONS,
  computeCustomizerPricing,
  type CustomizerLineItem,
} from "../../../lib/customizer-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrderItemInput = {
  productId?: unknown;
  variantId?: unknown;
  customizerFrameId?: unknown;
  customizerLensId?: unknown;
  customizer?: unknown;
  quantity?: unknown;
  requirements?: unknown;
};

type CustomizerInput = {
  frameFinishId?: unknown;
  frameFinish?: unknown;
  lensShape?: unknown;
  lensDesign?: unknown;
  lensCut?: unknown;
  cornerStyle?: unknown;
  lensColorId?: unknown;
  lensColor?: unknown;
  lensColorCode?: unknown;
  lensOpacity?: unknown;
  lensTypeId?: unknown;
  lensType?: unknown;
  protectionIds?: unknown;
  afterWearIds?: unknown;
  engraving?: unknown;
  engravingPosition?: unknown;
  prescription?: unknown;
  view?: unknown;
  currency?: unknown;
};

type RawOrderItem = {
  productId: number;
  quantity: number;
  variantId?: number;
  customizerFrameId: string;
  customizerLensId: string;
  requirements: string;
  customizer: CustomizerInput | null;
};

type FramePricingRow = {
  id: string;
  name: string;
  price: number | string | null;
  currency: string | null;
};

type LensPricingRow = {
  id: string;
  name: string;
  price: number | string | null;
  currency: string | null;
  lens_type: string | null;
  color_code: string | null;
  tint_opacity: number | string | null;
};

const stringValue = (value: unknown, max = 120) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

const stringList = (value: unknown, max = 12) =>
  Array.isArray(value)
    ? value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

const parseCustomizer = (value: unknown): CustomizerInput | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as CustomizerInput;
};

const parsePrescription = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { left?: unknown; right?: unknown };
  const left = stringValue(record.left, 20);
  const right = stringValue(record.right, 20);
  return left || right ? { left, right } : null;
};

const parseView = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { rotation?: unknown; tilt?: unknown; zoom?: unknown };
  const rotation = Number(record.rotation);
  const tilt = Number(record.tilt);
  const zoom = Number(record.zoom);
  return {
    rotation: Number.isFinite(rotation) ? Math.max(-180, Math.min(180, rotation)) : 0,
    tilt: Number.isFinite(tilt) ? Math.max(-18, Math.min(18, tilt)) : 0,
    zoom: Number.isFinite(zoom) ? Math.max(0.78, Math.min(1.55, zoom)) : 1,
  };
};

const optionName = (list: { id: string; name: string }[], id: string) =>
  list.find((item) => item.id === id)?.name || id;

const describeCustomizer = (
  pricing: ReturnType<typeof computeCustomizerPricing>,
  frameName: string,
  lensName: string,
  prescription: { left: string; right: string } | null,
) => {
  const parts = [
    `Frame: ${frameName}`,
    `Finish: ${optionName(CUSTOMIZER_OPTIONS.finishes, pricing.frameFinishId)}`,
    `Lens: ${lensName}`,
    `Type: ${optionName(CUSTOMIZER_OPTIONS.lensTypes, pricing.lensTypeId)}`,
    prescription
      ? `Prescription L ${prescription.left || "—"} / R ${prescription.right || "—"}`
      : "",
    `Shape: ${optionName(CUSTOMIZER_OPTIONS.shapes, pricing.lensShape)}`,
    `Design: ${optionName(CUSTOMIZER_OPTIONS.designs, pricing.lensDesign)}`,
    `Cut: ${optionName(CUSTOMIZER_OPTIONS.cuts, pricing.lensCut)}`,
    `Corners: ${optionName(CUSTOMIZER_OPTIONS.corners, pricing.cornerStyle)}`,
    `Color: ${optionName(CUSTOMIZER_OPTIONS.colors, pricing.lensColorId)}`,
    `Protection: ${pricing.protectionIds
      .map((id) => optionName(CUSTOMIZER_OPTIONS.protections, id))
      .join(", ")}`,
    pricing.engraving
      ? `Engraving: “${pricing.engraving}” on ${pricing.engravingPosition}`
      : "",
    `After-wear: ${pricing.afterWearIds
      .map((id) => optionName(CUSTOMIZER_OPTIONS.afterWear, id))
      .join(", ")}`,
  ];
  return parts.filter(Boolean).join(" · ");
};

const lineItemsForMetadata = (lineItems: CustomizerLineItem[]) =>
  lineItems.map((item) => ({
    label: item.label,
    amount: item.amount,
    ...(item.base ? { base: true } : {}),
  }));

export async function GET(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) throw new HttpError(503, "Orders are not configured.");
    const auth = await readAuth(request);
    if (!auth.user) throw new HttpError(401, "Please sign in to view your orders.");

    const { data, error } = await getAdminClient()
      .from("orders")
      .select(
        "id,order_number,status,payment_status,fulfillment_status,subtotal,shipping_total,tax_total,discount_total,total,currency,placed_at,order_items(id,product_id,variant_id,name,image_url,unit_price,quantity,line_total,customer_requirements,metadata)",
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

    const rawItems = (body.items as OrderItemInput[]).map((item): RawOrderItem => {
      const productId = Number(item.productId);
      const quantity = Math.min(20, Math.max(1, Number(item.quantity) || 1));
      const variantId = Number(item.variantId);
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new HttpError(400, "Invalid product in order.");
      }
      const customizerFrameId = String(item.customizerFrameId ?? "").trim();
      const customizerLensId = String(item.customizerLensId ?? "").trim();
      const requirements = String(item.requirements ?? "").trim().slice(0, 1000);
      const customizer = parseCustomizer(item.customizer);
      if (customizer) {
        if (!uuidPattern.test(customizerFrameId) || !uuidPattern.test(customizerLensId)) {
          throw new HttpError(
            400,
            "Customization is temporarily unavailable. Please refresh and try again.",
          );
        }
      } else if (
        (customizerFrameId && !customizerLensId) ||
        (!customizerFrameId && customizerLensId)
      ) {
        throw new HttpError(400, "A custom frame and lens must be selected together.");
      }
      return {
        productId,
        quantity,
        ...(Number.isInteger(variantId) && variantId > 0 ? { variantId } : {}),
        customizerFrameId,
        customizerLensId,
        requirements,
        customizer,
      };
    });

    const customizerItems = rawItems.filter(
      (item) =>
        item.customizer &&
        uuidPattern.test(item.customizerFrameId) &&
        uuidPattern.test(item.customizerLensId),
    );

    const framePricing = new Map<string, FramePricingRow>();
    const lensPricing = new Map<string, LensPricingRow>();

    if (customizerItems.length) {
      const frameIds = [...new Set(customizerItems.map((item) => item.customizerFrameId))];
      const lensIds = [...new Set(customizerItems.map((item) => item.customizerLensId))];
      const admin = getAdminClient();
      const [framesResult, lensesResult] = await Promise.all([
        admin
          .from("customizer_frames")
          .select("id,name,price,currency")
          .in("id", frameIds),
        admin
          .from("customizer_lenses")
          .select("id,name,price,currency,lens_type,color_code,tint_opacity")
          .in("id", lensIds),
      ]);
      if (framesResult.error) throw new HttpError(400, framesResult.error.message);
      if (lensesResult.error) throw new HttpError(400, lensesResult.error.message);
      for (const row of (framesResult.data ?? []) as FramePricingRow[]) {
        framePricing.set(row.id, row);
      }
      for (const row of (lensesResult.data ?? []) as LensPricingRow[]) {
        lensPricing.set(row.id, row);
      }
    }

    const items = rawItems.map((item) => {
      if (!item.customizer) {
        return {
          productId: item.productId,
          quantity: item.quantity,
          ...(item.variantId ? { variantId: item.variantId } : {}),
          ...(item.customizerFrameId && item.customizerLensId
            ? {
                customizerFrameId: item.customizerFrameId,
                customizerLensId: item.customizerLensId,
              }
            : {}),
          ...(item.requirements ? { requirements: item.requirements } : {}),
        };
      }

      const frame = framePricing.get(item.customizerFrameId);
      const lens = lensPricing.get(item.customizerLensId);
      if (!frame || !lens) {
        throw new HttpError(400, "The selected frame or lens is unavailable.");
      }

      const prescription = parsePrescription(item.customizer.prescription);
      const pricing = computeCustomizerPricing({
        framePrice: Number(frame.price) || 0,
        lensPrice: Number(lens.price) || 0,
        frameFinishId: stringValue(item.customizer.frameFinishId ?? item.customizer.frameFinish),
        lensShape: stringValue(item.customizer.lensShape),
        lensDesign: stringValue(item.customizer.lensDesign),
        lensCut: stringValue(item.customizer.lensCut),
        cornerStyle: stringValue(item.customizer.cornerStyle),
        lensColorId: stringValue(item.customizer.lensColorId ?? item.customizer.lensColor),
        lensTypeId: stringValue(item.customizer.lensTypeId ?? item.customizer.lensType),
        protectionIds: stringList(item.customizer.protectionIds),
        afterWearIds: stringList(item.customizer.afterWearIds),
        engraving: stringValue(item.customizer.engraving, 16),
        engravingPosition: stringValue(item.customizer.engravingPosition, 20),
      });

      const frameName = stringValue(frame.name, 160) || "Selected frame";
      const lensName = stringValue(lens.name, 160) || "Selected lens";
      const customizerPayload = {
        frameId: item.customizerFrameId,
        frameName,
        lensId: item.customizerLensId,
        lensName,
        frameFinishId: pricing.frameFinishId,
        lensShape: pricing.lensShape,
        lensDesign: pricing.lensDesign,
        lensCut: pricing.lensCut,
        cornerStyle: pricing.cornerStyle,
        lensColorId: pricing.lensColorId,
        lensColorCode:
          stringValue(item.customizer.lensColorCode, 20) || String(lens.color_code ?? ""),
        lensOpacity:
          Number(item.customizer.lensOpacity) ||
          Number(lens.tint_opacity) ||
          0.2,
        lensTypeId: pricing.lensTypeId,
        lensType: stringValue(item.customizer.lensType, 40) || String(lens.lens_type ?? ""),
        protectionIds: pricing.protectionIds,
        afterWearIds: pricing.afterWearIds,
        engraving: pricing.engraving,
        engravingPosition: pricing.engravingPosition,
        prescription,
        view: parseView(item.customizer.view),
        currency: stringValue(frame.currency || lens.currency || "USD", 3) || "USD",
        breakdown: lineItemsForMetadata(pricing.lineItems),
        total: pricing.total,
      };
      const requirements =
        item.requirements ||
        describeCustomizer(pricing, frameName, lensName, prescription).slice(0, 1000);

      return {
        productId: item.productId,
        quantity: item.quantity,
        customizerFrameId: item.customizerFrameId,
        customizerLensId: item.customizerLensId,
        customizerUnitPrice: pricing.total,
        customizer: customizerPayload,
        ...(requirements ? { requirements } : {}),
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
