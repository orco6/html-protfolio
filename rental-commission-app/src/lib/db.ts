import 'server-only';

import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';

/**
 * Two physically separate connection pools, each logging in as a different
 * least-privilege PostgreSQL role.
 *
 *   authPool  → app_auth   : credentials + session store, zero business data
 *   dataPool  → app_client : business data, with RLS FORCED
 *
 * Business queries must go through `withUser()`, which opens a transaction and
 * publishes the caller's identity via `app.user_id`. Every RLS policy reads
 * that setting and re-derives the caller's role from the database, so an agent
 * cannot widen their own access by tampering with anything the browser sends.
 *
 * Deployment note
 * ---------------
 * On a serverless host every instance keeps its own pool, so `PG_POOL_MAX`
 * stays small and the connection string should point at a transaction-mode
 * pooler (Supabase Supavisor on port 6543). It is not *too* small: an admin
 * page renders one query per agent plus whatever the router prefetches, and a
 * pool of four turns that fan-out into a queue.
 * `withUser()` is a single short transaction, which is exactly what
 * transaction pooling supports; no named/prepared statements are used
 * anywhere, so the pooler never has to hold session state for us.
 */

declare global {
  var __rc_dataPool: Pool | undefined;
  var __rc_authPool: Pool | undefined;
}

const isProduction = process.env.NODE_ENV === 'production';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Locally: run ./scripts/setup-db.sh. In production: see docs/DEPLOYMENT.md.`,
    );
  }
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * TLS policy.
 *
 * Managed Postgres (Supabase included) presents a certificate signed by a CA
 * that is not in Node's default trust store, so full verification needs the
 * provider's CA bundle. Supply it as `PGSSLROOTCERT` (PEM text) and the
 * connection is verified end to end; without it we still require TLS but
 * cannot verify the chain, which is why the app refuses to start in that state
 * unless `PGSSL_ALLOW_UNVERIFIED=true` is set deliberately.
 *
 * Local development over the loopback interface needs no TLS at all.
 */
function sslConfig(connectionString: string): PoolConfig['ssl'] {
  const url = safeParse(connectionString);
  const host = url?.hostname ?? '';
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const sslMode = url?.searchParams.get('sslmode');

  if (sslMode === 'disable' || (isLoopback && sslMode === null)) return undefined;

  const ca = process.env.PGSSLROOTCERT?.trim();
  if (ca) return { ca, rejectUnauthorized: true };

  if (process.env.PGSSL_ALLOW_UNVERIFIED === 'true') {
    return { rejectUnauthorized: false };
  }

  if (isProduction) {
    throw new Error(
      'Refusing to open an unverified TLS connection to the database. ' +
        'Set PGSSLROOTCERT to the provider CA bundle (recommended), or set ' +
        'PGSSL_ALLOW_UNVERIFIED=true to accept an unverified chain.',
    );
  }

  return { rejectUnauthorized: false };
}

function safeParse(connectionString: string): URL | null {
  try {
    return new URL(connectionString);
  } catch {
    return null;
  }
}

function createPool(connectionString: string, appName: string): Pool {
  const pool = new Pool({
    connectionString,
    application_name: appName,
    ssl: sslConfig(connectionString),
    // Serverless instances multiply pools; keep each one small.
    max: positiveInt('PG_POOL_MAX', isProduction ? 8 : 10),
    idleTimeoutMillis: positiveInt('PG_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMillis: positiveInt('PG_CONNECT_TIMEOUT_MS', 10_000),
    // A runaway query must never pin a pooled connection, and an abandoned
    // transaction must never hold row locks on financial data.
    statement_timeout: positiveInt('PG_STATEMENT_TIMEOUT_MS', 15_000),
    idle_in_transaction_session_timeout: positiveInt('PG_IDLE_TX_TIMEOUT_MS', 10_000),
  });

  pool.on('error', (error) => {
    console.error(`[db:${appName}] idle client error`, error);
  });

  return pool;
}

export function dataPool(): Pool {
  globalThis.__rc_dataPool ??= createPool(requireEnv('DATABASE_URL'), 'rental-commissions/data');
  return globalThis.__rc_dataPool;
}

export function authPool(): Pool {
  globalThis.__rc_authPool ??= createPool(requireEnv('AUTH_DATABASE_URL'), 'rental-commissions/auth');
  return globalThis.__rc_authPool;
}

export interface DbSession {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<T[]>;
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<T | null>;
}

function wrap(client: PoolClient): DbSession {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []) {
      const result = await client.query<T>(text, values as unknown[]);
      return result.rows;
    },
    async queryOne<T extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []) {
      const result = await client.query<T>(text, values as unknown[]);
      return result.rows[0] ?? null;
    },
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` inside a transaction whose RLS identity is `userId`.
 *
 * `set_local` scopes the setting to the transaction, so a pooled connection can
 * never leak one user's identity into the next request even if the transaction
 * is rolled back or the callback throws. The identity is passed as a bound
 * parameter to `set_config`, never interpolated into SQL text.
 */
export async function withUser<T>(userId: string, fn: (db: DbSession) => Promise<T>): Promise<T> {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('withUser: userId must be a UUID');
  }

  const client = await dataPool().connect();
  try {
    await client.query('begin');
    await client.query('select set_config($1, $2, true)', ['app.user_id', userId]);
    const result = await fn(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* the connection is already broken; releasing it is enough */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Auth-role access: credentials and sessions only. */
export async function withAuthDb<T>(fn: (db: DbSession) => Promise<T>): Promise<T> {
  const client = await authPool().connect();
  try {
    return await fn(wrap(client));
  } finally {
    client.release();
  }
}
