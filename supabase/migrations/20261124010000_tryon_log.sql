-- Log of AI try-on runs (one row per run) so the edge function can enforce a daily cost limit. Service role only: no policies.
create table if not exists public.tryon_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  view text not null check (view in ('front', 'back')),
  created_at timestamptz not null default now()
);
create index if not exists tryon_log_day on public.tryon_log (created_at);
alter table public.tryon_log enable row level security;
revoke all on public.tryon_log from anon, authenticated;
