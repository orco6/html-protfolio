/**
 * Rotates one account's password and revokes its live sessions.
 *
 *   node scripts/set-password.mjs someone@example.com            # generate one
 *   node scripts/set-password.mjs someone@example.com 'chosen-pw'
 *
 * Operational tooling, not a product feature — it runs as the database owner
 * from a trusted machine, never from the application. Any existing session for
 * the account is destroyed, so a leaked cookie cannot outlive the rotation.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import argon2 from 'argon2';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* optional in production, where the variable is supplied directly */
}

const [email, provided] = process.argv.slice(2);

if (!email) {
  console.error('Usage: node scripts/set-password.mjs <email> [password]');
  process.exit(2);
}
if (!process.env.OWNER_DATABASE_URL) {
  console.error('Missing OWNER_DATABASE_URL.');
  process.exit(1);
}
if (provided && provided.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(2);
}

function generatePassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (const byte of randomBytes(15)) out += alphabet[byte % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10)}`;
}

const password = provided ?? generatePassword();
const pool = new pg.Pool({ connectionString: process.env.OWNER_DATABASE_URL });

try {
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const { rowCount } = await pool.query(
    'update public.profiles set password_hash = $2 where email = $1',
    [email, hash],
  );

  if (rowCount === 0) {
    console.error(`No account with e-mail ${email}.`);
    process.exit(1);
  }

  const { rowCount: revoked } = await pool.query(
    'delete from public.sessions where user_id = (select id from public.profiles where email = $1)',
    [email],
  );

  console.log(`Password updated for ${email}.`);
  if (!provided) console.log(`New password: ${password}`);
  console.log(`Revoked ${revoked} active session(s).`);
} finally {
  await pool.end();
}
