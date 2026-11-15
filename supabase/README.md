# Supabase + ImageKit

The site keeps its mirrored HTML in `public/`, but catalog, content, accounts, orders, reviews, inquiries, and newsletter signups are served by Next.js API routes backed by Supabase. Product media is stored in ImageKit and its URLs/metadata are recorded in `public.product_images`.

## Environment

Set these in `.env` (already loaded by Next.js at runtime). Never commit real values.

| Variable | Used by |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | server clients + health check |
| `NEXT_Publishable_key` | server anon client / auth |
| `SUPABASE_Secret_key` | server-only admin client |
| `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | ImageKit auth + delivery URLs |
| `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` | ImageKit auth signature payload |
| `IMAGEKIT_PRIVATE_KEY` | server-only uploads, deletes, signing |

`lib/env.ts` reports whether Supabase and ImageKit are configured. When Supabase is missing the catalog falls back to `public/search-index.json`, content falls back to `supabase/seed/content.json`, and mutating endpoints return `503`.

## Apply the database

Migrations live in `supabase/migrations/` and are ordered:

1. `202611140001_schema.sql` — tables, constraints, indexes, `updated_at` triggers.
2. `202611140002_functions.sql` — `place_order`, `is_admin`, auth-user profile trigger.
3. `202611140003_rls.sql` — row-level security, grants, role-escalation guard.
4. `202611140004_admin.sql` - category/hero image columns, initial-admin helper, `site_events`, and change-event triggers.
5. `202611140005_products_id_seq.sql` - generated product ID sequence used by admin product creation.
6. `202611150001_eyewear_customizer.sql` - managed frame/lens catalogs, compatibility relationships, RLS, and live-update triggers.
7. `202611150002_customizer_orders.sql` - server-verified custom frame/lens order pricing.
8. `202611150003_customizer_preview_fit.sql` - optional frame-aligned lens mask assets for accurate live previews.
9. `202611150004_admin_realtime_events.sql` - change-stream triggers for customer, inquiry, and newsletter writes.

With the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Or paste each file into the Supabase SQL editor in that order.

For a local PostgreSQL instance (no Supabase Auth), load `supabase/tests/00_local_stubs.sql` first to create the `anon`, `authenticated`, `service_role` roles and the `auth` schema. The migrations and seed are idempotent and can be re-run.

## Seed the catalog and content

```bash
npm run supabase:seed
```

That regenerates `supabase/seed/seed.sql` from `public/mirror/` and `public/search-index.json`, and writes `supabase/seed/catalog.json`. Then apply the generated SQL:

```bash
psql "$DATABASE_URL" -f supabase/seed/seed.sql
```

Seed contents: 193 products, 41 collections, 702 product images, 3 variants, 7 FAQs, 15 reviews, 3 hero slides, 2 looks, 2 reels, 1 announcement, and delivery settings. Running it twice inserts nothing new.

## Create the first administrator

1. Register through the site account modal (Supabase Auth creates `auth.users` and the trigger creates `public.customers`).
2. Promote that customer:

```sql
update public.customers set role = 'admin' where email = 'you@example.com';
```

Admins can open `/admin` for the full management dashboard, including setup, catalog data, orders, customers, content, media, and metrics. The first administrator can be created through the one-time `/api/admin/setup` flow, then promoted manually if preferred.

All `/api/admin/*` management writes require an authenticated account with `customers.role = 'admin'`. Service-role credentials never reach the browser.

The storefront receives changes through `/api/realtime` as Server-Sent Events. The frontend invalidates the in-process catalog/content cache and refreshes only the affected view.

## API routes

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/health` | GET | none | configuration status |
| `/api/catalog` | GET | none | products, collections, categories (60s cache) |
| `/api/customizer` | GET | none | active frames, lenses, compatibility, and preview pricing |
| `/api/content` | GET | none | hero, looks, reels, announcements, delivery, FAQs, reviews |
| `/api/accounts/register` | POST | none | create Supabase user + customer profile |
| `/api/accounts/login` | POST | none | sign in, sets HttpOnly cookies |
| `/api/accounts/logout` | POST | none | clears session cookies |
| `/api/accounts/me` | GET | cookie/bearer | current customer |
| `/api/orders` | GET | customer | own orders |
| `/api/orders` | POST | customer or guest email | atomic `place_order` |
| `/api/reviews` | GET | none | approved reviews, optional `?productId=` |
| `/api/reviews` | POST | customer | submit a pending review |
| `/api/inquiries` | POST | none | contact form |
| `/api/newsletter` | POST | none | newsletter signup/upsert |
| `/api/imagekit/auth` | GET | admin | upload signature |
| `/api/admin/setup` | GET | none | whether a first admin is pending |
| `/api/admin/setup` | POST | public | one-time create of the first administrator |
| `/api/admin/stats` | GET | admin | revenue, sales, activity, needs-attention counts |
| `/api/admin/categories` | GET/POST | admin | list/create categories |
| `/api/admin/categories/[id]` | PATCH/DELETE | admin | update/delete category |
| `/api/admin/products` | GET/POST | admin | list/create products |
| `/api/admin/products/[id]` | PATCH/DELETE | admin | update/delete product |
| `/api/admin/orders` | GET/POST | admin | list orders |
| `/api/admin/orders/[id]` | PATCH/DELETE | admin | update/delete order |
| `/api/admin/customers` | GET/POST | admin | list/create customers |
| `/api/admin/customers/[id]` | PATCH/DELETE | admin | update/delete customer |
| `/api/admin/reviews` | GET/POST | admin | list/approve/reject? (update status) |
| `/api/admin/inquiries` | GET/POST | admin | list/update inquiries |
| `/api/admin/hero-slides` | GET/POST | admin | list/create/update hero slides |
| `/api/admin/announcements` | GET/POST | admin | list/create/update announcements |
| `/api/admin/delivery` | GET | admin | update delivery settings |
| `/api/admin/faqs` | GET/POST | admin | list/create/update FAQs |
| `/api/admin/[resource]` | GET/POST | admin | generic admin resource list/create |
| `/api/admin/[resource]/[id]` | GET/PATCH/DELETE | admin | generic admin resource CRUD |
| `/api/admin/upload` | POST | admin | upload one or more images to ImageKit |
| `/api/admin/media?productId=` | GET | admin | list product images |
| `/api/admin/media` | POST | admin | upload multiple/replace one |
| `/api/admin/media/[id]` | PATCH | admin | set primary, alt, sort order |
| `/api/admin/media/[id]` | DELETE | admin | delete from ImageKit + database |
| `/api/realtime` | GET | none | Server-Sent Events change stream |

Auth uses HttpOnly cookies `jp_access_token` and `jp_refresh_token`; the refresh token is exchanged on `/api/accounts/me` and other authenticated calls. Service-role credentials never reach the browser.

## Media flow

`/api/admin/media` uploads through `upload.imagekit.io` with `IMAGEKIT_PRIVATE_KEY`, stores `fileId`, `url`, `thumbnailUrl`, dimensions, size, MIME type, alt text, sort order, and primary flag in `product_images`, then invalidates the catalog cache. Replacements update the existing row and delete the old ImageKit file. Deletes remove the ImageKit file first and promote the next image when the primary was removed. Limits: 10 MB per file, images only.

Public delivery uses the ImageKit URL endpoint (`NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT`). The app never proxies image bytes.

## Verification

```bash
npx tsc --noEmit
node --check public/jp-ui.js
```

Database smoke test (local stub roles required):

```bash
psql "$DATABASE_URL" -f supabase/tests/00_local_stubs.sql
psql "$DATABASE_URL" -f supabase/tests/01_smoke.sql
```

The smoke test checks the seeded catalog, primary-image invariant, `place_order` totals, review insert, customer order visibility, anon inquiry/newsletter inserts, and rolls everything back.

## Backups

Use Supabase dashboard backups for hosted projects. For self-managed PostgreSQL:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=jp-$(date +%Y%m%d).dump
pg_restore --clean --if-exists --dbname "$DATABASE_URL" jp-YYYYMMDD.dump
```

ImageKit files are referenced by `product_images.imagekit_file_id`; keep database backups and ImageKit media in sync before restoring.
