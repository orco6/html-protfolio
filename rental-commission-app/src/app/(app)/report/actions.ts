'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth';
import { createEntry, deleteEntry, updateEntry, type ReportEntry } from '@/lib/reports';
import { entryInputSchema, periodSchema, fieldErrors, uuidSchema } from '@/lib/validation';

/**
 * The only mutation surface for report rows.
 *
 * Authorisation is layered: `requireUser()` establishes who is calling, and
 * every statement then runs under that identity through RLS. Nothing here
 * trusts an agent id supplied by the browser — an agent always writes as
 * themselves, and an administrator's writes are permitted by policy, not by an
 * `if` in this file.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string> };

const GENERIC_ERROR = 'הפעולה נכשלה. יש לנסות שוב.';
const NOT_FOUND = 'הדיווח לא נמצא או שאין לך הרשאה לערוך אותו.';

function parseEntryInput(payload: unknown) {
  return entryInputSchema.safeParse(payload);
}

export async function createEntryAction(payload: {
  year: number;
  month: number;
  propertyAddress: string;
  amountCollected: string;
  hasInvoice: boolean;
  invoiceNumber: string;
}): Promise<ActionResult<ReportEntry>> {
  const user = await requireUser();

  const period = periodSchema.safeParse({ year: payload.year, month: payload.month });
  if (!period.success) return { ok: false, error: 'החודש שנבחר אינו תקין.' };

  const input = parseEntryInput(payload);
  if (!input.success) {
    return { ok: false, error: 'יש לתקן את השדות המסומנים.', fields: fieldErrors(input.error) };
  }

  // An administrator has no personal report; only agents file rows for themselves.
  if (user.role !== 'agent') {
    return { ok: false, error: 'רק סוכן יכול להוסיף דיווח.' };
  }

  try {
    const entry = await createEntry(user.id, user.id, period.data, input.data);
    revalidatePath('/report');
    return { ok: true, data: entry };
  } catch (error) {
    console.error('createEntryAction failed', error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateEntryAction(payload: {
  id: string;
  propertyAddress: string;
  amountCollected: string;
  hasInvoice: boolean;
  invoiceNumber: string;
}): Promise<ActionResult<ReportEntry>> {
  const user = await requireUser();

  const id = uuidSchema.safeParse(payload.id);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  const input = parseEntryInput(payload);
  if (!input.success) {
    return { ok: false, error: 'יש לתקן את השדות המסומנים.', fields: fieldErrors(input.error) };
  }

  try {
    const entry = await updateEntry(user.id, id.data, input.data);
    if (!entry) return { ok: false, error: NOT_FOUND };
    revalidatePath('/report');
    return { ok: true, data: entry };
  } catch (error) {
    console.error('updateEntryAction failed', error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function deleteEntryAction(entryId: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const id = uuidSchema.safeParse(entryId);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  try {
    const removed = await deleteEntry(user.id, id.data);
    if (!removed) return { ok: false, error: NOT_FOUND };
    revalidatePath('/report');
    return { ok: true, data: { id: id.data } };
  } catch (error) {
    console.error('deleteEntryAction failed', error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
