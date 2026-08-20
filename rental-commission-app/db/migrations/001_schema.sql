-- =============================================================================
-- 001_schema.sql — core relational model
-- Rental agent monthly commission management
--
-- Target: PostgreSQL 14+ (also runs unmodified on Supabase Postgres).
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists app;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'agent');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Text normalisation used by duplicate detection.
-- Immutable so it can back generated columns and expression indexes.
-- -----------------------------------------------------------------------------
-- Must stay byte-for-byte equivalent to normalizeText() in src/lib/duplicates.ts,
-- including the final trim: "הרצל 5," and "הרצל 5" have to produce the same key,
-- and the punctuation-to-space step would otherwise leave a trailing space behind.
create or replace function app.normalize_text(value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    btrim(
      regexp_replace(
        -- strip everything except hebrew letters, latin letters and digits,
        -- collapsing all punctuation / whitespace runs into a single space
        regexp_replace(lower(btrim(coalesce(value, ''))), '[^0-9a-z֐-׿]+', ' ', 'g'),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

-- Invoice numbers additionally drop every non-digit/letter separator entirely,
-- so "2024-118" and "2024 118" and "2024118" collide.
create or replace function app.normalize_invoice(value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(value, ''))), '[^0-9a-z֐-׿]+', '', 'g'), '');
$$;

-- -----------------------------------------------------------------------------
-- profiles — every human that can sign in (admins and agents alike)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key default gen_random_uuid(),
  email          citext not null unique,
  password_hash  text   not null,
  full_name      text   not null check (btrim(full_name) <> ''),
  role           public.user_role not null default 'agent',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists profiles_role_active_idx
  on public.profiles (role, is_active, full_name);

-- -----------------------------------------------------------------------------
-- report_entries — one reported rental property, per agent, per calendar month
-- -----------------------------------------------------------------------------
create table if not exists public.report_entries (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references public.profiles (id) on delete restrict,
  year               smallint not null check (year between 2000 and 2200),
  month              smallint not null check (month between 1 and 12),
  property_address   text not null check (btrim(property_address) <> ''),
  -- amount actually collected from the tenant/owner, VAT included, in ILS
  amount_collected   numeric(12, 2) not null check (amount_collected >= 0),
  has_invoice        boolean not null default false,
  invoice_number     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  address_key text generated always as (app.normalize_text(property_address)) stored,
  invoice_key text generated always as (app.normalize_invoice(invoice_number)) stored,

  -- an invoice number is only meaningful when an invoice exists
  constraint report_entries_invoice_number_requires_invoice
    check (has_invoice or invoice_number is null or btrim(invoice_number) = '')
);

create index if not exists report_entries_agent_period_idx
  on public.report_entries (agent_id, year, month);

create index if not exists report_entries_period_idx
  on public.report_entries (year, month);

create index if not exists report_entries_address_key_idx
  on public.report_entries (year, month, address_key);

create index if not exists report_entries_invoice_key_idx
  on public.report_entries (year, month, invoice_key);

-- -----------------------------------------------------------------------------
-- sessions — server side session store (opaque token, only its hash is stored)
-- -----------------------------------------------------------------------------
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent   text
);

create index if not exists sessions_user_idx on public.sessions (user_id);
create index if not exists sessions_expires_idx on public.sessions (expires_at);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app.touch_updated_at();

drop trigger if exists report_entries_touch_updated_at on public.report_entries;
create trigger report_entries_touch_updated_at
  before update on public.report_entries
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- An agent row may only ever be written for an *active agent* profile.
-- Historical rows survive deactivation, but nothing new can be filed for one.
-- -----------------------------------------------------------------------------
create or replace function app.assert_writable_agent()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  target record;
begin
  select role, is_active into target from public.profiles where id = new.agent_id;

  if target is null then
    raise exception 'unknown agent %', new.agent_id using errcode = '23503';
  end if;

  if target.role <> 'agent' then
    raise exception 'profile % is not an agent', new.agent_id using errcode = '23514';
  end if;

  if not target.is_active then
    raise exception 'agent % is inactive', new.agent_id using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists report_entries_assert_writable_agent on public.report_entries;
create trigger report_entries_assert_writable_agent
  before insert or update of agent_id on public.report_entries
  for each row execute function app.assert_writable_agent();
