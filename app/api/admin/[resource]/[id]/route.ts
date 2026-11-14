import type { NextRequest } from "next/server";
import {
  deleteResourceRecord,
  getResourceRecord,
  updateResourceRecord,
} from "../../../../../lib/admin";
import { getAdminResource } from "../../../../../lib/admin-config";
import { errorResponse, HttpError, json, parseJsonBody } from "../../../../../lib/http";
import { requireAdmin } from "../../../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ resource: string; id: string }> };

async function resolve(context: Context) {
  const { resource: key, id } = await context.params;
  const resource = getAdminResource(key);
  if (!resource) throw new HttpError(404, "Unknown admin resource.");
  return { resource, id };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    await requireAdmin(request);
    const { resource, id } = await resolve(context);
    return json({ ok: true, record: await getResourceRecord(resource, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await requireAdmin(request);
    const { resource, id } = await resolve(context);
    const body = parseJsonBody<Record<string, unknown>>(
      await request.json().catch(() => null),
    );
    return json({ ok: true, record: await updateResourceRecord(resource, id, body) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { user } = await requireAdmin(request);
    const { resource, id } = await resolve(context);
    await deleteResourceRecord(resource, id, user!.id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
