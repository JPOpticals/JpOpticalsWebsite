-- Preserve customer-written product requirements on each order line.
-- Run after 202611180001_product_variants.sql.

alter table public.order_items
  add column if not exists customer_requirements text
  check (customer_requirements is null or char_length(customer_requirements) <= 1000);

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
  v_variant public.product_variants;
  v_frame public.customizer_frames;
  v_lens public.customizer_lenses;
  v_product_id bigint;
  v_frame_id uuid;
  v_lens_id uuid;
  v_variant_id bigint;
  v_quantity integer;
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_image_url text;
  v_sku text;
  v_item_name text;
  v_item_metadata jsonb;
  v_requirements text;
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
    v_frame_id := nullif(v_item->>'customizerFrameId', '')::uuid;
    v_lens_id := nullif(v_item->>'customizerLensId', '')::uuid;
    v_product_id := nullif(v_item->>'productId', '')::bigint;
    v_variant_id := nullif(v_item->>'variantId', '')::bigint;
    v_requirements := nullif(trim(coalesce(v_item->>'requirements', '')), '');

    if (v_frame_id is null) <> (v_lens_id is null) then
      raise exception 'A custom frame and lens must be selected together';
    end if;

    if v_frame_id is not null then
      select *
        into v_frame
        from public.customizer_frames
       where id = v_frame_id
         and is_active;
      if not found then
        raise exception 'Custom frame % is unavailable', v_frame_id;
      end if;

      select *
        into v_lens
        from public.customizer_lenses
       where id = v_lens_id
         and is_active;
      if not found then
        raise exception 'Custom lens % is unavailable', v_lens_id;
      end if;

      if v_product_id is null then
        v_product_id := v_frame.product_id;
      end if;

      if exists (
        select 1 from public.customizer_frame_lenses
         where frame_id = v_frame_id
           and is_active
      ) and not exists (
        select 1 from public.customizer_frame_lenses
         where frame_id = v_frame_id
           and lens_id = v_lens_id
           and is_active
      ) then
        raise exception 'This lens is not compatible with the selected frame';
      end if;
    end if;

    select *
      into v_product
      from public.products
     where id = v_product_id
       and status = 'active';

    if not found then
      raise exception 'Product % is unavailable', coalesce(v_product_id::text, '(missing)');
    end if;

    v_image_url := null;
    v_sku := v_product.model;
    v_item_metadata := jsonb_build_object('path', v_product.path);

    if v_frame_id is not null then
      v_variant_id := null;
      v_unit_price := v_frame.price + coalesce(
        (
          select price_override
            from public.customizer_frame_lenses
           where frame_id = v_frame_id
             and lens_id = v_lens_id
             and is_active
        ),
        v_lens.price
      );
      v_item_name := v_frame.name || ' / ' || v_lens.name;
      v_image_url := nullif(v_frame.image_url, '');
      v_item_metadata := jsonb_build_object(
        'path', v_product.path,
        'customizer', jsonb_build_object(
          'frameId', v_frame.id,
          'frameName', v_frame.name,
          'lensId', v_lens.id,
          'lensName', v_lens.name,
          'lensType', v_lens.lens_type,
          'lensColor', v_lens.color
        )
      );
    elsif v_variant_id is not null then
      select *
        into v_variant
        from public.product_variants
       where id = v_variant_id
         and product_id = v_product.id
       for update;

      if not found then
        raise exception 'The selected variant is unavailable';
      end if;
      if not v_variant.is_active then
        raise exception 'The selected variant is no longer available';
      end if;
      if v_variant.stock is not null and v_variant.stock < v_quantity then
        raise exception 'Only % left of the selected variant', coalesce(v_variant.stock, 0);
      end if;

      v_unit_price := coalesce(v_variant.price_override, v_product.price);
      v_item_name := v_product.name;
      v_sku := coalesce(v_variant.sku, v_product.model);
      v_image_url := v_variant.image_url;
      v_item_metadata := jsonb_build_object(
        'path', v_product.path,
        'shape', v_variant.shape,
        'design', v_variant.design,
        'color', v_variant.color,
        'colorCode', v_variant.color_code,
        'size', v_variant.size
      );

      update public.product_variants
         set stock = greatest(0, coalesce(stock, 0) - v_quantity),
             updated_at = now()
       where id = v_variant.id;
    else
      v_unit_price := v_product.price;
      v_item_name := v_product.name;
    end if;

    if v_image_url is null then
      select url
        into v_image_url
        from public.product_images
       where product_id = v_product.id
         and (v_variant_id is null or variant_id = v_variant_id or variant_id is null)
       order by (variant_id = v_variant_id) desc, is_primary desc, sort_order asc, created_at asc
       limit 1;
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      variant_id,
      name,
      sku,
      image_url,
      unit_price,
      quantity,
      customer_requirements,
      metadata
    )
    values (
      v_order.id,
      v_product.id,
      v_variant_id,
      v_item_name,
      v_sku,
      v_image_url,
      v_unit_price,
      v_quantity,
      v_requirements,
      v_item_metadata
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
