-- =============================================================================
-- 003_hardening.sql — deployment hardening that applies everywhere
--
-- Two concerns, both of which only bite on a managed provider:
--
--   1. Operator resolution. Managed Postgres (Supabase) installs extensions
--      into a dedicated `extensions` schema. A citext column keeps working by
--      OID, but the `citext = citext` *operator* is resolved through
--      search_path at query time — so the application roles must be able to
--      see that schema, or `where email = $1` silently degrades or errors.
--
--   2. PostgREST exposure. Supabase publishes every table in `public` over
--      HTTP to the `anon` and `authenticated` roles. This application does not
--      use PostgREST at all, so those roles are stripped of access outright
--      rather than left to depend on RLS alone. Defence in depth: even a
--      misconfigured policy cannot become an open API.
--
-- Both blocks are guarded so the file is a no-op on a plain local cluster.
-- =============================================================================

-- Note on (1): `ALTER ROLE … SET search_path` needs role-admin rights, which
-- the migration role deliberately does not have. It is applied next to role
-- creation instead — scripts/setup-db.sh locally, scripts/deploy-supabase.sh
-- in production — and asserted at the bottom of this file.

-- ------------------------------------------------------- PostgREST lockdown
do $$
declare
  exposed text;
begin
  foreach exposed in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = exposed) then
      execute format('revoke all on all tables    in schema public from %I', exposed);
      execute format('revoke all on all sequences in schema public from %I', exposed);
      execute format('revoke all on all functions in schema public from %I', exposed);
      execute format('revoke all on schema public from %I', exposed);
      execute format('revoke all on schema app    from %I', exposed);
      -- future tables created by the migration owner, too
      execute format(
        'alter default privileges in schema public revoke all on tables from %I', exposed
      );
      raise notice 'revoked public-schema access from role %', exposed;
    end if;
  end loop;
end
$$;

-- The PUBLIC pseudo-role must not hold anything either; the two application
-- roles keep working because their grants in 002_rls.sql are explicit.
revoke all on all tables in schema public from public;
revoke all on schema app from public;

-- -----------------------------------------------------------------------------
-- Belt and braces: assert the security posture the application depends on, so
-- a broken deployment fails at migration time rather than in production.
-- -----------------------------------------------------------------------------
do $$
declare
  bad text;
begin
  -- every business table must have RLS enabled *and* forced
  select string_agg(relname, ', ') into bad
    from pg_class
   where relnamespace = 'public'::regnamespace
     and relkind = 'r'
     and relname in ('profiles', 'report_entries', 'sessions')
     and not (relrowsecurity and relforcerowsecurity);
  if bad is not null then
    raise exception 'row level security is not forced on: %', bad;
  end if;

  -- neither application role may ever bypass RLS
  select string_agg(rolname, ', ') into bad
    from pg_roles
   where rolname in ('app_client', 'app_auth')
     and (rolbypassrls or rolsuper);
  if bad is not null then
    raise exception 'application role must not bypass RLS: %', bad;
  end if;

  -- the business-data role must hold no privilege at all on the session store
  if exists (
    select 1 from information_schema.table_privileges
     where grantee = 'app_client' and table_schema = 'public' and table_name = 'sessions'
  ) then
    raise exception 'app_client must have no privileges on public.sessions';
  end if;

  -- the auth role must hold no privilege at all on report data
  if exists (
    select 1 from information_schema.table_privileges
     where grantee = 'app_auth' and table_schema = 'public' and table_name = 'report_entries'
  ) then
    raise exception 'app_auth must have no privileges on public.report_entries';
  end if;

  -- when the provider keeps extensions out of `public`, the application roles
  -- must be able to resolve operators from that schema (see note 1 above)
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    select string_agg(rolname, ', ') into bad
      from pg_roles
     where rolname in ('app_client', 'app_auth')
       and not coalesce(array_to_string(rolconfig, ','), '') like '%extensions%';
    if bad is not null then
      raise exception
        'role(s) % cannot see the extensions schema; run: alter role <role> set search_path = public, app, extensions',
        bad;
    end if;
  end if;
end
$$;
