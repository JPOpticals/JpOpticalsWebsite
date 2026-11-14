import type { NextRequest } from "next/server";
import { invalidateCatalogCache } from "../../../../lib/catalog";
import { errorResponse, HttpError, json } from "../../../../lib/http";
import { deleteFromImageKit, uploadToImageKit } from "../../../../lib/imagekit";
import { getAdminClient } from "../../../../lib/supabase/admin";
import { requireAdmin } from "../../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

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

function assertImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new HttpError(400, `${file.name || "File"} is not an image.`);
  }
  if (file.size > MAX_BYTES) {
    throw new HttpError(400, `${file.name || "File"} is larger than 10 MB.`);
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const productId = Number(request.nextUrl.searchParams.get("productId"));
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new HttpError(400, "A valid productId is required.");
    }

    const { data, error } = await getAdminClient()
      .from("product_images")
      .select(
        "id,product_id,url,thumbnail_url,imagekit_file_id,imagekit_file_path,alt,width,height,size_bytes,mime_type,provider,is_primary,sort_order,metadata",
      )
      .eq("product_id", productId)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new HttpError(400, error.message);
    return json({ ok: true, images: (data ?? []).map((row) => serialize(row as ImageRow)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const form = await request.formData();
    const productId = Number(form.get("productId"));
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new HttpError(400, "A valid productId is required.");
    }

    const files = [...form.getAll("files"), ...form.getAll("file")].filter(
      (value): value is File => value instanceof File && value.size > 0,
    );
    if (!files.length) throw new HttpError(400, "Choose at least one image to upload.");
    files.forEach(assertImage);

    const admin = getAdminClient();
    const replaceId = String(form.get("replaceImageId") ?? "").trim();
    const alt = String(form.get("alt") ?? "").trim();
    const folderInput = String(form.get("folder") ?? "").trim();

    const { data: product, error: productError } = await admin
      .from("products")
      .select("id,name")
      .eq("id", productId)
      .maybeSingle();
    if (productError) throw new HttpError(400, productError.message);
    if (!product) throw new HttpError(404, "Product not found.");

    const folder = (folderInput || `jp/products/${productId}`).replace(/^\/+|\/+$/g, "");

    if (replaceId) {
      if (files.length !== 1) {
        throw new HttpError(400, "Replacement accepts exactly one image.");
      }
      const { data: existing, error: existingError } = await admin
        .from("product_images")
        .select(
          "id,product_id,url,thumbnail_url,imagekit_file_id,imagekit_file_path,alt,width,height,size_bytes,mime_type,provider,is_primary,sort_order,metadata",
        )
        .eq("id", replaceId)
        .eq("product_id", productId)
        .maybeSingle();
      if (existingError) throw new HttpError(400, existingError.message);
      if (!existing) throw new HttpError(404, "Image not found for this product.");

      const uploaded = await uploadToImageKit({
        file: files[0],
        fileName: files[0].name,
        folder,
        tags: ["jp-product", `product-${productId}`],
      });

      const { data: updated, error: updateError } = await admin
        .from("product_images")
        .update({
          url: uploaded.url,
          thumbnail_url: uploaded.thumbnailUrl,
          imagekit_file_id: uploaded.fileId,
          imagekit_file_path: uploaded.filePath,
          alt: alt || (existing as ImageRow).alt || product.name,
          width: uploaded.width,
          height: uploaded.height,
          size_bytes: uploaded.size,
          mime_type: files[0].type || null,
          provider: "imagekit",
          metadata: {
            ...((existing as ImageRow).metadata ?? {}),
            originalName: files[0].name,
            replacedAt: new Date().toISOString(),
          },
        })
        .eq("id", replaceId)
        .select(
          "id,product_id,url,thumbnail_url,imagekit_file_id,imagekit_file_path,alt,width,height,size_bytes,mime_type,provider,is_primary,sort_order,metadata",
        )
        .single();

      if (updateError) throw new HttpError(400, updateError.message);

      const oldFileId = (existing as ImageRow).imagekit_file_id;
      if (oldFileId && oldFileId !== uploaded.fileId) {
        await deleteFromImageKit(oldFileId).catch((error) => {
          console.error("[imagekit] could not delete replaced file", oldFileId, error);
        });
      }

      invalidateCatalogCache();
      return json({ ok: true, image: serialize(updated as ImageRow) });
    }

    const { data: existingRows, error: countError } = await admin
      .from("product_images")
      .select("id,is_primary,sort_order")
      .eq("product_id", productId);
    if (countError) throw new HttpError(400, countError.message);

    const existing = existingRows ?? [];
    const nextSort =
      existing.reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), -1) + 1;
    const makePrimary =
      String(form.get("setPrimary") ?? "").toLowerCase() === "true" ||
      !existing.some((row) => row.is_primary);

    const created: ImageRow[] = [];
    for (const [index, file] of files.entries()) {
      const uploaded = await uploadToImageKit({
        file,
        fileName: file.name,
        folder,
        tags: ["jp-product", `product-${productId}`],
      });

      const { data: inserted, error: insertError } = await admin
        .from("product_images")
        .insert({
          product_id: productId,
          url: uploaded.url,
          thumbnail_url: uploaded.thumbnailUrl,
          imagekit_file_id: uploaded.fileId,
          imagekit_file_path: uploaded.filePath,
          alt: alt || product.name,
          width: uploaded.width,
          height: uploaded.height,
          size_bytes: uploaded.size,
          mime_type: file.type || null,
          provider: "imagekit",
          is_primary: makePrimary && index === 0,
          sort_order: nextSort + index,
          metadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
          },
        })
        .select(
          "id,product_id,url,thumbnail_url,imagekit_file_id,imagekit_file_path,alt,width,height,size_bytes,mime_type,provider,is_primary,sort_order,metadata",
        )
        .single();

      if (insertError) {
        await deleteFromImageKit(uploaded.fileId).catch(() => {});
        throw new HttpError(400, insertError.message);
      }
      created.push(inserted as ImageRow);
    }

    invalidateCatalogCache();
    return json({ ok: true, images: created.map(serialize) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
