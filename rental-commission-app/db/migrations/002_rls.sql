-- =============================================================================
-- 002_rls.sql — identity helpers, row level security, least-privilege roles
--
-- The application never connects as the table owner. It uses two roles:
--
--   app_auth    only touches profiles(auth columns) + sessions. Used strictly
--               by the login / logout / session-resolution code path.
--   app_client  the business-data role. RLS is FORCED on it. Before any query
--               the request sets `app.user_id`, and every policy derives the
--               caller's role from the database, never from the application.
--
-- Because RLS is the enforcement point, an agent cannot read or write another
-- agent's rows even with full control over the HTTP request or the SQL text.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Who is calling?
--   * self-hosted: the request sets app.user_id inside its transaction
--   * Supabase   : the JWT claim `sub` is used instead, unchanged
-- -----------------------------------------------------------------------------
create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.user_id', true), ''),
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )::uuid;
$$;

-- SECURITY DEFINER: reads profiles bypassing RLS so the policies below can be
-- expressed without recursion. It only ever returns a boolean.
create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = app.current_user_id()
      and p.role = 'admin'
      and p.is_active
  );
$$;

create or replace function app.is_active_agent()
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = app.current_user_id()
      and p.role = 'agent'
      and p.is_active
  );
$$;

-- -----------------------------------------------------------------------------
-- Enable + force RLS
-- -----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.profiles       force  row level security;
alter table public.report_entries enable row level security;
alter table public.report_entries force  row level security;
alter table public.sessions       enable row level security;
alter table public.sessions       force  row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  using (id = app.current_user_id() or app.is_admin());

-- only administrators create profiles
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert
  with check (app.is_admin());

-- administrators may edit anyone; a non-admin may edit nothing at all
-- (password changes go through the dedicated auth role, see below)
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update
  using (app.is_admin())
  with check (app.is_admin());

-- profiles are never hard-deleted: deactivation preserves history.
-- No DELETE policy exists, so DELETE is denied for every caller.

-- -----------------------------------------------------------------------------
-- report_entries
-- -----------------------------------------------------------------------------
drop policy if exists report_entries_select on public.report_entries;
create policy report_entries_select on public.report_entries
  for select
  using (agent_id = app.current_user_id() or app.is_admin());

drop policy if exists report_entries_insert on public.report_entries;
create policy report_entries_insert on public.report_entries
  for insert
  with check (
    (agent_id = app.current_user_id() and app.is_active_agent())
    or app.is_admin()
  );

drop policy if exists report_entries_update on public.report_entries;
create policy report_entries_update on public.report_entries
  for update
  using (
    (agent_id = app.current_user_id() and app.is_active_agent())
    or app.is_admin()
  )
  with check (
    (agent_id = app.current_user_id() and app.is_active_agent())
    or app.is_admin()
  );

drop policy if exists report_entries_delete on public.report_entries;
create policy report_entries_delete on public.report_entries
  for delete
  using (
    (agent_id = app.current_user_id() and app.is_active_agent())
    or app.is_admin()
  );

-- =============================================================================
-- Roles and grants
-- =============================================================================
-- Roles themselves (and their generated passwords) are provisioned by
-- scripts/setup-db.sh before migrations run; this file only grants privileges.
grant usage on schema public, app to app_client, app_auth;

-- app_client: business data only
grant select, insert, update, delete on public.report_entries to app_client;
grant select on public.profiles to app_client;
grant insert, update on public.profiles to app_client;   -- admin-only via RLS
revoke all on public.sessions from app_client;
grant execute on function app.current_user_id(), app.is_admin(), app.is_active_agent(),
                          app.normalize_text(text), app.normalize_invoice(text)
  to app_client;

-- app_auth: credentials + sessions only, no business data whatsoever
grant select (id, email, password_hash, full_name, role, is_active) on public.profiles to app_auth;
grant update (password_hash) on public.profiles to app_auth;
grant select, insert, update, delete on public.sessions to app_auth;
revoke all on public.report_entries from app_auth;
grant execute on function app.current_user_id(), app.is_admin() to app_auth;

-- -----------------------------------------------------------------------------
-- Role-scoped policies for app_auth.
--
-- Login happens *before* an identity exists, so the auth role needs unfiltered
-- access to credentials and sessions. That access is narrowed twice over:
--   * column grants above expose only the auth columns of profiles
--   * these policies are TO app_auth, so no other role inherits them
--   * app_auth holds no grant of any kind on report_entries
-- -----------------------------------------------------------------------------
drop policy if exists profiles_auth_read on public.profiles;
create policy profiles_auth_read on public.profiles
  for select to app_auth
  using (true);

drop policy if exists profiles_auth_password on public.profiles;
create policy profiles_auth_password on public.profiles
  for update to app_auth
  using (true)
  with check (true);

drop policy if exists sessions_auth_all on public.sessions;
create policy sessions_auth_all on public.sessions
  for all to app_auth
  using (true)
  with check (true);
