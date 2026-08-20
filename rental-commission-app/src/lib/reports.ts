import 'server-only';

import { withUser, type DbSession } from './db';
import { numericToAgorot, agorotToNumeric, type Agorot } from './money';
import { calculateTotals, type CommissionTotals } from './commission';
import { flagEntries, findDuplicateGroups, type DuplicateGroup, type EntryFlags } from './duplicates';
import type { Period } from './periods';
import type { EntryInput } from './validation';

/**
 * Every function here runs inside `withUser(...)`. That means PostgreSQL RLS,
 * not application code, is what decides which rows come back. The `agentId`
 * arguments below are filters, never the authorisation check — passing another
 * agent's id as a non-admin simply returns nothing.
 */

export interface ReportEntry {
  id: string;
  agentId: string;
  year: number;
  month: number;
  propertyAddress: string;
  amountCollected: Agorot;
  hasInvoice: boolean;
  invoiceNumber: string | null;
  addressKey: string | null;
  invoiceKey: string | null;
  createdAt: string;
}

interface EntryRow {
  id: string;
  agent_id: string;
  year: number;
  month: number;
  property_address: string;
  amount_collected: string;
  has_invoice: boolean;
  invoice_number: string | null;
  address_key: string | null;
  invoice_key: string | null;
  created_at: Date;
  agent_name?: string;
}

function mapEntry(row: EntryRow): ReportEntry & { agentName?: string } {
  return {
    id: row.id,
    agentId: row.agent_id,
    year: Number(row.year),
    month: Number(row.month),
    propertyAddress: row.property_address,
    amountCollected: numericToAgorot(row.amount_collected),
    hasInvoice: row.has_invoice,
    invoiceNumber: row.invoice_number,
    addressKey: row.address_key,
    invoiceKey: row.invoice_key,
    createdAt: row.created_at.toISOString(),
    ...(row.agent_name ? { agentName: row.agent_name } : {}),
  };
}

const ENTRY_COLUMNS = `
  e.id, e.agent_id, e.year, e.month, e.property_address, e.amount_collected,
  e.has_invoice, e.invoice_number, e.address_key, e.invoice_key, e.created_at
`;

// -----------------------------------------------------------------------------
// Agent-facing report
// -----------------------------------------------------------------------------

export interface AgentReport {
  agentId: string;
  period: Period;
  entries: ReportEntry[];
  totals: CommissionTotals;
  /** Only ever computed from this agent's own rows — no cross-agent leakage. */
  duplicateFlags: Map<string, EntryFlags>;
  duplicateGroups: DuplicateGroup<ReportEntry>[];
}

async function loadEntries(
  db: DbSession,
  agentId: string,
  { year, month }: Period,
): Promise<ReportEntry[]> {
  const rows = await db.query<EntryRow>(
    `select ${ENTRY_COLUMNS}
       from public.report_entries e
      where e.agent_id = $1 and e.year = $2 and e.month = $3
      order by e.created_at asc, e.id asc`,
    [agentId, year, month],
  );
  return rows.map(mapEntry);
}

export async function getAgentReport(
  viewerId: string,
  agentId: string,
  period: Period,
): Promise<AgentReport> {
  const entries = await withUser(viewerId, (db) => loadEntries(db, agentId, period));

  return {
    agentId,
    period,
    entries,
    totals: calculateTotals(entries),
    duplicateFlags: flagEntries(entries),
    duplicateGroups: findDuplicateGroups(entries),
  };
}

/** Months in which this agent already has rows — powers the history picker. */
export async function getAgentActivePeriods(viewerId: string, agentId: string): Promise<Period[]> {
  const rows = await withUser(viewerId, (db) =>
    db.query<{ year: number; month: number }>(
      `select distinct year, month
         from public.report_entries
        where agent_id = $1
        order by year desc, month desc`,
      [agentId],
    ),
  );
  return rows.map((r) => ({ year: Number(r.year), month: Number(r.month) }));
}

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

export async function createEntry(
  viewerId: string,
  agentId: string,
  period: Period,
  input: EntryInput,
): Promise<ReportEntry> {
  const row = await withUser(viewerId, (db) =>
    db.queryOne<EntryRow>(
      `insert into public.report_entries
         (agent_id, year, month, property_address, amount_collected, has_invoice, invoice_number)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, agent_id, year, month, property_address, amount_collected,
                 has_invoice, invoice_number, address_key, invoice_key, created_at`,
      [
        agentId,
        period.year,
        period.month,
        input.propertyAddress,
        agorotToNumeric(input.amountCollected),
        input.hasInvoice,
        input.invoiceNumber,
      ],
    ),
  );

  if (!row) throw new Error('createEntry: insert blocked');
  return mapEntry(row);
}

/**
 * Returns null when the row does not exist *or* the caller may not touch it —
 * the two cases are deliberately indistinguishable so ids cannot be probed.
 */
export async function updateEntry(
  viewerId: string,
  entryId: string,
  input: EntryInput,
): Promise<ReportEntry | null> {
  const row = await withUser(viewerId, (db) =>
    db.queryOne<EntryRow>(
      `update public.report_entries e
          set property_address = $2,
              amount_collected = $3,
              has_invoice      = $4,
              invoice_number   = $5
        where e.id = $1
       returning e.id, e.agent_id, e.year, e.month, e.property_address, e.amount_collected,
                 e.has_invoice, e.invoice_number, e.address_key, e.invoice_key, e.created_at`,
      [
        entryId,
        input.propertyAddress,
        agorotToNumeric(input.amountCollected),
        input.hasInvoice,
        input.invoiceNumber,
      ],
    ),
  );
  return row ? mapEntry(row) : null;
}

export async function deleteEntry(viewerId: string, entryId: string): Promise<boolean> {
  const row = await withUser(viewerId, (db) =>
    db.queryOne<{ id: string }>('delete from public.report_entries where id = $1 returning id', [entryId]),
  );
  return row !== null;
}

// -----------------------------------------------------------------------------
// Administrator views
// -----------------------------------------------------------------------------

export interface AgentSummary {
  agentId: string;
  agentName: string;
  email: string;
  isActive: boolean;
  totals: CommissionTotals;
}

export interface AdminMonthOverview {
  period: Period;
  agents: AgentSummary[];
  grandTotals: CommissionTotals;
  duplicateGroups: DuplicateGroup<ReportEntry & { agentName?: string }>[];
}

export async function getAdminMonthOverview(
  adminId: string,
  period: Period,
): Promise<AdminMonthOverview> {
  return withUser(adminId, async (db) => {
    const agents = await db.query<{ id: string; full_name: string; email: string; is_active: boolean }>(
      `select id, full_name, email, is_active
         from public.profiles
        where role = 'agent'
        order by is_active desc, full_name asc`,
    );

    const rows = await db.query<EntryRow>(
      `select ${ENTRY_COLUMNS}, p.full_name as agent_name
         from public.report_entries e
         join public.profiles p on p.id = e.agent_id
        where e.year = $1 and e.month = $2
        order by p.full_name asc, e.created_at asc`,
      [period.year, period.month],
    );

    const entries = rows.map(mapEntry);
    const byAgent = new Map<string, ReportEntry[]>();
    for (const entry of entries) {
      const bucket = byAgent.get(entry.agentId);
      if (bucket) bucket.push(entry);
      else byAgent.set(entry.agentId, [entry]);
    }

    const summaries: AgentSummary[] = agents
      .map((agent) => ({
        agentId: agent.id,
        agentName: agent.full_name,
        email: agent.email,
        isActive: agent.is_active,
        totals: calculateTotals(byAgent.get(agent.id) ?? []),
      }))
      // an inactive agent with nothing this month is noise on the dashboard
      .filter((summary) => summary.isActive || summary.totals.entryCount > 0);

    return {
      period,
      agents: summaries,
      grandTotals: calculateTotals(entries),
      duplicateGroups: findDuplicateGroups(entries),
    };
  });
}

/** Every month that has any data at all, newest first. */
export async function getAllActivePeriods(adminId: string): Promise<Period[]> {
  const rows = await withUser(adminId, (db) =>
    db.query<{ year: number; month: number }>(
      `select distinct year, month from public.report_entries order by year desc, month desc`,
    ),
  );
  return rows.map((r) => ({ year: Number(r.year), month: Number(r.month) }));
}
