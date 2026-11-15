const read = (name: string) => process.env[name]?.trim() ?? "";

export const SUPABASE_URL = read("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY =
  read("NEXT_Publishable_key") ||
  read("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
  read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
export const SUPABASE_SERVICE_KEY =
  read("SUPABASE_SERVICE_ROLE_KEY") ||
  read("SUPABASE_SECRET_KEY") ||
  read("SUPABASE_Secret_key");

export const IMAGEKIT_ENDPOINT = read("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT");
export const IMAGEKIT_PUBLIC_KEY = read("NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY");
export const IMAGEKIT_PRIVATE_KEY = read("IMAGEKIT_PRIVATE_KEY");

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_KEY,
);

export const isImageKitConfigured = Boolean(
  IMAGEKIT_ENDPOINT && IMAGEKIT_PUBLIC_KEY && IMAGEKIT_PRIVATE_KEY,
);

export const AUTH_COOKIE_ACCESS = "jp_access_token";
export const AUTH_COOKIE_REFRESH = "jp_refresh_token";
