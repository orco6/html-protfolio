import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

/**
 * Clears the login-attempt log before the suite runs.
 *
 * The throttle is deliberately real — shared across instances, backed by the
 * database — so without this the failed logins from one run would count against
 * the next one and the suite would slowly throttle itself.
 */
export default async function globalSetup() {
  const root = resolve(__dirname, '../..');
  try {
    for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    /* CI supplies the variables directly */
  }

  const url = process.env.OWNER_DATABASE_URL;
  if (!url) return;

  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query('delete from public.login_attempts');
  } catch {
    /* the table may not exist yet on a partially migrated database */
  } finally {
    await pool.end();
  }
}
