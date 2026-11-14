-- Local smoke test for migrations + seed. Runs in a transaction and rolls back.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'customer@example.com', '{"full_name":"Test Customer"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'admin@example.com', '{"full_name":"Test Admin"}'::jsonb)
on conflict (id) do nothing;

update public.customers set role = 'admin' where email = 'admin@example.com';

do $$
declare
  product_count integer;
  pending_count integer;
  order_row public.orders;
  item_count integer;
begin
  select count(*) into product_count from public.products where status = 'active';
  if product_count <> 193 then
    raise exception 'expected 193 active products, got %', product_count;
  end if;

  select count(*) into pending_count from public.product_images where is_primary;
  if pending_count <> 193 then
    raise exception 'expected one primary image per product, got %', pending_count;
  end if;

  order_row := public.place_order(
    'customer@example.com',
    '[{"productId":8,"quantity":2}]'::jsonb,
    '11111111-1111-1111-1111-111111111111'::uuid,
    '{"city":"New York"}'::jsonb,
    null,
    'smoke test',
    '{"payment_provider":"none"}'::jsonb
  );

  if order_row.total <> 1030 then
    raise exception 'expected order total 1030, got %', order_row.total;
  end if;

  select count(*) into item_count from public.order_items where order_id = order_row.id;
  if item_count <> 1 then
    raise exception 'expected 1 order item, got %', item_count;
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"customer@example.com","role":"authenticated"}',
  true
);

insert into public.reviews (product_id, customer_id, author_name, rating, body, status)
values (8, '11111111-1111-1111-1111-111111111111', 'Test Customer', 5, 'Smoke review', 'pending');

select count(*) as own_orders from public.orders where customer_id = auth.uid();

reset role;

set local role anon;
insert into public.inquiries (name, email, message) values ('Guest', 'guest@example.com', 'Hello');
insert into public.newsletter_subscribers (email) values ('guest@example.com');
reset role;

rollback;
