import crypto from "node:crypto";
import {
  IMAGEKIT_ENDPOINT,
  IMAGEKIT_PRIVATE_KEY,
  IMAGEKIT_PUBLIC_KEY,
  isImageKitConfigured,
} from "./env";
import { HttpError } from "./http";

const UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";
const API_URL = "https://api.imagekit.io/v1/files";

const authorization = () =>
  `Basic ${Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString("base64")}`;

export type ImageKitUpload = {
  fileId: string;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  height: number | null;
  width: number | null;
  size: number | null;
  filePath: string | null;
};

export function imageKitAuthParams() {
  if (!isImageKitConfigured) {
    throw new HttpError(503, "ImageKit is not configured.");
  }
  const token = crypto.randomBytes(16).toString("hex");
  const expire = Math.floor(Date.now() / 1000) + 30 * 60;
  const signature = crypto
    .createHmac("sha1", IMAGEKIT_PRIVATE_KEY)
    .update(token + expire)
    .digest("hex");
  return {
    token,
    expire,
    signature,
    publicKey: IMAGEKIT_PUBLIC_KEY,
    urlEndpoint: IMAGEKIT_ENDPOINT,
  };
}

export async function uploadToImageKit(input: {
  file: File;
  fileName?: string;
  folder?: string;
  tags?: string[];
}): Promise<ImageKitUpload> {
  if (!isImageKitConfigured) {
    throw new HttpError(503, "ImageKit is not configured.");
  }

  const fileName = (input.fileName || input.file.name || "upload").replace(
    /[^\w.\- ]+/g,
    "-",
  );
  const form = new FormData();
  form.append("file", input.file, fileName);
  form.append("fileName", fileName);
  form.append("useUniqueFileName", "true");
  if (input.folder) form.append("folder", input.folder.replace(/^\/+|\/+$/g, ""));
  if (input.tags?.length) form.append("tags", input.tags.join(","));

  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: authorization() },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new HttpError(
      502,
      `ImageKit upload failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    fileId: String(data.fileId ?? ""),
    name: String(data.name ?? fileName),
    url: String(data.url ?? ""),
    thumbnailUrl: data.thumbnailUrl ? String(data.thumbnailUrl) : null,
    height: typeof data.height === "number" ? data.height : null,
    width: typeof data.width === "number" ? data.width : null,
    size: typeof data.size === "number" ? data.size : null,
    filePath: data.filePath ? String(data.filePath) : null,
  };
}

export async function deleteFromImageKit(fileId: string) {
  if (!isImageKitConfigured) return false;
  if (!fileId) return false;

  const response = await fetch(`${API_URL}/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: authorization() },
  });

  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => "");
    throw new HttpError(
      502,
      `ImageKit delete failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }
  return true;
}
