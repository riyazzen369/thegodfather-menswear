# Catalogue admin (live products)

The site can read its products from a Supabase database instead of `src/data.ts`. The store staff edit them at **`/admin/`**
(`https://riyazzen369.github.io/thegodfather-menswear/admin/`). Changes show on open copies of the site within a second or two (realtime), no redeploy.

## Using the admin

1. Open `/admin/` and sign in with the email and password you were given. There is no sign-up; only accounts listed in `public.admins` can change anything.
2. **Products** lists everything, live and hidden. The checkbox on each row publishes or hides it immediately.
3. **Add product** / **Edit**: name, collection, category, price ("Price from", empty = on request), order (lower first), tagline, fabric, description, fit / made to measure / delivery.
   - **Elite** pieces appear in the vault (Elite Wardrobe) *and* the Attire Collection. **Attire** pieces appear in the Attire Collection only.
   - **Front photo** (required) and **Back photo** (optional): drop any photo, even a phone shot of a T-shirt on a bed. In the browser
     (`src/admin/normalize.ts`) it is: background removed (`@imgly/background-removal`, `isnet_quint8`, loaded only on `/admin/`, model ~40 MB
     fetched from IMG.LY's CDN the first time; if that fails, a plain-backdrop colour key is used and the note says so), cropped to the garment,
     placed on the house 3:4 frame (1200x1600, top at 11%, centred, inside 72% x 76%, like `public/img/cut/*`), lightly warmed, exported as WebP.
     The front also gets a vault photo on the red-velvet plate (`public/img/plate.webp`, 864x1152) and a blur preview. The back is sized to the
     front's placed height so the flip lines up.
   - Previews: **In the vault** (the plate photo) and the drag-to-flip card on the plinth. **Size / Left-right / Up-down** nudges per face are saved
     (`nudge`), and the background-removed sources are kept (`src_paths`) so **Adjust framing** works later without re-uploading.
   - No back photo: the site shows a plain back cut from the front outline.
4. **Save**. **Delete** removes the product and its photos (asks first).

If the database is ever unreachable, the site shows the last catalogue that browser saw, or the bundled pieces in `src/data.ts` on a first visit.

## How it is wired

| Piece | Where |
|---|---|
| Schema, RLS, storage bucket, realtime | `supabase/migrations/20261123000000_products.sql` |
| Site data layer (anon key, fallback, realtime) | `src/supa.ts`, `src/main.tsx` |
| Admin page | `admin/index.html`, `src/admin/` |
| Seed the bundled 12 pieces | `scripts/seed-supabase.mjs` (`npm run seed`) |
| Create / reset an admin account | `scripts/create-admin.mjs` (`npm run admin:create -- owner@example.com out.txt`) |

**Tables.** `products` (one row per piece: `slug`, `name`, `collection` premium/attire, `category`, `price_from`, `tagline`, `description`, `fabric`,
`details` jsonb, `colours` jsonb, `front_path`, `front_cut_path`, `back_path`, `extra_paths` jsonb, `blur`, `sort`, `published`, `updated_at`),
`admins` (allow-list of auth user ids), `catalogue_rev` (one public row bumped by a trigger on every product change; the site subscribes to it,
because a direct subscription on `products` would miss *unpublish* events that RLS hides from anon).

**Security.** RLS on every table. Anon reads published products only and cannot write anything. Writes to `products`, `admins` and the `products`
bucket need a signed-in user in `admins` (`private.is_admin()`, security definer in a non-exposed schema). The bucket is public for reads (CDN URLs),
limited to images up to 5 MB. Only the **anon** key is in the site build; the service-role key is used by the two scripts from your machine and must never
be committed or put in `.env`.

## Setup from scratch

1. Create a Supabase project (free tier is enough). Run the migration: Supabase dashboard → SQL editor → paste the file, or `supabase db push`.
2. Authentication → Sign In / Providers → Email: keep **email + password on**, turn **"Allow new users to sign up" off**.
3. From your machine (Project Settings → API keys for the service-role key):
   ```bash
   export SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service-role key>
   npm run seed                                   # uploads the 12 bundled pieces and their photos
   npm run admin:create -- owner@example.com
   ```
4. Put the public values in `.env.production.local` (see `.env.example`) and deploy:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   ```
   Without them the build simply uses `src/data.ts`. `?bundled` on the site URL forces the bundled pieces (handy for comparisons).

## Licence note

`@imgly/background-removal` is **AGPL-3.0**. It is only in the admin page's chunks (the store bundle is checked to be free of it), but serving it
publicly still counts as distribution. Either keep the repo's source public under terms compatible with that, buy IMG.LY's commercial licence, or swap
`cutOut()` in `src/admin/normalize.ts` for another remover (the colour-key fallback needs no library).

## Tests

- `npm run test:rls`: runs the migration in PGlite (Postgres in WASM) and checks every access rule as anon, a signed-in non-admin and an admin (20 checks, offline).
- `npm run test:live`: builds with a mock Supabase URL and, in Chromium, checks the site reads published rows with the anon key, the grid / sheet / vault / flip view use DB data, a live change appears without reload, an unreachable DB falls back to the bundled pieces, and the admin sign-in plus a phone-style T-shirt front + back (`tests/fixtures/`) through the normaliser: checks the WebP uploads, saved nudges, the 3:4 frame / 11% top / centring, back height = front height, the vault plate photo, and that the store bundle has no background-removal code.

## Tabs (admin page)

- **Elite wardrobe**: exactly 12 slots, in vault order. Drag a piece onto another slot (or use the arrows) to reorder; "To Attire" moves a piece out.
- **Attire collection**: up to 45 products. Each has up to 4 photos. Every photo is compressed (about 150 KB), cut out of its background, framed
  and placed on the house velvet plate. A busy photo is handled automatically: the garment is the big central object, objects touching it stay,
  everything else is left out. **Fix cut-out** lets you tap objects to include or leave out, and paint with Erase / Restore.
- **Orders**: status and a Paid box per order (needs the `paid` columns, migration `20261125000000_orders_paid.sql`).
- **Sales & payments**: sales, money received, still to receive, by day/month, payment method, status, best sellers, sizes, a transactions table and CSV.

The first photo upload downloads the background model (about 90 MB, once). Tests: `npm run test:admin`, `npm run test:attire`.
