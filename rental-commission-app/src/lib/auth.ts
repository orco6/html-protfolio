import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { argon2id, hash as argon2Hash, verify as argon2Verify, type HashOptions } from 'argon2';

import { withAuthDb } from './db';

export const SESSION_COOKIE = 'rc_session';
const SESSION_TTL_DAYS = 14;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export type UserRole = 'admin' | 'agent';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

/**
 * Argon2id with deliberately conservative parameters. Verification cost is
 * paid once per login, never per request — requests carry a session cookie.
 */
const ARGON_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Only a keyed digest of the session token is persisted. A dump of the
 * sessions table is therefore not enough to mint a usable cookie — the
 * attacker would also need SESSION_SECRET from the server environment.
 */
function digestToken(token: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('Missing SESSION_SECRET');
  return createHmac('sha256', secret).update(token).digest('hex');
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  password_hash: string;
}

/** A dummy hash so a login attempt for an unknown address costs the same time. */
let decoyHash: string | null = null;
async function getDecoyHash(): Promise<string> {
  decoyHash ??= await hashPassword(randomBytes(24).toString('hex'));
  return decoyHash;
}

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: 'invalid_credentials' | 'inactive' };

export async function login(email: string, password: string, userAgent?: string): Promise<LoginResult> {
  const profile = await withAuthDb((db) =>
    db.queryOne<ProfileRow>(
      `select id, email, full_name, role, is_active, password_hash
         from public.profiles
        where email = $1`,
      [email.trim()],
    ),
  );

  // Always run a verification so response timing does not reveal whether the
  // address exists.
  const matched = await verifyPassword(profile?.password_hash ?? (await getDecoyHash()), password);

  if (!profile || !matched) return { ok: false, reason: 'invalid_credentials' };
  if (!profile.is_active) return { ok: false, reason: 'inactive' };

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await withAuthDb((db) =>
    db.query(
      `insert into public.sessions (user_id, token_hash, expires_at, user_agent)
       values ($1, $2, $3, $4)`,
      [profile.id, digestToken(token), expiresAt, userAgent?.slice(0, 500) ?? null],
    ),
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return {
    ok: true,
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      isActive: profile.is_active,
    },
  };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    await withAuthDb((db) =>
      db.query('delete from public.sessions where token_hash = $1', [digestToken(token)]),
    );
  }
  jar.delete(SESSION_COOKIE);
}

interface SessionRow extends ProfileRow {
  session_id: string;
}

/**
 * Resolves the caller from their cookie. Returns null for a missing, expired,
 * revoked or deactivated session. Deactivating a profile therefore locks the
 * person out on their very next request, without touching the sessions table.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let hash: string;
  try {
    hash = digestToken(token);
  } catch {
    return null;
  }

  const row = await withAuthDb((db) =>
    db.queryOne<SessionRow>(
      `select s.id as session_id,
              p.id, p.email, p.full_name, p.role, p.is_active, p.password_hash
         from public.sessions s
         join public.profiles p on p.id = s.user_id
        where s.token_hash = $1
          and s.expires_at > now()`,
      [hash],
    ),
  );

  if (!row) return null;
  if (!row.is_active) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
  };
}

/** Server-side gate for every authenticated page and action. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/report');
  return user;
}

export async function requireAgent(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'agent') redirect('/admin');
  return user;
}

/** Constant-time comparison used by CSRF-ish token checks. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function revokeAllSessionsFor(userId: string): Promise<void> {
  await withAuthDb((db) => db.query('delete from public.sessions where user_id = $1', [userId]));
}

export async function setPassword(userId: string, plain: string): Promise<void> {
  const hash = await hashPassword(plain);
  await withAuthDb((db) =>
    db.query('update public.profiles set password_hash = $2 where id = $1', [userId, hash]),
  );
}
