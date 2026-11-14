-- JP / Supabase schema
-- Run order: 202611140001_schema.sql -> 202611140002_functions.sql -> 202611140003_rls.sql
-- Safe to run on a fresh Supabase project. The seed file is idempotent.

create table if not exists public.categories (
  id text primary key,
  name text not null,
  slug text not null unique,
  href text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subcategories (
  id text primary key,
  category_id text not null references public.categories(id) on delete cascade,
  name text not null,
  slug text not null,
  href text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create table if not exists public.collections (
  id integer primary key,
  name text not null,
  slug text not null unique,
  description text,
  hero_image_url text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id bigint primary key,
  slug text not null unique,
  name text not null,
  brand text not null,
  collection_id integer references public.collections(id) on delete set null,
  category_id text references public.categories(id) on delete set null,
  subcategory_id text references public.subcategories(id) on delete set null,
  model text,
  frame_type text not null default 'Eyewear',
  gender text,
  shape text,
  material text,
  color text,
  color_code text,
  size text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency char(3) not null default 'USD',
  short_description text,
  description text,
  details jsonb not null default '{}'::jsonb,
  path text not null unique,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  is_featured boolean not null default false,
  is_transitions boolean not null default true,
  sort_order integer not null default 0,
  search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(model, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(short_description, '') || ' ' ||
      coalesce(shape, '') || ' ' ||
      coalesce(material, '') || ' ' ||
      coalesce(gender, '') || ' ' ||
      coalesce(frame_type, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.products(id) on delete cascade,
  url text not null,
  thumbnail_url text,
  imagekit_file_id text,
  imagekit_file_path text,
  alt text,
  width integer,
  height integer,
  size_bytes bigint,
  mime_type text,
  provider text not null default 'legacy' check (provider in ('legacy', 'imagekit')),
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, url)
);

create table if not exists public.product_variants (
  id bigint primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  sku text unique,
  color text,
  color_code text,
  size text,
  stock integer not null default 0 check (stock >= 0),
  price_override numeric(12, 2) check (price_override >= 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profile table for Supabase Auth users. auth.users is managed by Supabase.
create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_email_lower_key on public.customers (lower(email));

create sequence if not exists public.order_number_seq start with 100001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default (
    'JP-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0')
  ),
  customer_id uuid references public.customers(id) on delete set null,
  email text not null,
  phone text,
  status text not null default 'pending' check (
    status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
  ),
  payment_status text not null default 'unpaid' check (
    payment_status in ('unpaid', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed')
  ),
  fulfillment_status text not null default 'unfulfilled' check (
    fulfillment_status in ('unfulfilled', 'partially_fulfilled', 'fulfilled', 'returned')
  ),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  shipping_total numeric(12, 2) not null default 0 check (shipping_total >= 0),
  tax_total numeric(12, 2) not null default 0 check (tax_total >= 0),
  discount_total numeric(12, 2) not null default 0 check (discount_total >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  currency char(3) not null default 'USD',
  shipping_address jsonb,
  billing_address jsonb,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  variant_id bigint references public.product_variants(id) on delete set null,
  name text not null,
  sku text,
  image_url text,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12, 2) generated always as (unit_price * quantity) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id bigint references public.products(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  author_name text not null,
  author_email text,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text not null,
  source text not null default 'site' check (source in ('site', 'google', 'import')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_verified boolean not null default false,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  phone text,
  subject text,
  message text not null,
  source text not null default 'contact' check (source in ('contact', 'product', 'support', 'other')),
  status text not null default 'new' check (status in ('new', 'open', 'closed', 'spam')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'footer',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists newsletter_subscribers_email_lower_key on public.newsletter_subscribers (lower(email));

create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subtitle text,
  cta_label text,
  cta_href text,
  desktop_image_url text,
  mobile_image_url text,
  video_url text,
  duration_ms integer not null default 8000 check (duration_ms > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.editorial_looks (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'look' check (kind in ('look', 'reel')),
  brand text,
  name text not null,
  price numeric(12, 2) check (price >= 0),
  image_url text,
  product_image_url text,
  video_url text,
  cover_url text,
  href text,
  instagram_url text,
  alt text,
  aspect_ratio text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  link_label text,
  link_href text,
  placement text not null default 'homepage' check (placement in ('topbar', 'homepage', 'modal', 'footer')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_settings (
  id integer primary key default 1 check (id = 1),
  standard_label text not null default 'Standard shipping',
  standard_days_min integer not null default 3 check (standard_days_min >= 0),
  standard_days_max integer not null default 5 check (standard_days_max >= standard_days_min),
  standard_price numeric(12, 2) not null default 0 check (standard_price >= 0),
  express_label text not null default 'Express shipping',
  express_days_min integer not null default 1 check (express_days_min >= 0),
  express_days_max integer not null default 1 check (express_days_max >= express_days_min),
  express_price numeric(12, 2) not null default 0 check (express_price >= 0),
  free_shipping_threshold numeric(12, 2) check (free_shipping_threshold >= 0),
  ships_to text[] not null default array['US']::text[],
  tax_note text,
  returns_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'general',
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_brand_idx on public.products (brand);
create index if not exists products_collection_id_idx on public.products (collection_id);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_subcategory_id_idx on public.products (subcategory_id);
create index if not exists products_frame_type_idx on public.products (frame_type);
create index if not exists products_gender_idx on public.products (gender);
create index if not exists products_price_idx on public.products (price);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_sort_order_idx on public.products (sort_order);
create index if not exists products_search_vector_idx on public.products using gin (search_vector);

alter table public.products add column if not exists sort_order integer not null default 0;

create index if not exists product_images_product_id_idx on public.product_images (product_id);
create unique index if not exists product_images_one_primary_idx on public.product_images (product_id) where is_primary;
create index if not exists product_images_imagekit_file_id_idx on public.product_images (imagekit_file_id);

create index if not exists product_variants_product_id_idx on public.product_variants (product_id);

create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_email_lower_idx on public.orders (lower(email));
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_placed_at_idx on public.orders (placed_at desc);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);

create index if not exists reviews_product_id_idx on public.reviews (product_id);
create index if not exists reviews_status_idx on public.reviews (status);
create index if not exists reviews_created_at_idx on public.reviews (created_at desc);

create index if not exists inquiries_status_idx on public.inquiries (status);
create index if not exists inquiries_created_at_idx on public.inquiries (created_at desc);

create index if not exists hero_slides_active_idx on public.hero_slides (is_active, sort_order);
create index if not exists editorial_looks_kind_idx on public.editorial_looks (kind, is_active, sort_order);
create index if not exists announcements_active_idx on public.announcements (placement, is_active, sort_order);
create index if not exists faqs_active_idx on public.faqs (is_active, sort_order);
