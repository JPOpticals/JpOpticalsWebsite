-- JP / Supabase functions, triggers and transactional order creation
-- Run after 202611140001_schema.sql.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
  trigger_name text;
  tables text[] := array[
    'categories',
    'subcategories',
    'collections',
    'products',
    'product_images',
    'product_variants',
    'customers',
    'orders',
    'reviews',
    'inquiries',
    'newsletter_subscribers',
    'hero_slides',
    'editorial_looks',
    'announcements',
    'delivery_settings',
    'faqs'
  ];
begin
  foreach table_name in array tables loop
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

create or replace function public.ensure_single_primary_image()
returns trigger
language plpgsql
as $$
begin
  if new.is_primary then
    update public.product_images
       set is_primary = false,
           updated_at = now()
     where product_id = new.product_id
       and id <> new.id
       and is_primary = true;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_single_primary_image on public.product_images;
create trigger ensure_single_primary_image
before insert or update of is_primary on public.product_images
for each row execute function public.ensure_single_primary_image();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.customers
     where id = auth.uid()
       and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customers (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.customers.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Atomic order creation. Prices are read from the database, never trusted from the client.
create or replace function public.place_order(
  p_email text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_shipping_address jsonb default null,
  p_billing_address jsonb default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
  v_quantity integer;
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_image_url text;
begin
  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'An email address is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must contain at least one item';
  end if;

  insert into public.orders (
    email,
    customer_id,
    shipping_address,
    billing_address,
    notes,
    metadata
  )
  values (
    lower(trim(p_email)),
    p_customer_id,
    p_shipping_address,
    p_billing_address,
    p_notes,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));

    select *
      into v_product
      from public.products
     where id = (v_item->>'productId')::bigint
       and status = 'active';

    if not found then
      raise exception 'Product % is unavailable', coalesce(v_item->>'productId', '(missing)');
    end if;

    v_unit_price := coalesce(
      (select price_override
         from public.product_variants
        where id = nullif(v_item->>'variantId', '')::bigint
          and product_id = v_product.id
          and is_active),
      v_product.price
    );

    select url
      into v_image_url
      from public.product_images
     where product_id = v_product.id
     order by is_primary desc, sort_order asc, created_at asc
     limit 1;

    insert into public.order_items (
      order_id,
      product_id,
      variant_id,
      name,
      sku,
      image_url,
      unit_price,
      quantity,
      metadata
    )
    values (
      v_order.id,
      v_product.id,
      nullif(v_item->>'variantId', '')::bigint,
      v_product.name,
      v_product.model,
      v_image_url,
      v_unit_price,
      v_quantity,
      jsonb_build_object('path', v_product.path)
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
  end loop;

  update public.orders
     set subtotal = v_subtotal,
         total = v_subtotal,
         updated_at = now()
   where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.place_order(text, jsonb, uuid, jsonb, jsonb, text, jsonb) from public;
revoke all on function public.place_order(text, jsonb, uuid, jsonb, jsonb, text, jsonb) from anon;
revoke all on function public.place_order(text, jsonb, uuid, jsonb, jsonb, text, jsonb) from authenticated;
grant execute on function public.place_order(text, jsonb, uuid, jsonb, jsonb, text, jsonb) to service_role;
