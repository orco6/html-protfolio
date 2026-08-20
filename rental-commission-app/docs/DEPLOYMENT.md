# Deployment

Target architecture: **Vercel** (Next.js host) + **Supabase** (managed PostgreSQL).
Nothing else is required — no separate API, no container, no cron.

Everything that can be automated is automated. Two things need your account and
cannot be done for you: creating the Supabase project, and connecting the repo
to Vercel. Both are listed at the top of the steps below.

---

## Before you start

You need:

- a Supabase account (free tier is enough)
- a Vercel account
- `psql` on your machine — `brew install libpq` on macOS, `apt install postgresql-client` on Debian/Ubuntu

---

## 1. Create the Supabase project *(needs your account)*

1. https://supabase.com/dashboard → **New project**
2. Pick a region close to your users — `eu-central-1 (Frankfurt)` for Israel.
3. Set a strong database password and save it in your password manager.
4. Wait for provisioning to finish (~2 minutes).

Then copy the **direct** connection string:

> Project Settings → Database → Connection string → **URI**
> (the one on port `5432`, *not* the pooler)

It looks like `postgresql://postgres:YOUR-PASSWORD@db.abcdefgh.supabase.co:5432/postgres`.

## 2. Set up the database — one command

```bash
cd rental-commission-app
export SUPABASE_ADMIN_DATABASE_URL='postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres'
./scripts/deploy-supabase.sh
```

That single command:

- creates the two least-privilege roles (`app_client`, `app_auth`) with fresh
  random passwords and the correct `search_path`
- applies every migration in `db/migrations` in order
- verifies the security posture and **fails loudly** if RLS is not forced, if a
  role can bypass RLS, or if the roles hold privileges they must not
- strips the Supabase REST API (`anon` / `authenticated`) of all access to
  these tables, so the data has no HTTP surface other than this application
- creates the three administrators and seven agents with individual generated
  passwords, printed once
- prints `DATABASE_URL`, `AUTH_DATABASE_URL` and `SESSION_SECRET`, ready to paste

**Save that output.** The passwords are not stored anywhere; re-running the
script rotates them.

### One value you have to complete by hand

The printed `DATABASE_URL` / `AUTH_DATABASE_URL` contain `aws-0-<region>`. Replace
`<region>` with the value shown in

> Project Settings → Database → Connection pooling → **Transaction pooler**

The pooler (port `6543`) is required: serverless functions open and close
connections constantly, and the direct port would exhaust the connection limit.
Everything in this app is written to work under transaction pooling — each
request is one short transaction and no prepared statements are used.

### Optional: verified TLS

Download the CA bundle from Project Settings → Database → SSL Configuration and
set its PEM text as `PGSSLROOTCERT`. Without it the app still requires TLS but
cannot verify the chain, and will refuse to start in production unless you also
set `PGSSL_ALLOW_UNVERIFIED=true`.

## 3. Deploy to Vercel *(needs your account)*

1. https://vercel.com/new → import this Git repository.
2. Set **Root Directory** to `rental-commission-app`.
3. Framework preset is detected as Next.js; leave the build settings alone.
4. Add the environment variables below under **Production** (and **Preview** if
   you want preview deployments to work), then click **Deploy**.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | from step 2, with `<region>` filled in |
| `AUTH_DATABASE_URL` | from step 2, with `<region>` filled in |
| `SESSION_SECRET` | from step 2 |
| `APP_ORIGIN` | your final URL, e.g. `https://commissions.vercel.app` |
| `PGSSLROOTCERT` | *(optional)* the Supabase CA bundle |

`APP_ORIGIN` is not known until the first deploy. Deploy once, copy the URL
Vercel gives you, set the variable, and redeploy. If you attach a custom domain
later, update `APP_ORIGIN` to that domain and redeploy.

## 4. Verify

```bash
E2E_BASE_URL=https://your-app.vercel.app npx playwright test -g "authentication"
```

Then sign in as one of the administrators and confirm the dashboard loads.

---

## Operating it

| Task | Command |
| --- | --- |
| Rotate one password | `OWNER_DATABASE_URL='<admin uri>' node scripts/set-password.mjs someone@nadlan.co.il` |
| Add an agent | In the app: **ניהול סוכנים → הוספת סוכן** |
| Deactivate an agent | In the app: **ניהול סוכנים → השבתה** (history is preserved) |
| Apply a new migration | `psql "$SUPABASE_ADMIN_DATABASE_URL" -f db/migrations/00X_....sql` |
| Re-verify security | `OWNER_DATABASE_URL=… DATABASE_URL=… AUTH_DATABASE_URL=… node scripts/verify-rls.mjs` |

Rotating `SESSION_SECRET` signs everybody out immediately — that is the fastest
response to a suspected cookie leak.

---

## What makes this production-safe

**No localhost anywhere in the shipped code.** Every host comes from an
environment variable. `scripts/` and `tests/` default to `localhost` for
development, and neither is part of the deployed bundle.

**Cookies behind HTTPS.** The session cookie's `Secure` flag and its `__Host-`
prefix are derived from `x-forwarded-proto`, which is what a reverse proxy
actually sets — not from `NODE_ENV`. Over HTTPS the cookie becomes
`__Host-rc_session`, which a browser will only accept when it is Secure,
`Path=/` and has no `Domain`, so no sibling subdomain can write it.

**Server Actions are origin-pinned.** Next.js already rejects a Server Action
whose `Origin` does not match its `Host`; `APP_ORIGIN` extends that to a
deployment sitting behind a proxy that rewrites `Host`.

**No caching of authenticated pages.** Every route except static assets is sent
with `Cache-Control: private, no-store`, so a CDN or corporate proxy can never
hold one agent's figures and serve them to another.

**Connections are bounded.** `PG_POOL_MAX` defaults to 4 in production, with a
15s statement timeout and a 10s idle-in-transaction timeout, so a slow query
cannot pin a pooled connection or hold locks on financial rows.

**Printing needs no special handling.** The print documents are ordinary
server-rendered routes with print CSS; `window.print()` runs in the browser.
There is no PDF service to deploy.

**Static assets and the favicon** are served by Next.js from `_next/static` and
`/icon.svg`; the Heebo font is self-hosted at build time by `next/font`, so the
running app makes no third-party requests and the CSP can stay strict.
