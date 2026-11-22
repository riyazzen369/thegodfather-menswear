# Handoff: finish the live product catalogue (GitHub Copilot)

Branch: `feature/live-products` (main = stable live site, do not break it).
Read first: `docs/ADMIN.md`, `docs/ARCHITECTURE.md`, `supabase/migrations/20261123000000_products.sql`.

## Done
- Supabase schema + RLS + storage + realtime (migration file, verified locally in PGlite).
- Site data layer: reads Supabase live, falls back to bundled 12 ITEMS.
- `/admin/` page: email/password login, product list, add/edit, publish, front/back upload,
  normaliser (background removal, auto-crop, 3:4 house frame, warm grade, back sized to front, nudges), flip preview.
- Scripts: `npm run seed`, `npm run admin:create`. Tests: `npm test`, `npm run test:inspect`, `npm run test:live` (mocked Supabase).

## Left to do (in order)
1. Create a FREE Supabase project at supabase.com (region Mumbai ap-south-1). Copy URL, anon key, service_role key.
2. Supabase SQL editor: run `supabase/migrations/20261123000000_products.sql`.
3. Auth settings: turn OFF public sign-ups.
4. Locally, create `.env.local` (never commit):
   VITE_SUPABASE_URL=...  VITE_SUPABASE_ANON_KEY=...  SUPABASE_SERVICE_ROLE_KEY=...
   Then `npm run seed` and `npm run admin:create` (sets the client admin login).
5. Create `.env.production.local` with only the VITE_ URL + anon key.
6. Re-run `npm test` (one flaky check: "vertical wheel gesture = one piece") and `npm run test:live`
   (backdrop threshold was loosened, re-run to confirm).
7. Merge to main, `npm run deploy` (never publish a CNAME), open /thegodfather-menswear/admin/ and upload a test T-shirt front+back; confirm it appears live within seconds.

## Notes
- Background removal library is AGPL-3.0 (admin-only, ~24 MB lazy asset). If licence is a concern, swap for a server/API remover or the built-in backdrop-key fallback.
- Service-role key must never be in `dist/` or the repo.

## Copilot prompt
"Open HANDOFF-COPILOT.md and docs/ADMIN.md. I've created a Supabase project and put keys in .env.local and .env.production.local. Apply the migration, run the seed and admin scripts, run npm test and npm run test:live and fix any failures without loosening tests, verify no service key in dist, then merge feature/live-products into main and run npm run deploy. Walk me through each step and stop on any error."
