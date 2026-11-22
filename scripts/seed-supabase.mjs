#!/usr/bin/env node
/* Seed the live catalogue with the bundled pieces (src/data.ts): uploads the photos to the `products` bucket
   and upserts one row per piece. Safe to re-run (upsert by slug, upload with upsert).
   Needs the service-role key, which must never be in the site build:
     SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase.mjs */
import { build } from 'vite'
import { readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const root = new URL('..', import.meta.url).pathname
const out = mkdtempSync(join(tmpdir(), 'gf-seed-'))
await build({ root, logLevel: 'silent', configFile: false, build: { outDir: out, ssr: join(root, 'src/data.ts'), rollupOptions: { output: { format: 'es', entryFileNames: 'data.mjs' } } } })
const { ITEMS } = await import(join(out, 'data.mjs'))
const lq = readFileSync(join(root, 'src/lqip.ts'), 'utf8')
const LQIP = Object.fromEntries([...lq.matchAll(/"([^"]+)": "([^"]+)"/g)].map(m => [m[1], m[2]]))

const sb = createClient(url, key, { auth: { persistSession: false } })
const up = async (local, path) => {
  const { error } = await sb.storage.from('products').upload(path, readFileSync(local), { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
  if (error) throw new Error(`${path}: ${error.message}`)
  return path
}
let sort = 10
for (const it of ITEMS) {
  const slug = it.images[0].src.match(/img\/([^/]+)-1\.webp$/)[1]
  const file = n => join(root, 'public/img', `${slug}-${n}.webp`)
  const front = await up(file(1), `${slug}/front.webp`)
  const cutLocal = join(root, 'public/img/cut', `${slug}-1.webp`)
  const cut = existsSync(cutLocal) ? await up(cutLocal, `${slug}/front-cut.webp`) : null
  const extra = []
  for (const [n, img] of it.images.slice(1).entries()) { const m = img.src.match(/-(\d)\.webp$/); extra.push({ path: await up(file(m[1]), `${slug}/extra-${n + 1}.webp`), alt: img.alt }) }
  const row = {
    slug, name: it.name, collection: 'premium', category: it.category, price_from: it.price, tagline: it.tagline,
    description: '', fabric: it.fabric, details: it.details, colours: it.colours, front_path: front, front_cut_path: cut,
    back_path: null, extra_paths: extra, blur: LQIP[`${slug}-1`] ?? null, sort, published: true
  }
  sort += 10
  const { error } = await sb.from('products').upsert(row, { onConflict: 'slug' })
  if (error) throw new Error(`${slug}: ${error.message}`)
  console.log('seeded', slug)
}
console.log(`done: ${ITEMS.length} pieces`)
