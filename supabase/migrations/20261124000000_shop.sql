-- Shop: per-size stock on products, and customer orders (insert-only for the public, readable by admins).
alter table public.products add column if not exists sizes jsonb not null default '{}'::jsonb;  -- e.g. {"S":4,"M":0,"L":10}; {} = not tracked (all sizes offered)

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique check (char_length(ref) between 6 and 30),
  name text not null check (char_length(name) between 2 and 120),
  phone text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  address text not null check (char_length(address) between 8 and 600),
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  payment text not null check (payment in ('upi', 'cod', 'whatsapp')),
  utr text check (utr is null or char_length(utr) between 6 and 30),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  total integer not null check (total >= 0),
  delivery text,
  status text not null default 'new' check (status in ('new', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;
create policy "public places orders" on public.orders for insert to anon, authenticated with check (status = 'new');
create policy "admins read orders" on public.orders for select to authenticated using ((select private.is_admin()));
create policy "admins update orders" on public.orders for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.orders from anon, authenticated;
grant insert on public.orders to anon, authenticated;
grant select, update on public.orders to authenticated;
