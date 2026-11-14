import type { NextRequest } from "next/server";
import { errorResponse, json } from "../../../../lib/http";
import { imageKitAuthParams } from "../../../../lib/imagekit";
import { requireAdmin } from "../../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    return json({ ok: true, ...imageKitAuthParams() });
  } catch (error) {
    return errorResponse(error);
  }
}
