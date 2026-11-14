import type { NextRequest } from "next/server";
import {
  createResourceRecord,
  listResource,
} from "../../../../lib/admin";
import { getAdminResource } from "../../../../lib/admin-config";
import { errorResponse, HttpError, json, parseJsonBody } from "../../../../lib/http";
import { requireAdmin } from "../../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ resource: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    await requireAdmin(request);
    const { resource: key } = await context.params;
    const resource = getAdminResource(key);
    if (!resource) throw new HttpError(404, "Unknown admin resource.");
    return json({ ok: true, ...(await listResource(resource, request.nextUrl.searchParams)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    await requireAdmin(request);
    const { resource: key } = await context.params;
    const resource = getAdminResource(key);
    if (!resource) throw new HttpError(404, "Unknown admin resource.");

    const body = parseJsonBody<Record<string, unknown>>(
      await request.json().catch(() => null),
    );
    return json(
      { ok: true, record: await createResourceRecord(resource, body) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
