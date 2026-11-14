import type { NextRequest } from "next/server";
import { adminStats } from "../../../../lib/admin";
import { errorResponse, json } from "../../../../lib/http";
import { requireAdmin } from "../../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    return json({ ok: true, ...(await adminStats()) });
  } catch (error) {
    return errorResponse(error);
  }
}
