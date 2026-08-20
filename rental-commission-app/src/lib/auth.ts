import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { argon2id, hash as argon2Hash, verify as argon2Verify, type HashOptions } from 'argon2';

import { withAuthDb } from './db';

/* -------------------------------------------------------------------------- */
/* Session cookie                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Over HTTPS the cookie carries the `__Host-` prefix, which the browser only
 * honours when the cookie is Secure, Path=/ and has no Domain attribute. That
 * makes it impossible for a sibling subdomain to write the session cookie, so
 * an attacker cannot plant a session of their choosing on a victim's browser.
 *
 * The prefix requires Secure, so plain-HTTP development uses the bare name.
 * Both are read when resolving, which keeps a session alive across a scheme
 * change and across a deployment.
 */
const SECURE_COOKIE = '__Host-rc_session';
const PLAIN_COOKIE = 'rc_session';

/** Hard cap on a session's life, regardless of activity. */
const SESSION_ABSOLUTE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** A session unused for this long is dead even if it has not expired. */
const SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Only refresh `last_seen_at` this often, to keep reads from becoming writes. */
const SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Login throttle                                                              */
/* -------------------------------------------------------------------------- */

const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 10;
const MAX_FAILURES_PER_IP = 60; // a whole office can share one NAT address
/** Recorded attempts older than this are pruned opportunistically. */
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

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

/* -------------------------------------------------------------------------- */
/* Request context                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Whether this request arrived over TLS. Behind Vercel (or any reverse proxy)
 * the connection to the Node process is plain HTTP, so the forwarded header is
 * the only truthful source; `APP_ORIGIN` is the fallback for hosts that do not
 * set one.
 */
async function isSecureRequest(): Promise<boolean> {
  const header = await headers();
  const forwarded = header.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === 'https';
  return process.env.APP_ORIGIN?.startsWith('https://') ?? false;
}

/** Best-effort client address for rate limiting. Never used for authorisation. */
async function clientIp(): Promise<string | null> {
  const header = await headers();
  const forwarded = header.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || header.get('x-real-ip')?.trim();
  if (!candidate) return null;
  // Reject anything that is not a plain address so it can be bound to `inet`.
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : null;
}

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */

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
  | { ok: false; reason: 'invalid_credentials' | 'inactive' | 'throttled' };

async function recordAttempt(email: string, ip: string | null, succeeded: boolean): Promise<void> {
  await withAuthDb(async (db) => {
    await db.query(
      'insert into public.login_attempts (email, ip, succeeded) values ($1, $2::inet, $3)',
      [email, ip, succeeded],
    );
    // Opportunistic pruning keeps the table bounded without a scheduled job.
    if (Math.random() < 0.02) {
      await db.query('delete from public.login_attempts where attempted_at < $1', [
        new Date(Date.now() - ATTEMPT_RETENTION_MS),
      ]);
    }
  });
}

async function isThrottled(email: string, ip: string | null): Promise<boolean> {
  const row = await withAuthDb((db) =>
    db.queryOne<{ by_email: number; by_ip: number }>(
      'select * from app.recent_login_failures($1::citext, $2::inet, $3)',
      [email, ip, new Date(Date.now() - THROTTLE_WINDOW_MS)],
    ),
  );
  if (!row) return false;
  return row.by_email >= MAX_FAILURES_PER_EMAIL || row.by_ip >= MAX_FAILURES_PER_IP;
}

export async function login(email: string, password: string, userAgent?: string): Promise<LoginResult> {
  const normalisedEmail = email.trim();
  const ip = await clientIp();

  if (await isThrottled(normalisedEmail, ip)) {
    return { ok: false, reason: 'throttled' };
  }

  const profile = await withAuthDb((db) =>
    db.queryOne<ProfileRow>(
      `select id, email, full_name, role, is_active, password_hash
         from public.profiles
        where email = $1`,
      [normalisedEmail],
    ),
  );

  // Always run a verification so response timing does not reveal whether the
  // address exists.
  const matched = await verifyPassword(profile?.password_hash ?? (await getDecoyHash()), password);

  if (!profile || !matched) {
    await recordAttempt(normalisedEmail, ip, false);
    return { ok: false, reason: 'invalid_credentials' };
  }
  if (!profile.is_active) {
    await recordAttempt(normalisedEmail, ip, false);
    return { ok: false, reason: 'inactive' };
  }

  // A fresh token is minted on every login and the cookie is overwritten, so a
  // session identifier chosen by somebody else can never be adopted.
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS);

  await withAuthDb((db) =>
    db.query(
      `insert into public.sessions (user_id, token_hash, expires_at, user_agent)
       values ($1, $2, $3, $4)`,
      [profile.id, digestToken(token), expiresAt, userAgent?.slice(0, 500) ?? null],
    ),
  );

  await recordAttempt(normalisedEmail, ip, true);

  const secure = await isSecureRequest();
  const jar = await cookies();
  jar.set(secure ? SECURE_COOKIE : PLAIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
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
  const token = jar.get(SECURE_COOKIE)?.value ?? jar.get(PLAIN_COOKIE)?.value;

  if (token) {
    await withAuthDb((db) =>
      db.query('delete from public.sessions where token_hash = $1', [digestToken(token)]),
    );
  }
  // Clear both names: the scheme may have changed since the cookie was set.
  jar.delete(SECURE_COOKIE);
  jar.delete(PLAIN_COOKIE);
}

/* -------------------------------------------------------------------------- */
/* Session resolution                                                          */
/* -------------------------------------------------------------------------- */

interface SessionRow extends ProfileRow {
  session_id: string;
  last_seen_at: Date;
}

/**
 * Resolves the caller from their cookie. Returns null for a missing, expired,
 * idle, revoked or deactivated session.
 *
 * The profile is re-read on every request, so deactivating someone locks them
 * out on their very next click without touching the sessions table — and
 * `setAgentActive` additionally deletes their sessions outright.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SECURE_COOKIE)?.value ?? jar.get(PLAIN_COOKIE)?.value;
  if (!token) return null;

  let hash: string;
  try {
    hash = digestToken(token);
  } catch {
    return null;
  }

  const row = await withAuthDb((db) =>
    db.queryOne<SessionRow>(
      `select s.id as session_id, s.last_seen_at,
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

  const idleFor = Date.now() - new Date(row.last_seen_at).getTime();

  if (idleFor > SESSION_IDLE_TTL_MS) {
    // Dead through inactivity: remove it rather than leave it to linger.
    await withAuthDb((db) =>
      db.query('delete from public.sessions where id = $1', [row.session_id]),
    );
    return null;
  }

  if (idleFor > SESSION_TOUCH_INTERVAL_MS) {
    await withAuthDb((db) =>
      db.query('update public.sessions set last_seen_at = now() where id = $1', [row.session_id]),
    );
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
  };
}

/* -------------------------------------------------------------------------- */
/* Route gates                                                                 */
/* -------------------------------------------------------------------------- */

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

export async function revokeAllSessionsFor(userId: string): Promise<void> {
  await withAuthDb((db) => db.query('delete from public.sessions where user_id = $1', [userId]));
}
