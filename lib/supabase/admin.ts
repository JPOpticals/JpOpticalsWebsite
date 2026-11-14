import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, isSupabaseConfigured } from "../env";

let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured");
  }
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Client-Info": "jp-server-admin" } },
    });
  }
  return adminClient;
}
