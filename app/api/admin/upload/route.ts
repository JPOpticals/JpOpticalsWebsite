import type { NextRequest } from "next/server";
import { errorResponse, HttpError, json } from "../../../../lib/http";
import { isImageKitConfigured } from "../../../../lib/env";
import { uploadToImageKit } from "../../../../lib/imagekit";
import { requireAdmin } from "../../../../lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!isImageKitConfigured) throw new HttpError(503, "ImageKit is not configured.");

    const form = await request.formData();
    const files = [...form.getAll("file"), ...form.getAll("files")].filter(
      (value): value is File => value instanceof File && value.size > 0,
    );
    if (!files.length) throw new HttpError(400, "Choose an image to upload.");

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        throw new HttpError(400, `${file.name || "File"} is not an image.`);
      }
      if (file.size > MAX_BYTES) {
        throw new HttpError(400, `${file.name || "File"} is larger than 10 MB.`);
      }
    }

    const rawFolder = String(form.get("folder") || "jp/uploads").trim();
    const folder = rawFolder
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9/_-]/g, "-");

    const uploaded = [];
    for (const file of files) {
      uploaded.push(
        await uploadToImageKit({
          file,
          fileName: file.name,
          folder,
          tags: ["jp-admin", `folder-${folder.split("/").pop() || "uploads"}`],
        }),
      );
    }

    return json({ ok: true, files: uploaded }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
