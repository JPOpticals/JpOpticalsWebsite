import { json } from "../../../lib/http";
import { isImageKitConfigured, isSupabaseConfigured } from "../../../lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json({
    ok: true,
    supabaseConfigured: isSupabaseConfigured,
    imagekitConfigured: isImageKitConfigured,
    timestamp: new Date().toISOString(),
  });
}
