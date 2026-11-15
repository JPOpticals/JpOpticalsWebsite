-- JP eyewear customizer: independently managed frames, lenses, and compatibility.
-- Run after the existing migrations and before (or alongside) the generated seed.

create table if not exists public.customizer_frames (
  id uuid primary key default gen_random_uuid(),
  product_id bigint unique references public.products(id) on delete set null,
  name text not null,
  style text not null default 'Classic',
  frame_type text not null default 'Optical' check (frame_type in ('Optical', 'Sunglasses', 'Eyewear')),
  material text,
  color text,
  color_code text,
  image_url text,
  image_file_id text,
  image_alt text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency char(3) not null default 'USD',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customizer_lenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lens_type text not null default 'Clear',
  style text not null default 'Classic',
  color text not null default 'Clear',
  color_code text not null default '#e8eef1',
  tint_opacity numeric(4, 3) not null default 0.2 check (tint_opacity >= 0 and tint_opacity <= 1),
  image_url text,
  image_file_id text,
  image_alt text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency char(3) not null default 'USD',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customizer_frame_lenses (
  id uuid primary key default gen_random_uuid(),
  frame_id uuid not null references public.customizer_frames(id) on delete cascade,
  lens_id uuid not null references public.customizer_lenses(id) on delete cascade,
  price_override numeric(12, 2) check (price_override >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (frame_id, lens_id)
);

create index if not exists customizer_frames_active_sort_idx
  on public.customizer_frames (is_active, sort_order, created_at);
create index if not exists customizer_lenses_active_sort_idx
  on public.customizer_lenses (is_active, sort_order, created_at);
create index if not exists customizer_frame_lenses_frame_idx
  on public.customizer_frame_lenses (frame_id, is_active);

do $$
declare
  table_name text;
  trigger_name text;
  table_names text[] := array['customizer_frames', 'customizer_lenses', 'customizer_frame_lenses'];
begin
  foreach table_name in array table_names loop
    trigger_name := 'set_updated_at_' || table_name;
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      trigger_name,
      table_name
    );
  end loop;
end;
$$;

-- Existing products become usable frames immediately. The generated seed also inserts
-- these rows for fresh installs where products are loaded after this migration.
insert into public.customizer_frames (
  id, product_id, name, style, frame_type, material, color, color_code, image_url,
  image_alt, price, currency, description, sort_order
)
select
  (
    substr(md5('customizer-frame:' || p.id::text), 1, 8) || '-' ||
    substr(md5('customizer-frame:' || p.id::text), 9, 4) || '-' ||
    substr(md5('customizer-frame:' || p.id::text), 13, 4) || '-' ||
    substr(md5('customizer-frame:' || p.id::text), 17, 4) || '-' ||
    substr(md5('customizer-frame:' || p.id::text), 21, 12)
  )::uuid,
  p.id,
  p.name,
  coalesce(nullif(p.shape, ''), 'Classic'),
  case when lower(p.frame_type) = 'optical' then 'Optical'
       when lower(p.frame_type) like '%sunglass%' then 'Sunglasses'
       else 'Eyewear' end,
  p.material,
  p.color,
  p.color_code,
  image.url,
  p.name,
  p.price,
  p.currency,
  coalesce(p.short_description, p.description),
  p.sort_order
from public.products p
left join lateral (
  select pi.url
  from public.product_images pi
  where pi.product_id = p.id
  order by pi.is_primary desc, pi.sort_order asc, pi.created_at asc
  limit 1
) image on true
where p.status = 'active'
on conflict (product_id) do nothing;

insert into public.customizer_lenses (
  id, name, lens_type, style, color, color_code, tint_opacity, price, currency, description, sort_order
)
values
  ('11111111-aaaa-4aaa-8aaa-111111111111', 'Clear optical', 'Clear', 'Classic', 'Clear', '#e8eef1', 0.18, 0, 'USD', 'Everyday clear lenses with a subtle natural reflection.', 0),
  ('22222222-bbbb-4bbb-8bbb-222222222222', 'Blue light filter', 'Blue-light', 'Performance', 'Ice blue', '#9ed5e7', 0.28, 65, 'USD', 'A light blue filter for screen-heavy days.', 1),
  ('33333333-cccc-4ccc-8ccc-333333333333', 'Smoke grey', 'Tinted', 'Solid tint', 'Smoke', '#6e777b', 0.58, 85, 'USD', 'A soft grey tint with a clean, neutral finish.', 2),
  ('44444444-dddd-4ddd-8ddd-444444444444', 'Warm amber', 'Tinted', 'Solid tint', 'Amber', '#c28b55', 0.52, 85, 'USD', 'A warm amber lens for a richer, vintage look.', 3),
  ('55555555-eeee-4eee-8eee-555555555555', 'Polarized olive', 'Polarized', 'Performance', 'Olive', '#65715d', 0.64, 120, 'USD', 'Polarized protection with an olive-green cast.', 4),
  ('66666666-ffff-4fff-8fff-666666666666', 'Photochromic', 'Photochromic', 'Adaptive', 'Graphite', '#53616b', 0.48, 145, 'USD', 'Adaptive lenses that deepen in sunlight.', 5)
on conflict (id) do nothing;

alter table public.customizer_frames enable row level security;
alter table public.customizer_lenses enable row level security;
alter table public.customizer_frame_lenses enable row level security;

drop policy if exists "customizer frames public read" on public.customizer_frames;
create policy "customizer frames public read" on public.customizer_frames
  for select to anon, authenticated using (is_active);

drop policy if exists "customizer frames admin write" on public.customizer_frames;
create policy "customizer frames admin write" on public.customizer_frames
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customizer lenses public read" on public.customizer_lenses;
create policy "customizer lenses public read" on public.customizer_lenses
  for select to anon, authenticated using (is_active);

drop policy if exists "customizer lenses admin write" on public.customizer_lenses;
create policy "customizer lenses admin write" on public.customizer_lenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customizer compatibility public read" on public.customizer_frame_lenses;
create policy "customizer compatibility public read" on public.customizer_frame_lenses
  for select to anon, authenticated using (
    is_active
    and exists (select 1 from public.customizer_frames f where f.id = frame_id and f.is_active)
    and exists (select 1 from public.customizer_lenses l where l.id = lens_id and l.is_active)
  );

drop policy if exists "customizer compatibility admin write" on public.customizer_frame_lenses;
create policy "customizer compatibility admin write" on public.customizer_frame_lenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.customizer_frames, public.customizer_lenses, public.customizer_frame_lenses to anon, authenticated;
grant all on public.customizer_frames, public.customizer_lenses, public.customizer_frame_lenses to service_role;

-- Keep the existing storefront SSE refresh path aware of customizer changes.
do $$
declare
  table_name text;
  table_names text[] := array['customizer_frames', 'customizer_lenses', 'customizer_frame_lenses'];
begin
  if to_regclass('public.site_events') is not null then
    foreach table_name in array table_names loop
      execute format('drop trigger if exists site_event_%s on public.%I', table_name, table_name);
      execute format(
        'create trigger site_event_%s after insert or update or delete on public.%I for each row execute function public.record_site_event()',
        table_name,
        table_name
      );
    end loop;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.customizer_frames;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table public.customizer_lenses;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table public.customizer_frame_lenses;
    exception when duplicate_object then null; end;
  end if;
end;
$$;
