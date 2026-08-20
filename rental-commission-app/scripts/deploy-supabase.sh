#!/usr/bin/env bash
# =============================================================================
# One-shot production database setup against Supabase (or any managed Postgres).
#
#   ./scripts/deploy-supabase.sh "postgresql://postgres:PWD@db.REF.supabase.co:5432/postgres"
#
# The single argument is the project's **direct** connection string, copied from
# Supabase → Project Settings → Database → Connection string → URI. It is used
# for DDL only, is never written to disk, and is never used by the application.
#
# What this does, end to end:
#   1. creates the two least-privilege application roles with fresh random
#      passwords, and points their search_path at the extensions schema
#   2. applies every migration in db/migrations in order
#   3. creates the administrator and agent accounts (no demo report rows)
#   4. prints the exact environment variables to paste into the host
#
# Re-running is safe: roles, schema and accounts are all idempotent. Passwords
# are rotated on every run, so the printed values always replace the old ones.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN_URL="${1:-${SUPABASE_ADMIN_DATABASE_URL:-}}"

if [ -z "$ADMIN_URL" ]; then
  cat >&2 <<'USAGE'
Usage: ./scripts/deploy-supabase.sh "<direct postgres connection string>"

Copy it from Supabase → Project Settings → Database → Connection string → URI
(the direct connection on port 5432, not the pooler).

You can also export SUPABASE_ADMIN_DATABASE_URL instead of passing it as an
argument, which keeps the password out of your shell history.
USAGE
  exit 2
fi

command -v psql >/dev/null || { echo "psql is required (brew install libpq / apt install postgresql-client)" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }

gen_pw() { LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32; }

CLIENT_PW="$(gen_pw)"
AUTH_PW="$(gen_pw)"
SESSION_SECRET="$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 64)"

run_admin() { psql -v ON_ERROR_STOP=1 -qtAX "$ADMIN_URL" "$@"; }

# ------------------------------------------------------------------ 1. roles
echo "==> creating application roles"
run_admin -c "do \$\$
begin
  if not exists (select 1 from pg_roles where rolname='app_client') then
    create role app_client login;
  end if;
  if not exists (select 1 from pg_roles where rolname='app_auth') then
    create role app_auth login;
  end if;
end \$\$;"

run_admin -c "alter role app_client with password '$CLIENT_PW' nobypassrls nosuperuser nocreatedb nocreaterole"
run_admin -c "alter role app_auth   with password '$AUTH_PW'   nobypassrls nosuperuser nocreatedb nocreaterole"
run_admin -c "alter role app_client set search_path = public, app, extensions"
run_admin -c "alter role app_auth   set search_path = public, app, extensions"

# --------------------------------------------------------------- 2. migrations
for file in "$ROOT"/db/migrations/*.sql; do
  echo "==> applying $(basename "$file")"
  psql -v ON_ERROR_STOP=1 -q "$ADMIN_URL" -f "$file" 2>&1 | grep -vE '^(NOTICE|psql:.*NOTICE)' || true
done

# ------------------------------------------------------------------ 3. accounts
echo "==> creating administrator and agent accounts"
ACCOUNTS_OUTPUT="$(OWNER_DATABASE_URL="$ADMIN_URL" node "$ROOT/scripts/seed.mjs" --no-demo --random-passwords)"
echo "$ACCOUNTS_OUTPUT"

# --------------------------------------------------------------- 4. env output
HOST_PART="$(printf '%s' "$ADMIN_URL" | sed -E 's#^postgres(ql)?://[^@]+@##; s#/.*$##')"
DB_HOST="${HOST_PART%%:*}"
PROJECT_REF="$(printf '%s' "$DB_HOST" | sed -E 's#^db\.##; s#\.supabase\.co$##')"
DB_NAME="$(printf '%s' "$ADMIN_URL" | sed -E 's#^.*/##; s#\?.*$##')"

# Supabase's transaction pooler (Supavisor) is what serverless functions must
# use. Host and username format documented at Project Settings → Database.
if printf '%s' "$DB_HOST" | grep -q 'supabase.co'; then
  POOL_HOST_HINT="aws-0-<region>.pooler.supabase.com:6543"
  CLIENT_URL="postgresql://app_client.$PROJECT_REF:$CLIENT_PW@$POOL_HOST_HINT/$DB_NAME?sslmode=require"
  AUTH_URL="postgresql://app_auth.$PROJECT_REF:$AUTH_PW@$POOL_HOST_HINT/$DB_NAME?sslmode=require"
  POOLER_NOTE=$'\nReplace <region> with the region shown in Supabase → Project Settings → Database\n→ Connection pooling → Transaction pooler. Everything else is already correct.\n'
else
  CLIENT_URL="postgresql://app_client:$CLIENT_PW@$HOST_PART/$DB_NAME?sslmode=require"
  AUTH_URL="postgresql://app_auth:$AUTH_PW@$HOST_PART/$DB_NAME?sslmode=require"
  POOLER_NOTE=""
fi

cat <<EOF

===============================================================================
 Database ready. Set these environment variables on your host (Vercel:
 Project → Settings → Environment Variables → Production).
===============================================================================

DATABASE_URL=$CLIENT_URL

AUTH_DATABASE_URL=$AUTH_URL

SESSION_SECRET=$SESSION_SECRET
$POOLER_NOTE
Also set, once you know the deployed URL:

  APP_ORIGIN=https://your-app.vercel.app

These values are printed once and are not stored anywhere. Re-running this
script rotates the two database passwords and invalidates the old ones.
===============================================================================
EOF
