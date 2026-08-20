import 'server-only';

import { Pool, type PoolClient, type QueryResultRow } from 'pg';

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
 */

declare global {
  var __rc_dataPool: Pool | undefined;
  var __rc_authPool: Pool | undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Run ./scripts/setup-db.sh to provision the database.`,
    );
  }
  return value;
}

function createPool(connectionString: string, appName: string): Pool {
  const pool = new Pool({
    connectionString,
    application_name: appName,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
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

/**
 * Runs `fn` inside a transaction whose RLS identity is `userId`.
 *
 * `set_local` scopes the setting to the transaction, so a pooled connection can
 * never leak one user's identity into the next request even if the transaction
 * is rolled back or the callback throws.
 */
export async function withUser<T>(userId: string, fn: (db: DbSession) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
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
