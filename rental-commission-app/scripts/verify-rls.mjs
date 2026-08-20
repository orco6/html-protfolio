/**
 * Proves, against the real database, that row level security — not application
 * code — is what isolates agents from one another.
 *
 *   node scripts/verify-rls.mjs
 *
 * Every check runs as the `app_client` role, exactly as the running app does.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const client = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const auth = new pg.Pool({ connectionString: process.env.AUTH_DATABASE_URL });
const owner = new pg.Pool({ connectionString: process.env.OWNER_DATABASE_URL });

let failures = 0;
function check(name, passed, detail = '') {
  console.log(`${passed ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
}

/** Runs `fn` in a transaction with app.user_id set, mirroring lib/db.ts. */
async function as(userId, fn) {
  const c = await client.connect();
  try {
    await c.query('begin');
    await c.query('select set_config($1, $2, true)', ['app.user_id', userId]);
    return await fn(c);
  } finally {
    await c.query('rollback').catch(() => {});
    c.release();
  }
}

async function expectError(name, fn, codeHint) {
  try {
    await fn();
    check(name, false, 'the statement unexpectedly succeeded');
  } catch (error) {
    check(name, true, codeHint ? `blocked (${error.code ?? error.message.slice(0, 40)})` : 'blocked');
  }
}

async function main() {
  const { rows: people } = await owner.query(
    `select id, full_name, role from public.profiles order by role, full_name`,
  );
  const agents = people.filter((p) => p.role === 'agent');
  const admin = people.find((p) => p.role === 'admin');
  const [a1, a2] = agents;

  const { rows: allEntries } = await owner.query('select count(*)::int as n from public.report_entries');
  const { rows: a1Entries } = await owner.query(
    'select id, agent_id from public.report_entries where agent_id = $1',
    [a1.id],
  );
  const { rows: a2Entries } = await owner.query(
    'select id, agent_id from public.report_entries where agent_id = $1',
    [a2.id],
  );

  console.log(`\nfixtures: ${agents.length} agents, ${allEntries[0].n} entries total`);
  console.log(`agent A = ${a1.full_name} (${a1Entries.length} rows), agent B = ${a2.full_name} (${a2Entries.length} rows)\n`);

  // ------------------------------------------------------------ agent scope
  await as(a1.id, async (c) => {
    const { rows } = await c.query('select agent_id from public.report_entries');
    check(
      'agent sees only their own report rows',
      rows.length === a1Entries.length && rows.every((r) => r.agent_id === a1.id),
      `${rows.length} rows visible`,
    );

    const { rows: probe } = await c.query('select * from public.report_entries where agent_id = $1', [a2.id]);
    check("agent filtering by another agent's id returns nothing", probe.length === 0);

    const { rows: byId } = await c.query('select * from public.report_entries where id = $1', [
      a2Entries[0].id,
    ]);
    check("agent guessing another agent's row id returns nothing", byId.length === 0);

    const { rows: profiles } = await c.query('select id, full_name from public.profiles');
    check(
      'agent sees only their own profile row',
      profiles.length === 1 && profiles[0].id === a1.id,
      `${profiles.length} profiles visible`,
    );
  });

  // --------------------------------------------------------- agent mutation
  await as(a1.id, async (c) => {
    const { rowCount } = await c.query(
      'update public.report_entries set amount_collected = 1 where id = $1',
      [a2Entries[0].id],
    );
    check("agent cannot update another agent's row", rowCount === 0);

    const { rowCount: deleted } = await c.query('delete from public.report_entries where id = $1', [
      a2Entries[0].id,
    ]);
    check("agent cannot delete another agent's row", deleted === 0);
  });

  await expectError(
    "agent cannot insert a row owned by another agent",
    () =>
      as(a1.id, (c) =>
        c.query(
          `insert into public.report_entries (agent_id, year, month, property_address, amount_collected, has_invoice)
           values ($1, 2030, 1, 'attack', 100, false)`,
          [a2.id],
        ),
      ),
    true,
  );

  await expectError(
    'agent cannot reassign their own row to another agent',
    () =>
      as(a1.id, (c) =>
        c.query('update public.report_entries set agent_id = $2 where id = $1', [a1Entries[0].id, a2.id]),
      ),
    true,
  );

  // The update policy matches no rows for a non-admin, so the statement is a
  // silent no-op rather than an error. Assert both the row count and the state.
  await as(a1.id, async (c) => {
    const { rowCount } = await c.query("update public.profiles set role = 'admin' where id = $1", [a1.id]);
    check('agent cannot promote themselves to admin', rowCount === 0, `${rowCount} rows affected`);
  });
  const { rows: stillAgent } = await owner.query('select role from public.profiles where id = $1', [a1.id]);
  check("agent's role is unchanged in the database", stillAgent[0].role === 'agent');

  await as(a1.id, async (c) => {
    const { rowCount } = await c.query("update public.profiles set is_active = true where role = 'agent'");
    check('agent cannot modify any profile row', rowCount === 0, `${rowCount} rows affected`);
  });

  await expectError(
    'agent cannot create a profile',
    () =>
      as(a1.id, (c) =>
        c.query(
          `insert into public.profiles (email, password_hash, full_name, role)
           values ('attacker@example.com', 'x', 'attacker', 'admin')`,
        ),
      ),
    true,
  );

  await expectError(
    'business-data role cannot touch the sessions table at all',
    () => as(a1.id, (c) => c.query('select * from public.sessions')),
    true,
  );

  // ------------------------------------------------------------- no identity
  const anon = await client.connect();
  try {
    const { rows } = await anon.query('select * from public.report_entries');
    check('a connection with no app.user_id sees nothing', rows.length === 0);
  } finally {
    anon.release();
  }

  // ------------------------------------------------------------------ admin
  await as(admin.id, async (c) => {
    const { rows } = await c.query('select id from public.report_entries');
    check('admin sees every report row', rows.length === allEntries[0].n, `${rows.length} rows`);

    const { rows: profiles } = await c.query('select id from public.profiles');
    check('admin sees every profile', profiles.length === people.length);
  });

  // ------------------------------------------------------------- auth role
  await expectError(
    'auth role has no access to report data',
    () => auth.query('select * from public.report_entries'),
    true,
  );

  const { rows: authProfiles } = await auth.query('select id, email from public.profiles');
  check('auth role can read credentials for login', authProfiles.length === people.length);

  await expectError(
    'auth role cannot read the full profile row (column grants)',
    () => auth.query('select created_at from public.profiles'),
    true,
  );

  // ----------------------------------------------------- deactivated agents
  const inactive = a2.id;
  await owner.query('update public.profiles set is_active = false where id = $1', [inactive]);
  try {
    await expectError(
      'a deactivated agent cannot file new rows',
      () =>
        as(inactive, (c) =>
          c.query(
            `insert into public.report_entries (agent_id, year, month, property_address, amount_collected, has_invoice)
             values ($1, 2030, 1, 'after deactivation', 100, false)`,
            [inactive],
          ),
        ),
      true,
    );

    await as(admin.id, async (c) => {
      const { rows } = await c.query('select id from public.report_entries where agent_id = $1', [inactive]);
      check(
        'history of a deactivated agent stays visible to admin',
        rows.length === a2Entries.length,
        `${rows.length} rows preserved`,
      );
    });
  } finally {
    await owner.query('update public.profiles set is_active = true where id = $1', [inactive]);
  }

  // ------------------------------------------------------------ duplicate keys
  const { rows: keys } = await owner.query(
    `select app.normalize_text('שדרות  רוטשילד 12 , תל אביב') = app.normalize_text('שדרות רוטשילד 12, תל אביב') as addr,
            app.normalize_invoice('2024-118') = app.normalize_invoice('2024 118') as inv`,
  );
  check('address normalisation ignores spacing and punctuation', keys[0].addr === true);
  check('invoice normalisation ignores separators', keys[0].inv === true);

  // The client re-runs duplicate detection locally for instant feedback, so its
  // normalisation must agree with the database's character for character.
  const jsNormalizeText = (v) =>
    v.trim().toLowerCase().replace(/[^0-9a-z֐-׿]+/g, ' ').replace(/\s+/g, ' ').trim();
  const jsNormalizeInvoice = (v) => v.trim().toLowerCase().replace(/[^0-9a-z֐-׿]+/g, '');

  const samples = [
    'רחוב הרצל 5, תל אביב',
    'רחוב  הרצל 5 , תל-אביב  ',
    'כפילות פנימית 1787232418180  ,',
    'כפילות פנימית 1787232418180',
    '  שדרות רוטשילד 12  ',
    'Herzl ST. 5',
    'דיזנגוף 210, תל אביב!!!',
    '2024-118',
    '2024 118',
  ];

  let parityFailures = 0;
  for (const sample of samples) {
    const { rows } = await owner.query(
      'select app.normalize_text($1) as t, app.normalize_invoice($1) as i',
      [sample],
    );
    const expectedText = jsNormalizeText(sample) || null;
    const expectedInvoice = jsNormalizeInvoice(sample) || null;
    if (rows[0].t !== expectedText || rows[0].i !== expectedInvoice) {
      parityFailures += 1;
      console.log(
        `        mismatch for ${JSON.stringify(sample)}: db=${JSON.stringify(rows[0].t)} js=${JSON.stringify(expectedText)}`,
      );
    }
  }
  check(
    'SQL and TypeScript normalisation agree exactly',
    parityFailures === 0,
    `${samples.length} samples`,
  );

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  await Promise.all([client.end(), auth.end(), owner.end()]);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
