import type { NextRequest } from "next/server";
import { invalidateCatalogCache } from "../../../../../lib/catalog";
import { errorResponse, HttpError, json } from "../../../../../lib/http";
import { deleteFromImageKit } from "../../../../../lib/imagekit";
import { getAdminClient } from "../../../../../lib/supabase/admin";
import { requireAdmin } from "../../../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageRow = {
  id: string;
  product_id: number;
  url: string;
  thumbnail_url: string | null;
  imagekit_file_id: string | null;
  imagekit_file_path: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  provider: string;
  is_primary: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
};

const serialize = (row: ImageRow) => ({
  id: row.id,
  productId: row.product_id,
  url: row.url,
  thumbnailUrl: row.thumbnail_url,
  fileId: row.imagekit_file_id,
  filePath: row.imagekit_file_path,
  alt: row.alt,
  width: row.width,
  height: row.height,
  size: row.size_bytes,
  mimeType: row.mime_type,
  provider: row.provider,
  isPrimary: row.is_primary,
  sortOrder: row.sort_order,
});

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await requireAdmin(request);
    const { id } = await context.params;
    if (!id) throw new HttpError(400, "Image id is required.");

    const body = (await request.json().catch(() => null)) as
      | { isPrimary?: unknown; alt?: unknown; sortOrder?: unknown }
      | null;
    if (!body) throw new HttpError(400, "Invalid request body.");

    const update: Record<string, unknown> = {};
    if (typeof body.isPrimary === "boolean") update.is_primary = body.isPrimary;
    if (typeof body.alt === "string") update.alt = body.alt.trim() || null;
    if (Number.isInteger(Number(body.sortOrder))) update.sort_order = Number(body.sortOrder);
    if (!Object.keys(update).length) throw new HttpError(400, "Nothing to update.");

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("product_images")
      .update(update)
      .eq("id", id)
      .select(
        "id,product_id,url,thumbnail_url,imagekit_file_id,imagekit_file_path,alt,width,height,size_bytes,mime_type,provider,is_primary,sort_order,metadata",
      )
      .single();

    if (error) throw new HttpError(400, error.message);
    invalidateCatalogCache();
    return json({ ok: true, image: serialize(data as ImageRow) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await requireAdmin(request);
    const { id } = await context.params;
    if (!id) throw new HttpError(400, "Image id is required.");

    const admin = getAdminClient();
    const { data: existing, error: readError } = await admin
      .from("product_images")
      .select(
        "id,product_id,url,thumbnail_url,imagekit_file_id,imagekit_file_path,alt,width,height,size_bytes,mime_type,provider,is_primary,sort_order,metadata",
      )
      .eq("id", id)
      .maybeSingle();
    if (readError) throw new HttpError(400, readError.message);
    if (!existing) throw new HttpError(404, "Image not found.");

    const row = existing as ImageRow;
    if (row.provider === "imagekit" && row.imagekit_file_id) {
      await deleteFromImageKit(row.imagekit_file_id);
    }

    const { error: deleteError } = await admin.from("product_images").delete().eq("id", id);
    if (deleteError) throw new HttpError(400, deleteError.message);

    if (row.is_primary) {
      const { data: remaining } = await admin
        .from("product_images")
        .select("id")
        .eq("product_id", row.product_id)
        .order("sort_order", { ascending: true })
        .limit(1);
      if (remaining?.[0]?.id) {
        await admin.from("product_images").update({ is_primary: true }).eq("id", remaining[0].id);
      }
    }

    invalidateCatalogCache();
    return json({ ok: true, deletedId: id });
  } catch (error) {
    return errorResponse(error);
  }
}
