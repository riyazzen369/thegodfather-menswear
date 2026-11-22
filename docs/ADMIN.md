# Catalogue admin (live products)

The site can read its products from a Supabase database instead of `src/data.ts`. The store staff edit them at **`/admin/`**
(`https://riyazzen369.github.io/thegodfather-menswear/admin/`). Changes show on open copies of the site within a second or two (realtime), no redeploy.

## Using the admin

1. Open `/admin/` and sign in with the email and password you were given. There is no sign-up; only accounts listed in `public.admins` can change anything.
2. **Products** lists everything, live and hidden. The checkbox on each row publishes or hides it immediately.
3. **Add product** / **Edit**: name, collection, category, price ("Price from", empty = on request), order (lower first), tagline, fabric, description, fit / made to measure / delivery.
   - **Premium** pieces appear in the vault (Premium Wardrobe) *and* the Attire Tour. **Attire** pieces appear in the Attire Tour only.
   - **Front photo** (required) and **Back photo** (optional): drop a file or choose one. It is resized to max 1600px WebP in your browser and a tiny blurred preview is made for fast loading. Drag the preview to flip it front/back as the site will.
   - No back photo: the site shows a plain back cut from the front outline. This looks best with a transparent cut-out or a plain backdrop. (Background removal is not done in the browser; prepare cut-outs beforehand if you want them.)
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
   npm run admin:create -- owner@example.com ADMIN-CREDENTIALS.txt
   ```
4. Put the public values in `.env.production.local` (see `.env.example`) and deploy:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   ```
   Without them the build simply uses `src/data.ts`. `?bundled` on the site URL forces the bundled pieces (handy for comparisons).

## Tests

- `npm run test:rls`: runs the migration in PGlite (Postgres in WASM) and checks every access rule as anon, a signed-in non-admin and an admin (20 checks, offline).
- `npm run test:live`: builds with a mock Supabase URL and, in Chromium, checks the site reads published rows with the anon key, the grid / sheet / vault / flip view use DB data, a live change appears without reload, an unreachable DB falls back to the bundled pieces, and the admin sign-in, WebP upload and create flow (desktop + mobile).
