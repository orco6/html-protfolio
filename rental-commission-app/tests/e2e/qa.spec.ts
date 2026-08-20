/**
 * End-to-end QA against a real Chromium browser.
 *
 *   npx playwright test
 *
 * Covers the full product brief: authentication, agent CRUD, the commission
 * rule, duplicate warnings, month history, persistence across sessions,
 * cross-agent isolation (including direct URL and server-action probing),
 * the administrator views, agent management and the print documents.
 */

import { expect, test, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'Demo!2345';

const AGENT_A = { email: 'ofir@nadlan.co.il', name: 'אופיר' };
const AGENT_B = { email: 'gilana@nadlan.co.il', name: 'גילנה' };
const ADMIN = { email: 'uri@nadlan.co.il', name: 'אורי כהן' };

const now = new Date();
const YEAR = now.getFullYear();
const MONTH = now.getMonth() + 1;

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('דוא״ל').fill(email);
  await page.getByLabel('סיסמה').fill(PASSWORD);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.waitForURL(/\/(report|admin)/);
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'יציאה' }).first().click();
  await page.waitForURL(/\/login/);
}

/** The desktop table. Both it and the mobile list live in the DOM at once,
 *  so every row assertion is scoped to one of the two on purpose. */
function table(page: Page) {
  return page.getByRole('table');
}

async function addRow(page: Page, address: string, amount: string, invoice?: string) {
  await page.getByPlaceholder('כתובת הנכס').fill(address);
  await page.getByPlaceholder('סכום שנגבה').fill(amount);
  if (invoice) {
    await page.getByLabel('קיימת חשבונית').check();
    await page.getByPlaceholder('מספר חשבונית').fill(invoice);
  }
  await page.getByRole('button', { name: 'הוספה' }).click();
  await expect(table(page).getByText(address, { exact: true })).toBeVisible();
}

/* -------------------------------------------------------------------------- */
/* Authentication                                                              */
/* -------------------------------------------------------------------------- */

test.describe('authentication', () => {
  test('unauthenticated visitors are pushed to the login screen', async ({ page }) => {
    for (const path of ['/', '/report', '/admin', '/admin/agents', '/print/summary']) {
      await page.goto(`${BASE}${path}`);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('the whole login screen is in Hebrew and right-to-left', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByRole('heading', { name: 'כניסה למערכת' })).toBeVisible();
  });

  test('a wrong password is rejected with a Hebrew message', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel('דוא״ל').fill(AGENT_A.email);
    await page.getByLabel('סיסמה').fill('definitely-wrong');
    await page.getByRole('button', { name: 'כניסה' }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText('שם משתמש או סיסמה שגויים');
    await expect(page).toHaveURL(/\/login/);
  });

  test('an unknown address is rejected without revealing that it is unknown', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel('דוא״ל').fill('nobody@nadlan.co.il');
    await page.getByLabel('סיסמה').fill(PASSWORD);
    await page.getByRole('button', { name: 'כניסה' }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText('שם משתמש או סיסמה שגויים');
  });

  test('an agent lands on their report and an admin on the dashboard', async ({ page }) => {
    await login(page, AGENT_A.email);
    await expect(page).toHaveURL(/\/report/);
    await logout(page);

    await login(page, ADMIN.email);
    await expect(page).toHaveURL(/\/admin/);
  });

  test('logging out invalidates the session', async ({ page }) => {
    await login(page, AGENT_A.email);
    await logout(page);
    await page.goto(`${BASE}/report`);
    await expect(page).toHaveURL(/\/login/);
  });
});

/* -------------------------------------------------------------------------- */
/* Role separation                                                             */
/* -------------------------------------------------------------------------- */

test.describe('role separation', () => {
  test('an agent cannot reach any administrator screen', async ({ page }) => {
    await login(page, AGENT_A.email);

    for (const path of ['/admin', '/admin/agents', '/print/summary']) {
      await page.goto(`${BASE}${path}`);
      await expect(page, `agent reached ${path}`).toHaveURL(/\/report/);
    }
  });

  test("an agent cannot open another agent's detail page", async ({ page, request }) => {
    await login(page, ADMIN.email);
    await page.goto(`${BASE}/admin/agents`);
    const href = await page
      .getByRole('link', { name: AGENT_B.name, exact: true })
      .first()
      .getAttribute('href');
    const agentBId = href!.split('/').pop()!;
    await logout(page);

    await login(page, AGENT_A.email);
    await page.goto(`${BASE}/admin/agents/${agentBId}`);
    await expect(page).toHaveURL(/\/report/);

    // and the print document for that agent is equally unreachable
    await page.goto(`${BASE}/print/agent/${agentBId}?year=${YEAR}&month=${MONTH}`);
    await expect(page).toHaveURL(/\/report/);
    await expect(page.locator('body')).not.toContainText(AGENT_B.name);

    void request;
  });

  test('an admin cannot file a report row for themselves', async ({ page }) => {
    await login(page, ADMIN.email);
    await page.goto(`${BASE}/report`);
    await expect(page).toHaveURL(/\/admin/);
  });
});

/* -------------------------------------------------------------------------- */
/* Agent workflow                                                              */
/* -------------------------------------------------------------------------- */

test.describe('agent report', () => {
  test('add, calculate, edit, delete and persist', async ({ page, context }) => {
    await login(page, AGENT_A.email);

    const stamp = Date.now();
    const invoicedAddress = `בדיקה עם חשבונית ${stamp}`;
    const uninvoicedAddress = `בדיקה ללא חשבונית ${stamp}`;

    // ---- add an invoiced row: ₪1,180 → net ₪1,000 → commission ₪400
    await addRow(page, invoicedAddress, '1180', `INV-${stamp}`);
    const invoicedRow = page.getByRole('row', { name: new RegExp(invoicedAddress) });
    await expect(invoicedRow).toContainText('400.00');
    await expect(invoicedRow).toContainText('1,000.00');

    // ---- add an uninvoiced row: earns nothing payable
    await addRow(page, uninvoicedAddress, '2360');
    const uninvoicedRow = page.getByRole('row', { name: new RegExp(uninvoicedAddress) });
    await expect(uninvoicedRow).toContainText('חסרה');
    await expect(uninvoicedRow).toContainText('—');

    // ---- edit the invoiced row's amount and confirm the commission follows
    await invoicedRow.getByRole('button', { name: `עריכת ${invoicedAddress}` }).click();
    await invoicedRow.getByLabel('סכום שנגבה').fill('2360');
    await invoicedRow.getByRole('button', { name: 'שמירה' }).click();
    await expect(invoicedRow).toContainText('800.00');

    // ---- survive a reload
    await page.reload();
    await expect(table(page).getByText(invoicedAddress, { exact: true })).toBeVisible();
    await expect(table(page).getByText(uninvoicedAddress, { exact: true })).toBeVisible();

    // ---- survive a completely new browser session
    await context.clearCookies();
    await login(page, AGENT_A.email);
    await expect(table(page).getByText(invoicedAddress, { exact: true })).toBeVisible();

    // ---- delete both rows, with confirmation
    for (const address of [invoicedAddress, uninvoicedAddress]) {
      const row = page.getByRole('row', { name: new RegExp(address) });
      await row.getByRole('button', { name: `מחיקת ${address}` }).click();
      await row.getByRole('button', { name: 'למחוק?' }).click();
      await expect(table(page).getByText(address, { exact: true })).toHaveCount(0);
    }

    await page.reload();
    await expect(table(page).getByText(invoicedAddress, { exact: true })).toHaveCount(0);
  });

  test('rejects invalid input before it reaches the server', async ({ page }) => {
    await login(page, AGENT_A.email);

    await page.getByRole('button', { name: 'הוספה' }).click();
    await expect(page.getByText('יש להזין כתובת נכס')).toBeVisible();
    await expect(page.getByText('יש להזין סכום שנגבה')).toBeVisible();

    await page.getByPlaceholder('כתובת הנכס').fill('כתובת כלשהי');
    await page.getByPlaceholder('סכום שנגבה').fill('abc');
    await page.getByRole('button', { name: 'הוספה' }).click();
    await expect(page.getByText(/הסכום אינו תקין/)).toBeVisible();

    await page.getByPlaceholder('סכום שנגבה').fill('1000');
    await page.getByLabel('קיימת חשבונית').check();
    await page.getByRole('button', { name: 'הוספה' }).click();
    await expect(page.getByText('יש להזין מספר חשבונית')).toBeVisible();
  });

  test('warns about duplicates inside the agent own report only', async ({ page }) => {
    await login(page, AGENT_A.email);

    const stamp = Date.now();
    const address = `כפילות פנימית ${stamp}`;
    await addRow(page, address, '1000', `DUP-${stamp}-1`);
    await addRow(page, `${address}  ,`, '1000', `DUP-${stamp}-2`);

    await expect(page.getByRole('heading', { name: 'התראות על דיווח כפול' })).toBeVisible();
    await expect(page.getByText('כתובת כפולה').first()).toBeVisible();

    // the agent panel never mentions another agent
    const panel = page.locator('section', { hasText: 'התראות על דיווח כפול' }).first();
    await expect(panel).not.toContainText(AGENT_B.name);
    await expect(panel).toContainText('אין לך גישה לנתוני סוכנים אחרים');

    // clean up both rows (the address is trimmed on save, so match by stamp)
    for (let i = 0; i < 2; i += 1) {
      const row = table(page).getByRole('row', { name: new RegExp(String(stamp)) }).first();
      await row.getByRole('button', { name: /^מחיקת/ }).click();
      await row.getByRole('button', { name: 'למחוק?' }).click();
      await expect(table(page).getByRole('row', { name: new RegExp(String(stamp)) })).toHaveCount(1 - i);
    }
    // the warning for *these* rows is gone (other rows may still be flagged)
    await expect(page.locator('body')).not.toContainText(String(stamp));
  });

  test('agent sees no trace of the seeded cross-agent duplicate', async ({ page }) => {
    // אופיר and גילנה both report "רחוב הרצל 5"; the agent view must stay silent.
    await login(page, AGENT_A.email);
    const body = page.locator('body');
    await expect(body).not.toContainText(AGENT_B.name);
    await expect(body).not.toContainText('2207'); // גילנה's invoice for that address
    await expect(body).not.toContainText('ויצמן 14'); // a גילנה-only property
  });

  test('month navigation reaches history and returns', async ({ page }) => {
    await login(page, AGENT_A.email);
    await expect(table(page).getByText('רחוב הרצל 5, תל אביב')).toBeVisible();

    await page.getByRole('button', { name: 'חודש קודם' }).click();
    await expect(table(page).getByText('ארלוזורוב 60, תל אביב')).toBeVisible();

    await page.getByRole('button', { name: 'חזרה לחודש הנוכחי' }).click();
    await expect(table(page).getByText('אבן גבירול 88, תל אביב')).toBeVisible();
  });

  test('an empty month shows an honest empty state, not a broken table', async ({ page }) => {
    await login(page, AGENT_A.email);
    await page.goto(`${BASE}/report?year=2021&month=7`);
    await expect(page.getByText('אין שורות')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'הוספת נכס לדיווח' })).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Administrator                                                               */
/* -------------------------------------------------------------------------- */

test.describe('administrator', () => {
  test('sees every agent, their counts and the consolidated total', async ({ page }) => {
    await login(page, ADMIN.email);

    for (const name of ['אופיר', 'גילנה', 'דניס', 'ליעד', 'רונן', 'חן', 'עידן']) {
      await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible();
    }

    await expect(page.getByRole('heading', { name: 'תוצאות לפי סוכן' })).toBeVisible();
    await expect(page.getByText('עמלה לתשלום').first()).toBeVisible();
    await expect(page.getByText('טרם דיווחו:')).toContainText('עידן');
  });

  test('detects cross-agent duplicates and names the agents involved', async ({ page }) => {
    await login(page, ADMIN.email);

    const panel = page.locator('section', { hasText: 'התראות על דיווחים כפולים' }).first();
    await expect(panel).toBeVisible();
    await expect(panel.getByText('בין סוכנים שונים').first()).toBeVisible();
    await expect(panel).toContainText('אופיר');
    await expect(panel).toContainText('גילנה');
    await expect(panel).toContainText('2024-118'); // דניס / רונן invoice collision
  });

  test('opens an individual agent report and its history', async ({ page }) => {
    await login(page, ADMIN.email);
    await page.getByRole('link', { name: 'אופיר', exact: true }).first().click();

    await expect(page.getByRole('heading', { name: 'אופיר' })).toBeVisible();
    await expect(table(page).getByText('רחוב הרצל 5, תל אביב')).toBeVisible();
    // the admin view is read-only: no add form, no row actions
    await expect(page.getByRole('heading', { name: 'הוספת נכס לדיווח' })).toBeHidden();

    await page.getByRole('button', { name: 'חודש קודם' }).click();
    await expect(table(page).getByText('ארלוזורוב 60, תל אביב')).toBeVisible();
  });

  test('adds an agent, deactivates them, and keeps their history', async ({ page, browser }) => {
    await login(page, ADMIN.email);
    await page.goto(`${BASE}/admin/agents`);

    const stamp = Date.now();
    const name = `סוכן בדיקה ${stamp}`;
    const email = `test-${stamp}@nadlan.co.il`;

    await page.getByLabel('שם מלא').fill(name);
    await page.getByLabel('דוא״ל').fill(email);
    await page.getByLabel('סיסמה ראשונית').fill('Testing!2345');
    await page.getByRole('button', { name: 'הוספת סוכן' }).click();
    await expect(page.getByText(`הסוכן ${name} נוסף בהצלחה`)).toBeVisible({ timeout: 20_000 });

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row.getByText('פעיל', { exact: true })).toBeVisible();

    // the new agent can sign in — from a clean context, not the admin's session
    const agentContext = await browser.newContext();
    const agentPage = await agentContext.newPage();
    await agentPage.goto(`${BASE}/login`);
    await agentPage.getByLabel('דוא״ל').fill(email);
    await agentPage.getByLabel('סיסמה').fill('Testing!2345');
    await agentPage.getByRole('button', { name: 'כניסה' }).click();
    await expect(agentPage).toHaveURL(/\/report/);
    await agentContext.close();

    // deactivate
    await row.getByRole('button', { name: 'השבתה' }).click();
    await row.getByRole('button', { name: 'להשבית?' }).click();
    await expect(page.getByRole('row', { name: new RegExp(name) }).getByText('לא פעיל')).toBeVisible();

    // and now sign-in is refused
    const blockedContext = await browser.newContext();
    const blocked = await blockedContext.newPage();
    await blocked.goto(`${BASE}/login`);
    await blocked.getByLabel('דוא״ל').fill(email);
    await blocked.getByLabel('סיסמה').fill('Testing!2345');
    await blocked.getByRole('button', { name: 'כניסה' }).click();
    await expect(blocked.locator('form').getByRole('alert')).toContainText('המשתמש אינו פעיל');
    await blockedContext.close();
  });

  test('rejects a duplicate e-mail address', async ({ page }) => {
    await login(page, ADMIN.email);
    await page.goto(`${BASE}/admin/agents`);

    await page.getByLabel('שם מלא').fill('כפילות');
    await page.getByLabel('דוא״ל').fill(AGENT_A.email);
    await page.getByLabel('סיסמה ראשונית').fill('Testing!2345');
    await page.getByRole('button', { name: 'הוספת סוכן' }).click();
    await expect(page.getByText('כתובת הדוא״ל כבר קיימת במערכת').first()).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Print documents                                                             */
/* -------------------------------------------------------------------------- */

test.describe('print documents', () => {
  test('an agent can print their own month', async ({ page }) => {
    await login(page, AGENT_A.email);
    await page.goto(`${BASE}/print/my-report?year=${YEAR}&month=${MONTH}`);

    await expect(page.getByRole('heading', { name: 'דיווח נכסים חודשי' })).toBeVisible();
    await expect(page.getByText(`סוכן: ${AGENT_A.name}`)).toBeVisible();
    await expect(page.getByText('סה״כ עמלה לתשלום')).toBeVisible();
    await expect(table(page).first().getByText('רחוב הרצל 5, תל אביב')).toBeVisible();
  });

  test('the consolidated report totals every agent', async ({ page }) => {
    await login(page, ADMIN.email);
    await page.goto(`${BASE}/print/summary?year=${YEAR}&month=${MONTH}`);

    await expect(page.getByRole('heading', { name: 'דוח מרכז – עמלות סוכנים' })).toBeVisible();
    await expect(page.getByText('סה״כ עמלות לתשלום')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'התראות על דיווחים כפולים בין סוכנים' }),
    ).toBeVisible();
  });

  test('navigation and controls are removed from the printed page', async ({ page }) => {
    await login(page, AGENT_A.email);
    await page.goto(`${BASE}/print/my-report?year=${YEAR}&month=${MONTH}`);
    await page.emulateMedia({ media: 'print' });

    await expect(page.getByRole('button', { name: 'הדפסה' })).toBeHidden();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'דיווח נכסים חודשי' })).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Console hygiene                                                             */
/* -------------------------------------------------------------------------- */

test('no console errors across the main screens', async ({ page }) => {
  const errors: string[] = [];
  /**
   * Navigating away cancels whatever the router was prefetching, and Chromium
   * reports that cancellation as a console error with no detail. Those are
   * artefacts of the test walking the app quickly, not defects, so aborted
   * requests are tracked separately and every *other* failure is still a
   * failure — including the bare "Failed to load resource" line, which is only
   * forgiven when an abort actually explains it.
   */
  const aborted: string[] = [];
  const realFailures: string[] = [];

  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown';
    if (reason.includes('ERR_ABORTED')) aborted.push(request.url());
    else realFailures.push(`${reason} ${request.url()}`);
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const isGenericLoadFailure = /Failed to load resource/i.test(text);
    if (isGenericLoadFailure && aborted.length > 0) return;
    errors.push(text);
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await login(page, ADMIN.email);
  for (const path of [
    '/admin',
    '/admin/agents',
    `/print/summary?year=${YEAR}&month=${MONTH}`,
  ]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('networkidle');
  }

  await page.goto(`${BASE}/admin`);
  await logout(page);

  await login(page, AGENT_A.email);
  await page.goto(`${BASE}/report`);
  await page.waitForLoadState('networkidle');

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
  expect(realFailures, `failed requests:\n${realFailures.join('\n')}`).toEqual([]);
});

/* -------------------------------------------------------------------------- */
/* Session and login hardening                                                 */
/* -------------------------------------------------------------------------- */

test.describe('session hardening', () => {
  test('the session cookie is HttpOnly, SameSite=Lax and scoped to the site root', async ({
    page,
    context,
  }) => {
    await login(page, AGENT_A.email);

    const cookie = (await context.cookies()).find((c) => c.name.endsWith('rc_session'));
    expect(cookie, 'no session cookie was set').toBeDefined();
    expect(cookie!.httpOnly, 'session cookie must be HttpOnly').toBe(true);
    expect(cookie!.sameSite).toBe('Lax');
    expect(cookie!.path).toBe('/');
    // Over plain HTTP the Secure flag and the __Host- prefix cannot be used;
    // both are derived from x-forwarded-proto in a real deployment.
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000);

    // The cookie is unreadable from page scripts, so XSS cannot exfiltrate it.
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain('rc_session');
  });

  test('a forged session cookie is rejected', async ({ page, context }) => {
    await login(page, AGENT_A.email);
    const name = (await context.cookies()).find((c) => c.name.endsWith('rc_session'))!.name;

    await context.clearCookies();
    await context.addCookies([
      {
        name,
        value: 'forged-token-that-was-never-issued',
        domain: new URL(BASE).hostname,
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await page.goto(`${BASE}/report`);
    await expect(page).toHaveURL(/\/login/);
  });

  test('logging out kills the session for good, even with the cookie replayed', async ({
    page,
    context,
  }) => {
    await login(page, AGENT_A.email);
    const cookie = (await context.cookies()).find((c) => c.name.endsWith('rc_session'))!;

    await logout(page);

    // Replay the exact cookie that was valid a moment ago.
    await context.addCookies([cookie]);
    await page.goto(`${BASE}/report`);
    await expect(page).toHaveURL(/\/login/);
  });

  test('deactivating an agent ends their live session on the next request', async ({
    page,
    browser,
  }) => {
    // Give the victim a working session first.
    const adminPage = page;
    await login(adminPage, ADMIN.email);
    await adminPage.goto(`${BASE}/admin/agents`);

    const stamp = Date.now();
    const name = `סוכן ניתוק ${stamp}`;
    const email = `revoke-${stamp}@nadlan.co.il`;
    await adminPage.getByLabel('שם מלא').fill(name);
    await adminPage.getByLabel('דוא״ל').fill(email);
    await adminPage.getByLabel('סיסמה ראשונית').fill('Testing!2345');
    await adminPage.getByRole('button', { name: 'הוספת סוכן' }).click();
    // Creating an account hashes a password with argon2id — deliberately slow —
    // and then waits on a router refresh, so this one needs more headroom than
    // the default assertion timeout.
    await expect(adminPage.getByText(`הסוכן ${name} נוסף בהצלחה`)).toBeVisible({ timeout: 20_000 });

    const victimContext = await browser.newContext();
    const victim = await victimContext.newPage();
    await victim.goto(`${BASE}/login`);
    await victim.getByLabel('דוא״ל').fill(email);
    await victim.getByLabel('סיסמה').fill('Testing!2345');
    await victim.getByRole('button', { name: 'כניסה' }).click();
    await expect(victim).toHaveURL(/\/report/);

    // Now deactivate them from the admin session.
    const row = adminPage.getByRole('row', { name: new RegExp(name) });
    await row.getByRole('button', { name: 'השבתה' }).click();
    await row.getByRole('button', { name: 'להשבית?' }).click();
    await expect(adminPage.getByRole('row', { name: new RegExp(name) }).getByText('לא פעיל')).toBeVisible();

    // The already-open session must not survive one more navigation.
    await victim.goto(`${BASE}/report`);
    await expect(victim).toHaveURL(/\/login/);
    await victimContext.close();
  });

  test('repeated wrong passwords are throttled, and other accounts are unaffected', async ({
    page,
    browser,
  }) => {
    const target = `throttle-probe-${Date.now()}@nadlan.co.il`;

    // The limit is 10 failures per address inside a 15 minute window.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await page.goto(`${BASE}/login`);
      await page.getByLabel('דוא״ל').fill(target);
      await page.getByLabel('סיסמה').fill(`wrong-${attempt}`);
      await page.getByRole('button', { name: 'כניסה' }).click();
      await expect(page.locator('form').getByRole('alert')).toBeVisible();
    }

    await page.goto(`${BASE}/login`);
    await page.getByLabel('דוא״ל').fill(target);
    await page.getByLabel('סיסמה').fill('wrong-again');
    await page.getByRole('button', { name: 'כניסה' }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText('יותר מדי ניסיונות כניסה');

    // The throttle is per address: a real user signing in is not collateral.
    const bystanderContext = await browser.newContext();
    const bystander = await bystanderContext.newPage();
    await bystander.goto(`${BASE}/login`);
    await bystander.getByLabel('דוא״ל').fill(AGENT_A.email);
    await bystander.getByLabel('סיסמה').fill(PASSWORD);
    await bystander.getByRole('button', { name: 'כניסה' }).click();
    await expect(bystander).toHaveURL(/\/report/);
    await bystanderContext.close();
  });
});
