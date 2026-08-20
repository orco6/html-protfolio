# מערכת ניהול עמלות סוכני השכרה

Rental-agent monthly commission management. Agents file the properties they
managed each month; administrators see every agent's report, the duplicate
warnings and the consolidated amount payable.

The product UI is Hebrew-first and right-to-left throughout. Code, schema and
documentation are in English.

---

## Quick start

```bash
npm install
npm run db:setup      # creates the database, roles and schema; writes .env.local
npm run seed          # 3 administrators, 7 agents, two months of demo data
npm run dev           # http://localhost:3000
```

`db:setup` expects a running PostgreSQL 14+ on `127.0.0.1:5432` and the ability
to `su postgres`. Override with `DB_NAME`, `DB_HOST`, `DB_PORT`.

### Sign-in details for the seeded data

Password for every seeded account: **`Demo!2345`**

| Role | E-mail |
| --- | --- |
| מנהל | `uri@nadlan.co.il`, `ruth@nadlan.co.il`, `avi@nadlan.co.il` |
| סוכן | `ofir@`, `gilana@`, `denis@`, `liad@`, `ronen@`, `chen@`, `idan@` — all `@nadlan.co.il` |

The seed deliberately plants the collisions the duplicate detector must catch:
`רחוב הרצל 5` reported by both אופיר and גילנה, invoice `2024-118` used by both
דניס and רונן, and a same-address pair inside ליעד's own report.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | unit tests (money, commission rule, duplicates, periods, validation) |
| `npm run e2e` | Playwright browser suite against a running server |
| `npm run db:setup` / `npm run db:reset` | provision / rebuild the database |
| `npm run seed` / `npm run seed:fresh` | seed data (`:fresh` wipes first) |
| `node scripts/verify-rls.mjs` | asserts the RLS policies directly against PostgreSQL |
| `node scripts/qa-shots.mjs` | drives a real browser and writes `qa-screenshots/` |

---

## The commission rule

Implemented once, in `src/lib/commission.ts`:

1. the collected management fee is VAT-inclusive → `net = gross / 1.18`
2. the agent's share → `commission = net × 40%`
3. a row **without an invoice** contributes **nothing** to the payable total,
   though the amount it would have earned is reported separately as
   *ממתין לחשבונית*

Every monetary value is an integer number of agorot (`src/lib/money.ts`). No
amount is ever held in a float, rounding is half-away-from-zero, and totals are
summed from the per-row rounded figures so a report's footer always equals the
column above it to the agora.

---

## Architecture

```
src/
  app/
    login/                    sign-in screen + server action
    (app)/report/             agent's own month  (agents only)
    (app)/admin/              monthly overview   (administrators only)
    (app)/admin/agents/       agent management + per-agent detail
    print/                    print documents, no application shell
  components/                 design system, tables, panels, print blocks
  lib/
    db.ts                     two pools, one per PostgreSQL role
    auth.ts                   argon2id, server-side sessions, role gates
    commission.ts             the business rule — single source of truth
    money.ts                  integer-agorot money handling and ILS formatting
    duplicates.ts             pure duplicate detection over authorised rows
    reports.ts / agents.ts    data access, always inside withUser()
db/migrations/                schema, then RLS policies and grants
```

Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS v4 ·
PostgreSQL 16 · Motion (microinteractions) · Playwright (browser QA).

Mutations go through server actions only; there is no public REST surface to
probe.

---

## Security model

Authorisation lives in the database, not in application code.

**Three PostgreSQL roles**

| Role | Used by | Can reach |
| --- | --- | --- |
| `app_owner` | migrations and seeding only | everything (`BYPASSRLS`) |
| `app_client` | every business query | `report_entries`, `profiles` — **RLS forced** |
| `app_auth` | login / logout / session lookup | credential columns + `sessions`; **no grant at all** on `report_entries` |

**How identity reaches a policy.** `withUser(userId, …)` opens a transaction and
sets `app.user_id` with `set_local`, so a pooled connection can never leak one
request's identity into the next. Policies then call `app.is_admin()`, a
`SECURITY DEFINER` function that re-reads the caller's role **from the
database** — the application never asserts its own privileges.

**What that buys.** An agent who fully controls their HTTP requests still
cannot read, update, delete or create another agent's rows, cannot promote
themselves, and cannot see another profile. `scripts/verify-rls.mjs` proves
each of those against the live database as `app_client`:

```
node scripts/verify-rls.mjs
  ok   agent sees only their own report rows
  ok   agent guessing another agent's row id returns nothing
  ok   agent cannot insert a row owned by another agent — blocked (42501)
  ok   agent cannot promote themselves to admin — 0 rows affected
  ok   business-data role cannot touch the sessions table at all — blocked (42501)
  ok   a connection with no app.user_id sees nothing
  …
```

**Sessions.** Opaque 32-byte tokens in an `httpOnly`, `sameSite=lax` cookie
(`secure` in production). Only an HMAC of the token is stored, keyed by
`SESSION_SECRET`, so a dump of the `sessions` table cannot be replayed.
Passwords are argon2id. Failed logins run a decoy verification so response
timing does not reveal whether an address exists. Deactivating an agent revokes
their sessions immediately and locks them out on the next request.

**Agent privacy in duplicate detection.** The agent screen is fed only that
agent's own rows — RLS makes anything else impossible — so a cross-agent
collision cannot surface another agent's name, invoice number or property, not
even through an unrendered field in the payload. Administrators see the full
picture, cross-agent groups labelled as such with the agents named.

---

## Duplicate detection

Matching runs on normalised keys generated by PostgreSQL
(`app.normalize_text`, `app.normalize_invoice`) and stored as indexed
generated columns:

- addresses: lower-cased, punctuation collapsed to single spaces, trimmed —
  `שדרות רוטשילד 12, תל אביב` ≡ `שדרות  רוטשילד 12 , תל אביב`
- invoices: every separator removed — `2024-118` ≡ `2024 118` ≡ `2024118`

`src/lib/duplicates.ts` mirrors both functions so the browser can flag a
collision the instant a row is added. `verify-rls.mjs` asserts the SQL and
TypeScript implementations agree character for character.

---

## Data model

| Table | Notes |
| --- | --- |
| `profiles` | every person who can sign in; `role` is `admin` or `agent`; `is_active` drives soft deactivation |
| `report_entries` | one property, per agent, per `(year, month)`; `address_key` / `invoice_key` are generated + indexed |
| `sessions` | server-side session store, HMAC of the token only |

Agents are database rows, never hard-coded. A profile is never deleted:
deactivation preserves every historical report, and a database trigger blocks
new rows for an inactive agent while leaving old ones editable by an
administrator.

---

## Printing

`/print/my-report`, `/print/agent/[id]` and `/print/summary` render real
documents: A4 portrait, no navigation, no edit controls, repeating table
headers across page breaks, a settlement summary that states the calculation,
and signature lines. The on-screen bar above them is `no-print`.

---

## Testing

- **56 unit tests** — the commission rule against hand-checked figures, money
  parsing and rounding, duplicate normalisation, period arithmetic, validation.
- **24 Playwright tests** in a real Chromium — authentication, role separation
  (including direct-URL probing of another agent's pages), the full CRUD and
  persistence loop across a fresh browser session, duplicate warnings and their
  privacy boundary, month history, agent management with activation, the print
  documents, and a console-error sweep.
- **23 database assertions** in `verify-rls.mjs`, run as the application's own
  least-privilege role.
- **Visual QA** via `scripts/qa-shots.mjs`: every screen at 1440 / 834 / 390 px
  plus A4 print emulation.

---

## Deploying elsewhere

The schema is plain PostgreSQL and runs unmodified on Supabase — the identity
helper already falls back to the `request.jwt.claim.sub` claim, so the same
policies work with Supabase Auth. To move there: run
`db/migrations/*.sql` against the project, point `DATABASE_URL` /
`AUTH_DATABASE_URL` at it, and keep the service-role key server-side only.

Required environment variables (written into `.env.local` by `db:setup`):

```
DATABASE_URL        # app_client — business data, RLS forced
AUTH_DATABASE_URL   # app_auth   — credentials and sessions only
OWNER_DATABASE_URL  # migrations and seeding only, never imported by the app
SESSION_SECRET      # keys the session-token HMAC
```
