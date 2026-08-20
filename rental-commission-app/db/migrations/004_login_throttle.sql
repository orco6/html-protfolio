-- =============================================================================
-- 004_login_throttle.sql — server-side brute-force protection
--
-- argon2id already makes each guess expensive, but cost alone is not a rate
-- limit. Attempts are recorded here so the limit is shared across every
-- serverless instance — an in-process counter would reset on every cold start
-- and be trivially bypassed by fanning requests out.
--
-- The table is reachable only by `app_auth`, the role that already owns the
-- login path. `app_client` has no grant on it at all.
-- =============================================================================

create table if not exists public.login_attempts (
  id           bigint generated always as identity primary key,
  email        citext not null,
  ip           inet,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);

-- Both lookups are "recent failures for X", so both indexes are partial:
-- successful attempts are kept for the audit trail but never counted.
create index if not exists login_attempts_email_recent_idx
  on public.login_attempts (email, attempted_at desc)
  where not succeeded;

create index if not exists login_attempts_ip_recent_idx
  on public.login_attempts (ip, attempted_at desc)
  where not succeeded and ip is not null;

create index if not exists login_attempts_pruning_idx
  on public.login_attempts (attempted_at);

alter table public.login_attempts enable row level security;
alter table public.login_attempts force  row level security;

grant select, insert, delete on public.login_attempts to app_auth;
revoke all on public.login_attempts from app_client;

drop policy if exists login_attempts_auth_all on public.login_attempts;
create policy login_attempts_auth_all on public.login_attempts
  for all to app_auth
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- Counts recent failures. SQL rather than application code so the window and
-- the "successes do not count" rule live next to the data.
-- -----------------------------------------------------------------------------
create or replace function app.recent_login_failures(
  target_email citext,
  target_ip    inet,
  window_start timestamptz
)
returns table (by_email integer, by_ip integer)
language sql
stable
as $$
  select
    count(*) filter (where email = target_email)::int,
    count(*) filter (where target_ip is not null and ip = target_ip)::int
  from public.login_attempts
  where not succeeded
    and attempted_at >= window_start;
$$;

grant execute on function app.recent_login_failures(citext, inet, timestamptz) to app_auth;

-- This table is created after 003_hardening.sql has revoked the provider's
-- default privileges, so it inherits the lockdown. Re-stating it keeps the
-- guarantee true regardless of the order migrations are replayed in.
do $$
declare
  exposed text;
begin
  foreach exposed in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = exposed) then
      execute format('revoke all on public.login_attempts from %I', exposed);
    end if;
  end loop;
end
$$;

revoke all on public.login_attempts from public;
