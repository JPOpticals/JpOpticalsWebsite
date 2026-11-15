-- Keep the admin change stream complete for records created from the storefront.
-- Run after 202611140004_admin.sql so site_events and record_site_event exist.

do $$
declare
  table_name text;
  table_names text[] := array[
    'customers',
    'inquiries',
    'newsletter_subscribers'
  ];
begin
  foreach table_name in array table_names loop
    execute format('drop trigger if exists site_event_%s on public.%I', table_name, table_name);
    execute format(
      'create trigger site_event_%s after insert or update or delete on public.%I for each row execute function public.record_site_event()',
      table_name,
      table_name
    );
  end loop;
end;
$$;
