-- Orders: whether the money has actually been received (UPI confirmed in the bank app, COD collected on delivery).
alter table public.orders add column if not exists paid boolean not null default false;
alter table public.orders add column if not exists paid_at timestamptz;
