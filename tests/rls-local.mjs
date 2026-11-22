/* Offline check of supabase/migrations: runs them in PGlite (Postgres in WASM) on a minimal stand-in for Supabase's
   auth/storage schemas, then proves the access rules as anon, as a signed-in non-admin, and as an admin.
   node tests/rls-local.mjs */
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
const db = new PGlite()
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated; grant all on storage.objects to anon, authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`)
const dir = new URL('../supabase/migrations/', import.meta.url)
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'))
const ADMIN = '11111111-1111-1111-1111-111111111111', USER = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users values ('${ADMIN}','owner@example.com'),('${USER}','someone@example.com');
  insert into public.admins (user_id, email) values ('${ADMIN}','owner@example.com');
  insert into public.products (slug, name, front_path, published) values ('live-one','Live',  'live-one/front.webp', true), ('draft-one','Draft','draft-one/front.webp', false);`)
let fails = 0
const as = async (role, sub, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false); set role ${role};`)
  try { const r = await db.query(sql); return { rows: r.rows, n: r.affectedRows ?? 0 } } catch (e) { return { err: e.message } } finally { await db.exec('reset role') }
}
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++ }
let r
r = await as('anon', null, 'select slug from public.products order by slug'); check('anon reads only published', r.rows?.length === 1 && r.rows[0].slug === 'live-one', r)
r = await as('anon', null, `insert into public.products (slug, name) values ('x','X')`); check('anon insert denied', !!r.err, r)
r = await as('anon', null, `update public.products set name='hacked'`); check('anon update changes nothing', !r.err && r.n === 0, r)
r = await as('anon', null, `delete from public.products`); check('anon delete changes nothing', !r.err && r.n === 0, r)
r = await as('anon', null, `select * from public.admins`); check('anon cannot list admins', !!r.err || r.rows.length === 0, r)
r = await as('anon', null, `insert into storage.objects (bucket_id, name) values ('products','evil.webp')`); check('anon upload denied', !!r.err, r)
r = await as('authenticated', USER, `insert into public.products (slug, name) values ('y','Y')`); check('signed-in non-admin insert denied', !!r.err, r)
r = await as('authenticated', USER, `update public.products set name='hacked'`); check('signed-in non-admin update changes nothing', !r.err && r.n === 0, r)
r = await as('authenticated', USER, `insert into public.admins values ('${USER}','someone@example.com')`); check('non-admin cannot add self as admin', !!r.err, r)
r = await as('authenticated', USER, `insert into storage.objects (bucket_id, name) values ('products','evil.webp')`); check('non-admin upload denied', !!r.err, r)
r = await as('authenticated', ADMIN, 'select slug from public.products'); check('admin sees drafts too', r.rows?.length === 2, r)
r = await as('authenticated', ADMIN, `insert into public.products (slug, name, front_path, published) values ('new-one','New','new-one/front.webp', true)`); check('admin insert', !r.err, r)
r = await as('authenticated', ADMIN, `update public.products set published=false where slug='live-one'`); check('admin update', !r.err && r.n === 1, r)
r = await as('authenticated', ADMIN, `insert into storage.objects (bucket_id, name) values ('products','new-one/front.webp')`); check('admin upload', !r.err, r)
r = await as('authenticated', ADMIN, `insert into storage.objects (bucket_id, name) values ('other','x.webp')`); check('admin cannot write other buckets', !!r.err, r)
r = await as('authenticated', ADMIN, `delete from public.products where slug='draft-one'`); check('admin delete', !r.err && r.n === 1, r)
r = await as('anon', null, 'select rev from public.catalogue_rev'); check('revision bumped on each change and public', r.rows?.[0]?.rev >= 3, r)
r = await as('authenticated', ADMIN, `insert into public.products (slug, name) values ('Bad Slug','X')`); check('slug format enforced', !!r.err, r)
r = await as('anon', null, `update public.catalogue_rev set rev = 0`); check('anon cannot touch revision', !!r.err || r.n === 0, r)
r = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`); check('realtime publishes catalogue_rev', r.rows.some(x => x.tablename === 'catalogue_rev'), r.rows)
console.log(fails ? `${fails} failed` : 'all RLS checks passed'); process.exit(fails ? 1 : 0)
