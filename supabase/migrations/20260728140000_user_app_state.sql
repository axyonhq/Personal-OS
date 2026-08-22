-- Personal OS: one JSON document of app state per Clerk user.
-- Apply with: Supabase -> SQL Editor, or the Supabase MCP apply_migration tool.
-- After running: Authentication -> Third-party -> add Clerk
-- (from dashboard.clerk.com/setup/supabase)
--
-- Role grants intentionally match the sibling public.company_app_state table,
-- which is known to work with the Clerk third-party auth integration. Access is
-- gated by the sub check: an unauthenticated caller has a null jwt sub, which
-- never equals a text user_id, so it matches no rows.

create table if not exists public.user_app_state (
  user_id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_app_state enable row level security;

drop policy if exists "Users can select own app state" on public.user_app_state;
create policy "Users can select own app state"
  on public.user_app_state
  for select
  to anon, authenticated
  using ((select auth.jwt()->>'sub') = user_id);

drop policy if exists "Users can insert own app state" on public.user_app_state;
create policy "Users can insert own app state"
  on public.user_app_state
  for insert
  to anon, authenticated
  with check ((select auth.jwt()->>'sub') = user_id);

drop policy if exists "Users can update own app state" on public.user_app_state;
create policy "Users can update own app state"
  on public.user_app_state
  for update
  to anon, authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);

-- Lets a user erase their own cloud copy from the app (data export / reset).
drop policy if exists "Users can delete own app state" on public.user_app_state;
create policy "Users can delete own app state"
  on public.user_app_state
  for delete
  to anon, authenticated
  using ((select auth.jwt()->>'sub') = user_id);
