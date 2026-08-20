/**
 * Visual QA driver: signs in with a real browser, walks every important screen
 * at desktop, tablet and phone widths, and writes screenshots to
 * ./qa-screenshots for inspection.
 *
 *   node scripts/qa-shots.mjs [only-name]
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const OUT = 'qa-screenshots';
const PASSWORD = 'Demo!2345';
const only = process.argv[2];

const VIEWPORTS = {
  desktop: { width: 1440, height: 960 },
  tablet: { width: 834, height: 1112 },
  phone: { width: 390, height: 844 },
  // A4 portrait minus the @page margins, at 96dpi — what actually hits paper.
  paper: { width: 794, height: 1123 },
};

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth() + 1;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const consoleErrors = [];

async function session(viewportName, email) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewportName],
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${viewportName}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${viewportName}] ${e.message}`));

  if (email) {
    await page.goto(`${BASE}/login`);
    await page.getByLabel('דוא״ל').fill(email);
    await page.getByLabel('סיסמה').fill(PASSWORD);
    await page.getByRole('button', { name: 'כניסה' }).click();
    await page.waitForURL(/\/(report|admin)/);
  }
  return { context, page };
}

async function shot(page, name, { full = true, media } = {}) {
  if (media) await page.emulateMedia({ media });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  if (media) await page.emulateMedia({ media: 'screen' });
  console.log(`  captured ${name}.png`);
}

/** Resolves an agent's id through the admin agents list. */
async function agentIdFor(page, name) {
  await page.goto(`${BASE}/admin/agents`);
  const href = await page.getByRole('link', { name, exact: true }).first().getAttribute('href');
  return href.split('/').pop();
}

const tasks = {
  async login() {
    for (const vp of ['desktop', 'phone']) {
      const { context, page } = await session(vp, null);
      await page.goto(`${BASE}/login`);
      await shot(page, `login-${vp}`);

      await page.getByLabel('דוא״ל').fill('ofir@nadlan.co.il');
      await page.getByLabel('סיסמה').fill('wrong');
      await page.getByRole('button', { name: 'כניסה' }).click();
      await page.waitForTimeout(700);
      await shot(page, `login-error-${vp}`);
      await context.close();
    }
  },

  async agent() {
    for (const vp of ['desktop', 'tablet', 'phone']) {
      const { context, page } = await session(vp, 'ofir@nadlan.co.il');
      await shot(page, `agent-report-${vp}`);
      await context.close();
    }

    // an agent whose report contains duplicates
    const { context, page } = await session('desktop', 'liad@nadlan.co.il');
    await shot(page, 'agent-duplicates-desktop');

    // mid-edit state
    await page.getByRole('button', { name: /^עריכת/ }).first().click();
    await page.waitForTimeout(250);
    await shot(page, 'agent-editing-desktop');

    // delete confirmation
    await page.reload();
    await page.getByRole('button', { name: /^מחיקת/ }).first().click();
    await page.waitForTimeout(250);
    await shot(page, 'agent-delete-confirm-desktop');
    await context.close();

    // history + empty month
    const { context: c2, page: p2 } = await session('desktop', 'ofir@nadlan.co.il');
    await p2.getByRole('button', { name: 'חודש קודם' }).click();
    await p2.waitForTimeout(700);
    await shot(p2, 'agent-history-desktop');
    await p2.goto(`${BASE}/report?year=2021&month=7`);
    await shot(p2, 'agent-empty-month-desktop');
    await c2.close();
  },

  async agentMobileEdit() {
    const { context, page } = await session('phone', 'liad@nadlan.co.il');
    await shot(page, 'agent-report-phone-duplicates');
    await page.getByRole('button', { name: 'עריכה' }).first().click();
    await page.waitForTimeout(250);
    await shot(page, 'agent-editing-phone');
    await context.close();
  },

  async admin() {
    for (const vp of ['desktop', 'tablet', 'phone']) {
      const { context, page } = await session(vp, 'uri@nadlan.co.il');
      await shot(page, `admin-overview-${vp}`);

      await page.goto(`${BASE}/admin/agents`);
      await shot(page, `admin-agents-${vp}`);
      await context.close();
    }

    const { context, page } = await session('desktop', 'uri@nadlan.co.il');
    await page.getByRole('link', { name: 'אופיר', exact: true }).first().click();
    await page.waitForURL(/\/admin\/agents\//);
    await shot(page, 'admin-agent-detail-desktop');
    await context.close();

    const { context: c2, page: p2 } = await session('phone', 'uri@nadlan.co.il');
    await p2.goto(`${BASE}/admin`);
    await p2.getByRole('button', { name: 'פתיחת תפריט' }).click();
    await p2.waitForTimeout(250);
    await shot(p2, 'admin-mobile-menu');
    await c2.close();
  },

  async print() {
    const { context, page } = await session('desktop', 'ofir@nadlan.co.il');
    await page.goto(`${BASE}/print/my-report?year=${Y}&month=${M}`);
    await shot(page, 'print-agent-screen');
    await context.close();

    const { context: cp, page: pp } = await session('paper', 'ofir@nadlan.co.il');
    await pp.goto(`${BASE}/print/my-report?year=${Y}&month=${M}`);
    await shot(pp, 'print-agent-paper', { media: 'print' });
    await cp.close();

    const { context: c2, page: p2 } = await session('paper', 'uri@nadlan.co.il');
    await p2.goto(`${BASE}/print/summary?year=${Y}&month=${M}`);
    await shot(p2, 'print-summary-paper', { media: 'print' });
    await p2.goto(`${BASE}/print/agent/${await agentIdFor(p2, 'ליעד')}?year=${Y}&month=${M}`);
    await shot(p2, 'print-admin-agent-paper', { media: 'print' });
    await c2.close();
  },

  async notFound() {
    const { context, page } = await session('desktop', 'uri@nadlan.co.il');
    await page.goto(`${BASE}/admin/agents/00000000-0000-0000-0000-000000000000`);
    await shot(page, 'not-found-desktop');
    await context.close();
  },
};

for (const [name, run] of Object.entries(tasks)) {
  if (only && only !== name) continue;
  console.log(`== ${name}`);
  await run();
}

await browser.close();

if (consoleErrors.length > 0) {
  console.log('\nCONSOLE ERRORS:');
  for (const e of [...new Set(consoleErrors)]) console.log(`  ${e}`);
  process.exitCode = 1;
} else {
  console.log('\nno console errors');
}
