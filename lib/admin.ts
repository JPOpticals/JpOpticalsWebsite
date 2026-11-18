import type { Session } from "@supabase/supabase-js";
import { isValidEmail, normalizeEmail } from "./accounts";
import { type AdminField, type AdminResource } from "./admin-config";
import { invalidateCatalogCache } from "./catalog";
import { invalidateContentCache } from "./content";
import { invalidateCustomizerCache } from "./customizer";
import { isSupabaseConfigured } from "./env";
import { HttpError } from "./http";
import { deleteFromImageKit } from "./imagekit";
import { getAdminClient } from "./supabase/admin";
import { getAnonClient } from "./supabase/anon";
import { profileFor, type AuthUser } from "./supabase/auth";

type Row = Record<string, unknown>;

export const isBlank = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "");

function coerceField(field: AdminField, value: unknown): unknown {
  if (value === undefined) return undefined;

  if (isBlank(value)) {
    if (field.type === "json") return {};
    if (field.type === "tags") return [];
    if (field.required) throw new HttpError(400, `${field.label} is required.`);
    return null;
  }

  switch (field.type) {
    case "boolean":
      return !(
        value === false ||
        value === 0 ||
        value === "0" ||
        value === "false" ||
        value === "off"
      );
    case "number":
    case "money": {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new HttpError(400, `${field.label} must be a number.`);
      if (field.min !== undefined && number < field.min) {
        throw new HttpError(400, `${field.label} must be at least ${field.min}.`);
      }
      if (field.max !== undefined && number > field.max) {
        throw new HttpError(400, `${field.label} must be no more than ${field.max}.`);
      }
      return number;
    }
    case "date":
    case "datetime": {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) {
        throw new HttpError(400, `${field.label} must be a valid date.`);
      }
      return date.toISOString();
    }
    case "json": {
      if (typeof value === "object") return value;
      try {
        return JSON.parse(String(value));
      } catch {
        throw new HttpError(400, `${field.label} must contain valid JSON.`);
      }
    }
    case "tags": {
      if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
      }
      return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    default:
      return String(value).trim();
  }
}

export function sanitizeRecord(
  resource: AdminResource,
  body: Row,
  mode: "create" | "update",
): Row {
  const record: Row = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  for (const field of resource.fields) {
    if (field.name === "password") continue;
    if (mode === "create" && field.name === resource.idColumn && field.hideInForm) continue;
    if (mode === "update" && (field.readOnly || field.name === resource.idColumn)) continue;
    if (field.hideInForm && field.type !== "image" && field.fileIdField) continue;

    if (!has(field.name)) {
      if (mode === "create" && field.defaultValue !== undefined && !field.readOnly) {
        record[field.name] = coerceField(field, field.defaultValue);
      }
      continue;
    }

    const coerced = coerceField(field, body[field.name]);
    if (coerced !== undefined) record[field.name] = coerced;
  }

  if (mode === "create") {
    for (const field of resource.fields) {
      if (!field.required || field.readOnly || field.name === "password") continue;
      if (isBlank(record[field.name])) {
        throw new HttpError(400, `${field.label} is required.`);
      }
    }
  }

  return record;
}

export function invalidateAdminCaches() {
  invalidateCatalogCache();
  invalidateContentCache();
  invalidateCustomizerCache();
}

export function resourceSelect(resource: AdminResource) {
  return resource.detailSelect || "*";
}


export async function listResource(
  resource: AdminResource,
  params: URLSearchParams,
): Promise<{
  records: Row[];
  page: number;
  limit: number;
  count: number;
  totalPages: number;
}> {
  const admin = getAdminClient();
  const page = Math.max(1, Number(params.get("page") || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") || 20) || 20));
  const search = String(params.get("q") || "").trim();
  const requestedSort = String(params.get("sort") || resource.defaultSort.column);
  const sortable = new Set([
    ...resource.fields.map((field) => field.name),
    "created_at",
    "updated_at",
    "placed_at",
  ]);
  const sort = sortable.has(requestedSort) ? requestedSort : resource.defaultSort.column;
  const order = String(params.get("order") || "").toLowerCase();
  const ascending = order ? order === "asc" : resource.defaultSort.ascending;

  let query = admin
    .from(resource.table)
    .select(resourceSelect(resource), { count: "exact" });

  if (search && resource.searchFields.length) {
    const term = search.replace(/[,%()]/g, " ").trim();
    if (term) {
      query = query.or(resource.searchFields.map((field) => `${field}.ilike.%${term}%`).join(","));
    }
  }

  for (const [key, value] of params.entries()) {
    if (!key.startsWith("filter_") || isBlank(value)) continue;
    const fieldName = key.slice("filter_".length);
    const field = resource.fields.find((item) => item.name === fieldName);
    if (!field) continue;
    if (field.type === "boolean") {
      query = query.eq(fieldName, value === "true");
    } else if (field.type === "number" || field.type === "money") {
      const number = Number(value);
      if (Number.isFinite(number)) query = query.eq(fieldName, number);
    } else {
      query = query.eq(fieldName, value);
    }
  }

  if (resource.key === "delivery") {
    const { data, error } = await query.order(sort, { ascending });
    if (error) throw new HttpError(400, error.message);
    const records = (data ?? []) as unknown as Row[];
    return { records, page: 1, limit: records.length || limit, count: records.length, totalPages: 1 };
  }

  const from = (page - 1) * limit;
  const { data, error, count } = await query
    .order(sort, { ascending })
    .range(from, from + limit - 1);

  if (error) throw new HttpError(400, error.message);

  const total = count ?? 0;
  return {
    records: (data ?? []) as unknown as Row[],
    page,
    limit,
    count: total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getResourceRecord(resource: AdminResource, id: string): Promise<Row> {
  const { data, error } = await getAdminClient()
    .from(resource.table)
    .select(resourceSelect(resource))
    .eq(resource.idColumn, id)
    .maybeSingle();
  if (error) throw new HttpError(400, error.message);
  if (!data) throw new HttpError(404, `${resource.singular} not found.`);
  return data as unknown as Row;
}

async function createCustomer(input: Row) {
  const admin = getAdminClient();
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");
  const name = String(input.full_name ?? "").trim() || email.split("@")[0];
  const role = input.role === "admin" ? "admin" : "customer";

  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (password.length < 8) {
    throw new HttpError(400, "Temporary password must be at least 8 characters.");
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) {
    if (/already|exists|registered/i.test(error.message)) {
      throw new HttpError(409, "An account with this email already exists.");
    }
    throw new HttpError(400, error.message);
  }
  if (!created.user) throw new HttpError(500, "Could not create the account.");

  const row = {
    id: created.user.id,
    email,
    full_name: name,
    phone: input.phone ? String(input.phone) : null,
    role,
    metadata: input.metadata ?? {},
  };

  const { data, error: upsertError } = await admin
    .from("customers")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (upsertError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw new HttpError(400, upsertError.message);
  }

  return data as unknown as Row;
}

export async function createResourceRecord(resource: AdminResource, body: Row): Promise<Row> {
  if (!resource.canCreate) {
    throw new HttpError(400, `${resource.label} cannot be created here.`);
  }
  if (resource.key === "customers") {
    const created = await createCustomer({ ...body });
    invalidateAdminCaches();
    return created;
  }

  if (resource.key === "products") {
    const { data } = await getAdminClient()
      .from("products")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);
    const nextId = Number((data?.[0] as { id?: number } | undefined)?.id ?? 0) + 1;
    body.id = nextId;
  }

  const record = sanitizeRecord(resource, body, "create");
  const { data, error } = await getAdminClient()
    .from(resource.table)
    .insert(record)
    .select(resourceSelect(resource))
    .single();
  if (error) throw new HttpError(400, error.message);
  invalidateAdminCaches();
  return data as unknown as Row;
}

async function updateCustomer(
  resource: AdminResource,
  id: string,
  body: Row,
): Promise<Row> {
  const admin = getAdminClient();
  const existing = await getResourceRecord(resource, id);
  const updates = sanitizeRecord(resource, body, "update");

  if (updates.email) {
    updates.email = normalizeEmail(updates.email);
    if (!isValidEmail(updates.email as string)) {
      throw new HttpError(400, "Enter a valid email address.");
    }
  }

  if (updates.role && updates.role !== "admin" && existing.role === "admin") {
    const { count } = await admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      throw new HttpError(400, "At least one administrator account is required.");
    }
  }

  const { data, error } = await admin
    .from("customers")
    .update(updates)
    .eq(resource.idColumn, id)
    .select(resourceSelect(resource))
    .single();
  if (error) throw new HttpError(400, error.message);

  const authUpdate: Record<string, unknown> = {};
  if (updates.email && updates.email !== existing.email) authUpdate.email = updates.email;
  if (updates.full_name) authUpdate.user_metadata = { full_name: updates.full_name };
  if (Object.keys(authUpdate).length) {
    await admin.auth.admin.updateUserById(id, authUpdate).catch(() => {});
  }

  invalidateAdminCaches();
  return data as unknown as Row;
}

async function updateOrder(
  resource: AdminResource,
  id: string,
  body: Row,
): Promise<Row> {
  const existing = await getResourceRecord(resource, id);
  const updates = sanitizeRecord(resource, body, "update");
  const financialKeys = ["subtotal", "shipping_total", "tax_total", "discount_total"];
  const touchesFinancials = financialKeys.some((key) => key in updates);

  if (touchesFinancials && !("total" in updates)) {
    const subtotal = Number(updates.subtotal ?? existing.subtotal ?? 0);
    const shipping = Number(updates.shipping_total ?? existing.shipping_total ?? 0);
    const tax = Number(updates.tax_total ?? existing.tax_total ?? 0);
    const discount = Number(updates.discount_total ?? existing.discount_total ?? 0);
    updates.total = Math.max(0, subtotal + shipping + tax - discount);
  }

  const { data, error } = await getAdminClient()
    .from(resource.table)
    .update(updates)
    .eq(resource.idColumn, id)
    .select(resourceSelect(resource))
    .single();
  if (error) throw new HttpError(400, error.message);
  invalidateAdminCaches();
  return data as unknown as Row;
}

export async function updateResourceRecord(
  resource: AdminResource,
  id: string,
  body: Row,
): Promise<Row> {
  if (resource.key === "customers") return updateCustomer(resource, id, body);
  if (resource.key === "orders") return updateOrder(resource, id, body);

  const record = sanitizeRecord(resource, body, "update");
  if (!Object.keys(record).length) {
    throw new HttpError(400, "No changes were provided.");
  }

  const { data, error } = await getAdminClient()
    .from(resource.table)
    .update(record)
    .eq(resource.idColumn, id)
    .select(resourceSelect(resource))
    .single();
  if (error) throw new HttpError(400, error.message);
  invalidateAdminCaches();
  return data as unknown as Row;
}

export async function deleteResourceRecord(
  resource: AdminResource,
  id: string,
  actorId: string,
): Promise<void> {
  if (!resource.canDelete) {
    throw new HttpError(400, `${resource.label} cannot be deleted.`);
  }
  const admin = getAdminClient();

  if (resource.key === "customers") {
    if (id === actorId) throw new HttpError(400, "You cannot delete your own account.");
    const existing = await getResourceRecord(resource, id);
    if (existing.role === "admin") {
      const { count } = await admin
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        throw new HttpError(400, "At least one administrator account is required.");
      }
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new HttpError(400, error.message);
    invalidateAdminCaches();
    return;
  }

  if (resource.key === "products") {
    const { data: images } = await admin
      .from("product_images")
      .select("imagekit_file_id")
      .eq("product_id", id);
    for (const image of (images ?? []) as { imagekit_file_id: string | null }[]) {
      if (image.imagekit_file_id) {
        await deleteFromImageKit(image.imagekit_file_id).catch(() => {});
      }
    }
    const { data: variants } = await admin
      .from("product_variants")
      .select("image_file_id")
      .eq("product_id", id);
    for (const variant of (variants ?? []) as { image_file_id: string | null }[]) {
      if (variant.image_file_id) {
        await deleteFromImageKit(variant.image_file_id).catch(() => {});
      }
    }
  }

  if (resource.key === "product-variants") {
    const { data: images } = await admin
      .from("product_images")
      .select("imagekit_file_id")
      .eq("variant_id", id);
    for (const image of (images ?? []) as { imagekit_file_id: string | null }[]) {
      if (image.imagekit_file_id) {
        await deleteFromImageKit(image.imagekit_file_id).catch(() => {});
      }
    }
    const { data: variant } = await admin
      .from("product_variants")
      .select("image_file_id")
      .eq("id", id)
      .maybeSingle();
    const fileId = (variant as { image_file_id: string | null } | null)?.image_file_id;
    if (fileId) await deleteFromImageKit(fileId).catch(() => {});
  }

  const { error } = await admin.from(resource.table).delete().eq(resource.idColumn, id);
  if (error) throw new HttpError(400, error.message);
  invalidateAdminCaches();
}

export async function adminStats() {
  const admin = getAdminClient();
  const count = async (table: string, apply?: (query: any) => any) => {
    let query = admin.from(table).select("id", { count: "exact", head: true });
    if (apply) query = apply(query);
    const { count: total, error } = await query;
    if (error) throw new HttpError(400, error.message);
    return total ?? 0;
  };

  const [products, categories, customers, orders, pendingOrders, pendingReviews, newInquiries] =
    await Promise.all([
      count("products"),
      count("categories"),
      count("customers", (query) => query.eq("role", "customer")),
      count("orders"),
      count("orders", (query) => query.eq("status", "pending")),
      count("reviews", (query) => query.eq("status", "pending")),
      count("inquiries", (query) => query.eq("status", "new")),
    ]);

  const { data: revenueRows, error: revenueError } = await admin
    .from("orders")
    .select("total,status,placed_at")
    .not("status", "in", "(cancelled,refunded)");
  if (revenueError) throw new HttpError(400, revenueError.message);

  const rows = (revenueRows ?? []) as { total: number | string | null; placed_at: string | null }[];
  const revenue = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);

  const days: { date: string; revenue: number; orders: number }[] = [];
  const keyed = new Map<string, { revenue: number; orders: number }>();
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    keyed.set(key, { revenue: 0, orders: 0 });
  }
  for (const row of rows) {
    if (!row.placed_at) continue;
    const key = row.placed_at.slice(0, 10);
    const bucket = keyed.get(key);
    if (!bucket) continue;
    bucket.revenue += Number(row.total ?? 0);
    bucket.orders += 1;
  }
  for (const [date, bucket] of keyed) days.push({ date, ...bucket });

  const [{ data: recentOrders }, { data: recentReviews }, { data: recentInquiries }] =
    await Promise.all([
      admin
        .from("orders")
        .select("id,order_number,email,total,currency,status,payment_status,placed_at")
        .order("placed_at", { ascending: false })
        .limit(6),
      admin
        .from("reviews")
        .select("id,product_id,author_name,rating,status,created_at")
        .order("created_at", { ascending: false })
        .limit(6),
      admin
        .from("inquiries")
        .select("id,name,email,subject,status,created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const activity = [
    ...((recentOrders ?? []) as unknown as Row[]).map((row) => ({
      type: "order",
      title: `Order ${row.order_number ?? `#${row.id}`}`,
      detail: `${row.email ?? ""} · ${row.currency ?? "USD"} ${Number(row.total ?? 0).toFixed(2)}`,
      status: row.status,
      at: row.placed_at,
    })),
    ...((recentReviews ?? []) as unknown as Row[]).map((row) => ({
      type: "review",
      title: `Review by ${row.author_name ?? "Customer"}`,
      detail: `${row.rating ?? 0}/5 · product #${row.product_id ?? "—"}`,
      status: row.status,
      at: row.created_at,
    })),
    ...((recentInquiries ?? []) as unknown as Row[]).map((row) => ({
      type: "inquiry",
      title: row.subject ? `Inquiry: ${row.subject}` : `Inquiry from ${row.name ?? row.email}`,
      detail: `${row.email ?? ""}`,
      status: row.status,
      at: row.created_at,
    })),
  ]
    .filter((item) => item.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8);

  return {
    stats: {
      revenue,
      orders,
      products,
      categories,
      customers,
      pendingOrders,
      pendingReviews,
      newInquiries,
    },
    sales: days,
    recentOrders: recentOrders ?? [],
    recentReviews: recentReviews ?? [],
    recentInquiries: recentInquiries ?? [],
    activity,
  };
}

export async function adminSetupStatus() {
  if (!isSupabaseConfigured) {
    return { configured: false, needsSetup: false, adminCount: 0 };
  }
  const { count, error } = await getAdminClient()
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new HttpError(400, error.message);
  const adminCount = count ?? 0;
  return { configured: true, needsSetup: adminCount === 0, adminCount };
}

export async function createInitialAdmin(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: AuthUser; session: Session }> {
  if (!isSupabaseConfigured) throw new HttpError(503, "Supabase is not configured.");
  const admin = getAdminClient();
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");
  const name = String(input.name ?? "").trim() || email.split("@")[0];

  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }

  const status = await adminSetupStatus();
  if (!status.needsSetup) {
    throw new HttpError(409, "An administrator account already exists. Please sign in.");
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) {
    if (/already|exists|registered/i.test(error.message)) {
      throw new HttpError(409, "An account with this email already exists.");
    }
    throw new HttpError(400, error.message);
  }
  if (!created.user) throw new HttpError(500, "Could not create the administrator account.");

  await admin
    .from("customers")
    .upsert(
      { id: created.user.id, email, full_name: name, role: "customer" },
      { onConflict: "id" },
    );

  const { data: claimed, error: claimError } = await admin.rpc("claim_initial_admin", {
    p_user_id: created.user.id,
  });

  if (claimError) {
    const { count } = await admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      throw new HttpError(409, "An administrator account already exists. Please sign in.");
    }
    // The helper function may not be installed on an older database.
    await admin.from("customers").update({ role: "admin" }).eq("id", created.user.id);
  } else if (!claimed) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw new HttpError(409, "An administrator account already exists. Please sign in.");
  }

  const { data: signIn, error: signInError } = await getAnonClient().auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signIn.session || !signIn.user) {
    throw new HttpError(500, "Administrator created. Please sign in.");
  }

  invalidateAdminCaches();
  return {
    user: await profileFor(signIn.user),
    session: signIn.session,
  };
}
