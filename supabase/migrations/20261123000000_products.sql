-- The Godfather Menswear: live product catalogue.
-- Public (anon) can read published products; only allow-listed admins can write. Images live in the public `products` bucket.

-- admins allow-list (by auth user id; email kept for humans)
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- is the caller an admin? security definer in a private schema so it can read admins without exposing it
create schema if not exists private;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated, anon;
grant execute on function private.is_admin() to authenticated, anon;

create policy "admins read the allow-list" on public.admins for select to authenticated using ((select private.is_admin()));

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 80),
  collection text not null default 'premium' check (collection in ('premium', 'attire')),
  category text not null default 'formal' check (category in ('formal', 'wedding', 'statement', 'shirts')),
  price_from integer check (price_from is null or price_from >= 0),
  tagline text not null default '',
  description text not null default '',
  fabric text not null default '',
  details jsonb not null default '{}'::jsonb,          -- { fit, madeToMeasure, delivery }
  colours jsonb not null default '[]'::jsonb,          -- [{ name, hex }]
  front_path text,                                     -- storage path in bucket `products` (the photo shown in the vault and grid)
  front_cut_path text,                                 -- optional transparent cut-out for the flip view
  back_path text,                                      -- optional back photo; empty = shared plain back
  extra_paths jsonb not null default '[]'::jsonb,      -- more gallery photos for the detail sheet: [{ path, alt }]
  blur text,                                           -- tiny data-URL placeholder
  sort integer not null default 100,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_published_sort on public.products (published, collection, sort);

create or replace function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function private.touch_updated_at();

alter table public.products enable row level security;
create policy "public reads published" on public.products for select to anon, authenticated using (published or (select private.is_admin()));
create policy "admins insert" on public.products for insert to authenticated with check ((select private.is_admin()));
create policy "admins update" on public.products for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete" on public.products for delete to authenticated using ((select private.is_admin()));

-- realtime: a one-row public "revision" bumped on every product change. The site subscribes to it and re-reads.
-- (Subscribing to products directly would miss unpublish events: RLS hides the new row from anon.)
create table if not exists public.catalogue_rev (id smallint primary key default 1 check (id = 1), rev bigint not null default 0, at timestamptz not null default now());
insert into public.catalogue_rev (id) values (1) on conflict do nothing;
alter table public.catalogue_rev enable row level security;
create policy "public reads the revision" on public.catalogue_rev for select to anon, authenticated using (true);
create or replace function private.bump_rev() returns trigger language plpgsql security definer set search_path = '' as $$
begin update public.catalogue_rev set rev = rev + 1, at = now() where id = 1; return null; end $$;
drop trigger if exists products_bump on public.products;
create trigger products_bump after insert or update or delete on public.products for each statement execute function private.bump_rev();
alter publication supabase_realtime add table public.catalogue_rev;

-- storage: public bucket for product images (reads are public via the CDN URL); writes for admins only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 5242880, array['image/webp', 'image/avif', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "admins read product files" on storage.objects for select to authenticated using (bucket_id = 'products' and (select private.is_admin()));
create policy "admins upload product files" on storage.objects for insert to authenticated with check (bucket_id = 'products' and (select private.is_admin()));
create policy "admins replace product files" on storage.objects for update to authenticated using (bucket_id = 'products' and (select private.is_admin())) with check (bucket_id = 'products' and (select private.is_admin()));
create policy "admins delete product files" on storage.objects for delete to authenticated using (bucket_id = 'products' and (select private.is_admin()));
