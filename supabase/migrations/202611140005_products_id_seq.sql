create sequence if not exists public.products_id_seq;

do $$
declare
  max_id bigint;
begin
  select coalesce(max(id), 0) + 1 into max_id from public.products;
  if exists (select 1 from public.products) then
    perform setval('public.products_id_seq', max_id, false);
  end if;
end $$;

alter table public.products
  alter column id set default nextval('public.products_id_seq');
