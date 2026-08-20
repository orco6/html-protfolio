# Browser QA via Playwright MCP

The Playwright MCP server is committed in `.mcp.json` at the repository root, so
it attaches automatically the next time a Claude Code session starts here — no
`claude mcp add`, no flags, nothing to approve beyond the usual trust prompt.

MCP servers are attached when a session **starts**. A server registered
mid-session is healthy but its tools are not in that session's tool surface,
which is why this runbook exists: the session that registered it drove Chromium
through Playwright scripts instead, and the next session can drive it through
the MCP directly.

**This runbook does not replace `tests/e2e/qa.spec.ts`.** Those 24 assertions
are the regression suite and must keep passing. The MCP pass is the *exploratory*
half — looking at real pixels, poking at states a spec would not think to
assert, and reading the accessibility tree.

---

## Start the app first

```bash
cd rental-commission-app
npm run db:setup && npm run seed:fresh   # only if the database is not up
npm run build && npm start               # production build, port 3000
```

Sign-in for the seeded data — password `Demo!2345`:

| Who | E-mail | Why this one |
| --- | --- | --- |
| מנהל | `uri@nadlan.co.il` | full admin surface |
| סוכן | `ofir@nadlan.co.il` | shares an address with גילנה — cross-agent duplicate |
| סוכן | `liad@nadlan.co.il` | duplicate address inside his own report |
| סוכן | `denis@nadlan.co.il` | shares invoice `2024-118` with רונן |
| סוכן | `idan@nadlan.co.il` | has not reported this month — empty state |

---

## The pass

Work through these with `browser_navigate`, `browser_snapshot`,
`browser_click`, `browser_type`, `browser_resize` and `browser_take_screenshot`.
Look at every screenshot; do not conclude from the DOM alone.

### 1. Login — `/login`

- [ ] 1440×900 and 390×844
- [ ] wrong password → Hebrew error, no redirect
- [ ] `browser_console_messages` is clean
- [ ] tab order: e-mail → password → submit

### 2. Agent report — `ofir@`

- [ ] populated month at 1440, 834, 390
- [ ] add a row with an invoice; the payable figure updates **without a reload**
- [ ] add a row without an invoice; it shows `—` and does not change the total
- [ ] press Enter in the add form — the row commits and focus returns to the address field
- [ ] edit a row inline; the net and commission columns follow the amount
- [ ] delete a row; confirm the two-step confirmation
- [ ] month picker: previous → history appears; "חזרה לחודש הנוכחי" returns
- [ ] an empty month (`/report?year=2021&month=7`) shows the empty state, not a bare table header

### 3. Duplicate states — `liad@`

- [ ] the warning panel appears and names only ליעד's own rows
- [ ] the panel and the whole page mention no other agent's name, invoice or property
- [ ] the same at 390 px

### 4. Privacy probe — as `ofir@`

- [ ] navigate to `/admin` → redirected to `/report`
- [ ] navigate to `/admin/agents` → redirected
- [ ] navigate to `/print/summary` → redirected
- [ ] navigate to `/admin/agents/<גילנה's id>` → redirected, and גילנה's name appears nowhere

### 5. Admin — `uri@`

- [ ] `/admin` at 1440, 834, 390
- [ ] every agent, per-agent totals, one consolidated total
- [ ] cross-agent duplicate panel names both agents and shows invoice `2024-118`
- [ ] drill into an agent; the view is read-only (no add form, no row actions)
- [ ] `/admin/agents`: add an agent, then deactivate it; the row stays with history intact
- [ ] mobile menu opens and closes; the icon switches to a close glyph

### 6. Print

- [ ] `/print/my-report`, `/print/agent/<id>`, `/print/summary`
- [ ] `browser_resize` to 794×1123, then screenshot with print emulation
- [ ] no navigation, no buttons, no edit affordances on paper
- [ ] the settlement summary states the 18% / 40% calculation

### 7. Sweep

- [ ] `browser_console_messages` on every screen — expect nothing
- [ ] `browser_network_requests` — no third-party host, no failed request
- [ ] `browser_snapshot` on the agent report: every icon-only button has an
      accessible name, every input has a label

---

## Fallback

If the MCP is unavailable for any reason, the same ground is covered by:

```bash
npx playwright test                  # 24 regression assertions
node scripts/qa-shots.mjs            # 27 screenshots into qa-screenshots/
node scripts/verify-rls.mjs          # 35 database-level security assertions
```
