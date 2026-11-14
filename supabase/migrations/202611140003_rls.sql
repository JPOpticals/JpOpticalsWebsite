-- JP / Supabase row level security
-- Run after the schema and functions migrations.

alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.collections enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;
alter table public.inquiries enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.hero_slides enable row level security;
alter table public.editorial_looks enable row level security;
alter table public.announcements enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.faqs enable row level security;

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') not in ('service_role', 'postgres')
     and not public.is_admin() then
    raise exception 'Only administrators can change customer roles';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_customer_role_escalation on public.customers;
create trigger prevent_customer_role_escalation
before update on public.customers
for each row execute function public.prevent_role_escalation();

-- Catalog: public read for active rows.
drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories
  for select to anon, authenticated using (is_active);

drop policy if exists "categories admin write" on public.categories;
create policy "categories admin write" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "subcategories public read" on public.subcategories;
create policy "subcategories public read" on public.subcategories
  for select to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.categories c
       where c.id = subcategories.category_id and c.is_active
    )
  );

drop policy if exists "subcategories admin write" on public.subcategories;
create policy "subcategories admin write" on public.subcategories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "collections public read" on public.collections;
create policy "collections public read" on public.collections
  for select to anon, authenticated using (is_active);

drop policy if exists "collections admin write" on public.collections;
create policy "collections admin write" on public.collections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products
  for select to anon, authenticated using (status = 'active');

drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "product images public read" on public.product_images;
create policy "product images public read" on public.product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
       where p.id = product_images.product_id and p.status = 'active'
    )
  );

drop policy if exists "product images admin write" on public.product_images;
create policy "product images admin write" on public.product_images
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "product variants public read" on public.product_variants;
create policy "product variants public read" on public.product_variants
  for select to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.products p
       where p.id = product_variants.product_id and p.status = 'active'
    )
  );

drop policy if exists "product variants admin write" on public.product_variants;
create policy "product variants admin write" on public.product_variants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Customers: own profile only, administrators can manage all.
drop policy if exists "customers read own or admin" on public.customers;
create policy "customers read own or admin" on public.customers
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "customers insert own" on public.customers;
create policy "customers insert own" on public.customers
  for insert to authenticated
  with check (id = auth.uid() and role = 'customer');

drop policy if exists "customers update own or admin" on public.customers;
create policy "customers update own or admin" on public.customers
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "customers admin delete" on public.customers;
create policy "customers admin delete" on public.customers
  for delete to authenticated using (public.is_admin());

-- Orders: a customer can read their own orders; inserts go through the server/RPC.
drop policy if exists "orders read own or admin" on public.orders;
create policy "orders read own or admin" on public.orders
  for select to authenticated
  using (
    customer_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
    or public.is_admin()
  );

drop policy if exists "orders insert own" on public.orders;
create policy "orders insert own" on public.orders
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );

drop policy if exists "orders admin write" on public.orders;
create policy "orders admin write" on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "order items read own or admin" on public.order_items;
create policy "order items read own or admin" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and (
           o.customer_id = auth.uid()
           or lower(o.email) = lower(coalesce(auth.jwt()->>'email', ''))
           or public.is_admin()
         )
    )
  );

drop policy if exists "order items admin write" on public.order_items;
create policy "order items admin write" on public.order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Reviews: approved reviews are public, customers can submit pending reviews.
drop policy if exists "reviews public read approved" on public.reviews;
create policy "reviews public read approved" on public.reviews
  for select to anon, authenticated
  using (status = 'approved' or customer_id = auth.uid() or public.is_admin());

drop policy if exists "reviews insert own" on public.reviews;
create policy "reviews insert own" on public.reviews
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'pending'
    and rating between 1 and 5
  );

drop policy if exists "reviews admin write" on public.reviews;
create policy "reviews admin write" on public.reviews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Inquiries and newsletter: anyone can submit, only admins can read.
drop policy if exists "inquiries public insert" on public.inquiries;
create policy "inquiries public insert" on public.inquiries
  for insert to anon, authenticated with check (true);

drop policy if exists "inquiries admin read" on public.inquiries;
create policy "inquiries admin read" on public.inquiries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "newsletter public insert" on public.newsletter_subscribers;
create policy "newsletter public insert" on public.newsletter_subscribers
  for insert to anon, authenticated with check (true);

drop policy if exists "newsletter admin read" on public.newsletter_subscribers;
create policy "newsletter admin read" on public.newsletter_subscribers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Editorial content: public read when active and inside the scheduled window.
drop policy if exists "hero slides public read" on public.hero_slides;
create policy "hero slides public read" on public.hero_slides
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists "hero slides admin write" on public.hero_slides;
create policy "hero slides admin write" on public.hero_slides
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "editorial looks public read" on public.editorial_looks;
create policy "editorial looks public read" on public.editorial_looks
  for select to anon, authenticated using (is_active);

drop policy if exists "editorial looks admin write" on public.editorial_looks;
create policy "editorial looks admin write" on public.editorial_looks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "announcements public read" on public.announcements;
create policy "announcements public read" on public.announcements
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists "announcements admin write" on public.announcements;
create policy "announcements admin write" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "delivery settings public read" on public.delivery_settings;
create policy "delivery settings public read" on public.delivery_settings
  for select to anon, authenticated using (true);

drop policy if exists "delivery settings admin write" on public.delivery_settings;
create policy "delivery settings admin write" on public.delivery_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "faqs public read" on public.faqs;
create policy "faqs public read" on public.faqs
  for select to anon, authenticated using (is_active);

drop policy if exists "faqs admin write" on public.faqs;
create policy "faqs admin write" on public.faqs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Explicit grants (Supabase's default privileges also cover these, but this keeps
-- the intent readable and works on a plain PostgreSQL instance used for testing).
grant select on public.categories, public.subcategories, public.collections,
  public.products, public.product_images, public.product_variants,
  public.hero_slides, public.editorial_looks, public.announcements,
  public.delivery_settings, public.faqs to anon, authenticated;

grant select on public.reviews to anon, authenticated;
grant insert on public.reviews to authenticated;
grant insert on public.inquiries, public.newsletter_subscribers to anon, authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert on public.orders, public.order_items to authenticated;

grant all on public.categories, public.subcategories, public.collections,
  public.products, public.product_images, public.product_variants,
  public.customers, public.orders, public.order_items, public.reviews,
  public.inquiries, public.newsletter_subscribers, public.hero_slides,
  public.editorial_looks, public.announcements, public.delivery_settings,
  public.faqs to service_role;

grant usage, select on sequence public.order_number_seq to service_role;
