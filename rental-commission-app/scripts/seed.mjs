/**
 * Seeds the initial people, and optionally a realistic month of demo data.
 *
 *   node scripts/seed.mjs                          # development: people + demo rows
 *   node scripts/seed.mjs --fresh                  # wipe first, then reseed
 *   node scripts/seed.mjs --no-demo                # people only, no report rows
 *   node scripts/seed.mjs --random-passwords       # one strong password each,
 *                                                  # printed once and not stored
 *
 * Production bootstrap uses `--no-demo --random-passwords`; scripts/deploy-supabase.sh
 * calls it that way.
 *
 * Runs as the database owner because creating the very first administrator is
 * precisely the step no RLS policy can authorise.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import argon2 from 'argon2';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// ---------------------------------------------------------------- env loading
function loadEnv(file) {
  try {
    for (const line of readFileSync(resolve(root, file), 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    /* optional */
  }
}
loadEnv('.env.local');

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Demo!2345';
const fresh = process.argv.includes('--fresh');
const noDemo = process.argv.includes('--no-demo');
const randomPasswords = process.argv.includes('--random-passwords');

/** Human-typeable but high-entropy: ~77 bits over an unambiguous alphabet. */
function generatePassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(15);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10)}`;
}

if (!process.env.OWNER_DATABASE_URL) {
  console.error('Missing OWNER_DATABASE_URL. Run ./scripts/setup-db.sh first.');
  process.exit(1);
}

// Seeding runs as the schema owner: creating the first administrator is
// precisely the bootstrap step no RLS policy can authorise.
const pool = new pg.Pool({ connectionString: process.env.OWNER_DATABASE_URL });

// -------------------------------------------------------------------- people
const ADMINS = [
  { fullName: 'אורי כהן', email: 'uri@nadlan.co.il' },
  { fullName: 'רות לוי', email: 'ruth@nadlan.co.il' },
  { fullName: 'אבי מזרחי', email: 'avi@nadlan.co.il' },
];

const AGENTS = [
  { fullName: 'אופיר', email: 'ofir@nadlan.co.il' },
  { fullName: 'גילנה', email: 'gilana@nadlan.co.il' },
  { fullName: 'דניס', email: 'denis@nadlan.co.il' },
  { fullName: 'ליעד', email: 'liad@nadlan.co.il' },
  { fullName: 'רונן', email: 'ronen@nadlan.co.il' },
  { fullName: 'חן', email: 'chen@nadlan.co.il' },
  { fullName: 'עידן', email: 'idan@nadlan.co.il' },
];

// ---------------------------------------------------------------- demo report
const now = new Date();
const CURRENT = { year: now.getFullYear(), month: now.getMonth() + 1 };
const PREVIOUS =
  CURRENT.month === 1
    ? { year: CURRENT.year - 1, month: 12 }
    : { year: CURRENT.year, month: CURRENT.month - 1 };

/**
 * Deliberately contains the collisions the duplicate detector must catch:
 *   · "רחוב הרצל 5, תל אביב" reported by both אופיר and גילנה   → cross-agent address
 *   · invoice 2024-118 used by both דניס and רונן                → cross-agent invoice
 *   · ליעד reports "שדרות רוטשילד 12" twice with different spacing → same-agent address
 */
const DEMO_ENTRIES = [
  // אופיר
  ['אופיר', CURRENT, 'רחוב הרצל 5, תל אביב', '4200.00', true, '1041'],
  ['אופיר', CURRENT, 'אבן גבירול 88, תל אביב', '3600.00', true, '1042'],
  ['אופיר', CURRENT, 'דיזנגוף 210, תל אביב', '2950.50', false, null],
  // גילנה — same address as אופיר, different invoice
  ['גילנה', CURRENT, 'רחוב הרצל 5 , תל-אביב', '4200.00', true, '2207'],
  ['גילנה', CURRENT, 'ויצמן 14, רמת גן', '5100.00', true, '2208'],
  // דניס
  ['דניס', CURRENT, 'הנביאים 33, ירושלים', '3850.00', true, '2024-118'],
  ['דניס', CURRENT, 'יפו 97, ירושלים', '2400.00', false, null],
  // רונן — same invoice number as דניס
  ['רונן', CURRENT, 'סוקולוב 21, הרצליה', '6300.00', true, '2024 118'],
  ['רונן', CURRENT, 'בן גוריון 4, הרצליה', '4750.00', true, '3310'],
  // ליעד — duplicate address inside his own report
  ['ליעד', CURRENT, 'שדרות רוטשילד 12, תל אביב', '5400.00', true, '4401'],
  ['ליעד', CURRENT, 'שדרות  רוטשילד 12 , תל אביב', '5400.00', true, '4402'],
  ['ליעד', CURRENT, 'הירקון 150, תל אביב', '3200.00', true, '4403'],
  // חן
  ['חן', CURRENT, 'ההסתדרות 7, חיפה', '2800.00', true, '5501'],
  ['חן', CURRENT, 'מוריה 45, חיפה', '3150.00', true, '5502'],
  // עידן has not reported this month at all

  // previous month — history
  ['אופיר', PREVIOUS, 'רחוב הרצל 5, תל אביב', '4200.00', true, '0941'],
  ['אופיר', PREVIOUS, 'ארלוזורוב 60, תל אביב', '3300.00', true, '0942'],
  ['גילנה', PREVIOUS, 'ויצמן 14, רמת גן', '5100.00', true, '2107'],
  ['דניס', PREVIOUS, 'הנביאים 33, ירושלים', '3850.00', true, '2024-091'],
  ['ליעד', PREVIOUS, 'הירקון 150, תל אביב', '3200.00', false, null],
  ['רונן', PREVIOUS, 'סוקולוב 21, הרצליה', '6300.00', true, '3210'],
  ['עידן', PREVIOUS, 'קפלן 9, פתח תקווה', '2650.00', true, '6601'],
];

// ------------------------------------------------------------------- helpers
async function upsertProfile(client, { fullName, email, role, passwordHash }) {
  const { rows } = await client.query(
    `insert into public.profiles (email, password_hash, full_name, role, is_active)
     values ($1, $2, $3, $4, true)
     on conflict (email) do update
       set full_name = excluded.full_name, role = excluded.role
     returning id, email`,
    [email, passwordHash, fullName, role],
  );
  return rows[0];
}

const ARGON = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

async function main() {
  const client = await pool.connect();
  try {
    const sharedHash = randomPasswords ? null : await argon2.hash(DEMO_PASSWORD, ARGON);
    /** email → plaintext, printed once at the end when generating passwords. */
    const issued = new Map();

    async function hashFor(email) {
      if (!randomPasswords) return sharedHash;
      const plain = generatePassword();
      issued.set(email, plain);
      return argon2.hash(plain, ARGON);
    }

    if (fresh) {
      console.log('==> clearing existing report data, sessions and non-seed profiles');
      await client.query('delete from public.report_entries');
      await client.query('delete from public.sessions');
      await client.query('delete from public.profiles where email <> all($1::citext[])', [
        [...ADMINS, ...AGENTS].map((p) => p.email),
      ]);
    }

    const byName = new Map();

    for (const admin of ADMINS) {
      const passwordHash = await hashFor(admin.email);
      const row = await upsertProfile(client, { ...admin, role: 'admin', passwordHash });
      byName.set(admin.fullName, row.id);
    }
    console.log(`==> ${ADMINS.length} administrators ready`);

    for (const agent of AGENTS) {
      const passwordHash = await hashFor(agent.email);
      const row = await upsertProfile(client, { ...agent, role: 'agent', passwordHash });
      byName.set(agent.fullName, row.id);
    }
    console.log(`==> ${AGENTS.length} agents ready`);

    const { rows: existing } = await client.query('select count(*)::int as n from public.report_entries');
    if (noDemo) {
      console.log('==> --no-demo: no report rows inserted');
    } else if (existing[0].n > 0 && !fresh) {
      console.log(`==> report_entries already has ${existing[0].n} rows; skipping demo data`);
    } else {
      for (const [agentName, period, address, amount, hasInvoice, invoice] of DEMO_ENTRIES) {
        await client.query(
          `insert into public.report_entries
             (agent_id, year, month, property_address, amount_collected, has_invoice, invoice_number)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [byName.get(agentName), period.year, period.month, address, amount, hasInvoice, invoice],
        );
      }
      console.log(`==> inserted ${DEMO_ENTRIES.length} demo report rows`);
    }

    if (randomPasswords) {
      const width = Math.max(...issued.keys().map((e) => e.length));
      console.log('\n  Initial sign-in details — shown once, not stored anywhere.');
      console.log('  Give each person only their own line, then keep this in a password manager.');
      console.log('  To rotate one later: node scripts/set-password.mjs <email>\n');
      for (const person of [...ADMINS, ...AGENTS]) {
        const role = ADMINS.includes(person) ? 'מנהל' : 'סוכן';
        console.log(
          `    ${person.email.padEnd(width)}  ${issued.get(person.email)}   ${role}  ${person.fullName}`,
        );
      }
      console.log('');
    } else {
      console.log('\nSeed complete. Sign-in details:');
      console.log(`  password for every seeded account: ${DEMO_PASSWORD}`);
      console.log(`  administrators: ${ADMINS.map((a) => a.email).join(', ')}`);
      console.log(`  agents:         ${AGENTS.map((a) => a.email).join(', ')}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
