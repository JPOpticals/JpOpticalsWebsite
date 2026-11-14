import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./env";
import { HttpError } from "./http";
import { getAdminClient } from "./supabase/admin";
import { getAnonClient } from "./supabase/anon";
import { profileFor, type AuthUser } from "./supabase/auth";

export const normalizeEmail = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

export const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export type AccountResult = {
  user: AuthUser;
  session: Session;
};

export async function registerCustomer(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AccountResult> {
  if (!isSupabaseConfigured) {
    throw new HttpError(503, "Account service is not configured.");
  }

  const email = normalizeEmail(input.email);
  const name = String(input.name ?? "").trim() || email.split("@")[0];
  const password = String(input.password ?? "");

  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (password.length < 6) {
    throw new HttpError(400, "Password must be at least 6 characters.");
  }

  const admin = getAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (createError) {
    if (/already|exists|registered/i.test(createError.message)) {
      throw new HttpError(409, "An account with this email already exists.");
    }
    throw new HttpError(400, createError.message);
  }

  if (!created.user) throw new HttpError(500, "Could not create the account.");

  // The auth trigger normally creates this row. The upsert keeps the app working
  // if the trigger was not installed yet.
  await admin
    .from("customers")
    .upsert(
      {
        id: created.user.id,
        email,
        full_name: name,
        role: "customer",
      },
      { onConflict: "id" },
    );

  const { data: signIn, error: signInError } = await getAnonClient().auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signIn.session || !signIn.user) {
    throw new HttpError(500, "Account created, but sign-in failed. Please sign in.");
  }

  return {
    user: await profileFor(signIn.user),
    session: signIn.session,
  };
}

export async function loginCustomer(input: {
  email: string;
  password: string;
}): Promise<AccountResult> {
  if (!isSupabaseConfigured) {
    throw new HttpError(503, "Account service is not configured.");
  }

  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");

  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!password) throw new HttpError(400, "Enter your password.");

  const { data, error } = await getAnonClient().auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    throw new HttpError(401, "Email or password is incorrect.");
  }

  return {
    user: await profileFor(data.user),
    session: data.session,
  };
}
