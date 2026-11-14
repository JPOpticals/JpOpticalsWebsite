-- JP / admin panel support
-- Adds image metadata for categories and hero banners, plus Realtime tables.
-- Run after 202611140003_rls.sql.

alter table public.categories add column if not exists image_url text;
alter table public.categories add column if not exists image_file_id text;
alter table public.categories add column if not exists image_alt text;

alter table public.hero_slides add column if not exists desktop_file_id text;
alter table public.hero_slides add column if not exists mobile_file_id text;
alter table public.hero_slides add column if not exists video_file_id text;

-- Publish live tables to Supabase Realtime when the publication exists.
do $$
declare
  table_name text;
  tables text[] := array[
    'public.products',
    'public.product_images',
    'public.product_variants',
    'public.categories',
    'public.subcategories',
    'public.collections',
    'public.orders',
    'public.order_items',
    'public.customers',
    'public.reviews',
    'public.inquiries',
    'public.newsletter_subscribers',
    'public.hero_slides',
    'public.editorial_looks',
    'public.announcements',
    'public.delivery_settings',
    'public.faqs'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array tables loop
      begin
        execute format('alter publication supabase_realtime add table %s', table_name);
      exception
        when duplicate_object then null;
        when undefined_table then null;
      end;
    end loop;
  end if;
end $$;

-- One-time bootstrap: promote exactly one account to administrator.
create or replace function public.claim_initial_admin(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(918273645);

  if exists (select 1 from public.customers where role = 'admin') then
    return false;
  end if;

  update public.customers
     set role = 'admin'
   where id = p_user_id;

  return found;
end;
$$;

revoke all on function public.claim_initial_admin(uuid) from public;
grant execute on function public.claim_initial_admin(uuid) to service_role;

-- Lightweight change log consumed by the storefront SSE endpoint.
create table if not exists public.site_events (
  id bigserial primary key,
  topic text not null,
  action text not null,
  created_at timestamptz not null default now()
);

alter table public.site_events enable row level security;
revoke all on table public.site_events from public, anon, authenticated;
grant all on table public.site_events to service_role;
grant usage, select on sequence public.site_events_id_seq to service_role;

create or replace function public.record_site_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.site_events(topic, action)
  values (tg_table_name, lower(tg_op));
  return coalesce(new, old);
end;
$$;

do $$
declare
  table_name text;
  tables text[] := array[
    'products',
    'product_images',
    'product_variants',
    'categories',
    'subcategories',
    'collections',
    'orders',
    'order_items',
    'reviews',
    'hero_slides',
    'editorial_looks',
    'announcements',
    'delivery_settings',
    'faqs'
  ];
begin
  foreach table_name in array tables loop
    execute format('drop trigger if exists site_event_%s on public.%I', table_name, table_name);
    execute format(
      'create trigger site_event_%s after insert or update or delete on public.%I for each row execute function public.record_site_event()',
      table_name,
      table_name
    );
  end loop;
end $$;
