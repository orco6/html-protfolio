import 'server-only';

import { withUser } from './db';
import { hashPassword } from './auth';
import { revokeAllSessionsFor } from './auth';

export interface AgentProfile {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  /** Rows ever filed by this agent — proves history survives deactivation. */
  entryCount: number;
}

interface AgentRow {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: Date;
  entry_count: string;
}

export async function listAgents(adminId: string): Promise<AgentProfile[]> {
  const rows = await withUser(adminId, (db) =>
    db.query<AgentRow>(
      `select p.id, p.full_name, p.email, p.is_active, p.created_at,
              count(e.id) as entry_count
         from public.profiles p
         left join public.report_entries e on e.agent_id = p.id
        where p.role = 'agent'
        group by p.id
        order by p.is_active desc, p.full_name asc`,
    ),
  );

  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    entryCount: Number(row.entry_count),
  }));
}

export async function getAgent(viewerId: string, agentId: string): Promise<AgentProfile | null> {
  const row = await withUser(viewerId, (db) =>
    db.queryOne<AgentRow>(
      `select p.id, p.full_name, p.email, p.is_active, p.created_at,
              count(e.id) as entry_count
         from public.profiles p
         left join public.report_entries e on e.agent_id = p.id
        where p.id = $1 and p.role = 'agent'
        group by p.id`,
      [agentId],
    ),
  );

  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    entryCount: Number(row.entry_count),
  };
}

export type CreateAgentResult =
  | { ok: true; agent: AgentProfile }
  | { ok: false; reason: 'duplicate_email' };

export async function createAgent(
  adminId: string,
  input: { fullName: string; email: string; password: string },
): Promise<CreateAgentResult> {
  const passwordHash = await hashPassword(input.password);

  try {
    const row = await withUser(adminId, (db) =>
      db.queryOne<Omit<AgentRow, 'entry_count'>>(
        `insert into public.profiles (email, password_hash, full_name, role, is_active)
         values ($1, $2, $3, 'agent', true)
         returning id, full_name, email, is_active, created_at`,
        [input.email, passwordHash, input.fullName],
      ),
    );

    if (!row) return { ok: false, reason: 'duplicate_email' };

    return {
      ok: true,
      agent: {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        isActive: row.is_active,
        createdAt: row.created_at.toISOString(),
        entryCount: 0,
      },
    };
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
      return { ok: false, reason: 'duplicate_email' };
    }
    throw error;
  }
}

/**
 * Soft activation toggle. Deactivating never removes rows — historical months
 * keep showing the agent's data, and their sessions are revoked immediately.
 */
export async function setAgentActive(
  adminId: string,
  agentId: string,
  isActive: boolean,
): Promise<boolean> {
  const row = await withUser(adminId, (db) =>
    db.queryOne<{ id: string }>(
      `update public.profiles
          set is_active = $2
        where id = $1 and role = 'agent'
        returning id`,
      [agentId, isActive],
    ),
  );

  if (row && !isActive) await revokeAllSessionsFor(agentId);
  return row !== null;
}
