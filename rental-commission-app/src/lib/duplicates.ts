/**
 * Duplicate detection.
 *
 * Pure functions over already-authorised rows — this module never decides who
 * may see what. Scope is chosen by the caller:
 *
 *   agent view : only that agent's own rows are ever passed in (RLS guarantees
 *                it), so an agent can only ever be warned about a collision
 *                inside their own report.
 *   admin view : all rows for the period are passed in, and groups are
 *                labelled as internal to one agent or spanning several.
 *
 * Matching runs on the normalised keys produced by the database
 * (`app.normalize_text` / `app.normalize_invoice`), so "רחוב הרצל 5",
 * "רחוב  הרצל 5 " and "רחוב הרצל, 5" all collide, as do "2024-118" and
 * "2024118".
 */

export type DuplicateKind = 'address' | 'invoice';

export interface DuplicateCandidate {
  id: string;
  agentId: string;
  agentName?: string;
  propertyAddress: string;
  invoiceNumber: string | null;
  addressKey: string | null;
  invoiceKey: string | null;
}

export interface DuplicateGroup<T extends DuplicateCandidate = DuplicateCandidate> {
  kind: DuplicateKind;
  /** Human-readable representative of the colliding value. */
  label: string;
  /** The normalised key the rows collided on. */
  key: string;
  entries: T[];
  /** True when more than one distinct agent appears in the group. */
  crossAgent: boolean;
  agentNames: string[];
}

function keyOf(kind: DuplicateKind, entry: DuplicateCandidate): string | null {
  return kind === 'address' ? entry.addressKey : entry.invoiceKey;
}

function labelOf(kind: DuplicateKind, entry: DuplicateCandidate): string {
  return kind === 'address' ? entry.propertyAddress : (entry.invoiceNumber ?? '');
}

function groupByKind<T extends DuplicateCandidate>(
  kind: DuplicateKind,
  entries: readonly T[],
): DuplicateGroup<T>[] {
  const buckets = new Map<string, T[]>();

  for (const entry of entries) {
    const key = keyOf(kind, entry);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }

  const groups: DuplicateGroup<T>[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;
    const agentIds = new Set(bucket.map((e) => e.agentId));
    const agentNames = [...new Set(bucket.map((e) => e.agentName).filter((n): n is string => Boolean(n)))];
    groups.push({
      kind,
      key,
      label: labelOf(kind, bucket[0]),
      entries: bucket,
      crossAgent: agentIds.size > 1,
      agentNames,
    });
  }

  return groups.sort((a, b) => b.entries.length - a.entries.length || a.label.localeCompare(b.label, 'he'));
}

export function findDuplicateGroups<T extends DuplicateCandidate>(
  entries: readonly T[],
): DuplicateGroup<T>[] {
  return [...groupByKind('address', entries), ...groupByKind('invoice', entries)];
}

export interface EntryFlags {
  duplicateAddress: boolean;
  duplicateInvoice: boolean;
}

/**
 * Per-row flags for rendering inline warnings, keyed by entry id.
 * Rows with no collision are absent from the map.
 */
export function flagEntries(entries: readonly DuplicateCandidate[]): Map<string, EntryFlags> {
  const flags = new Map<string, EntryFlags>();

  for (const group of findDuplicateGroups(entries)) {
    for (const entry of group.entries) {
      const current = flags.get(entry.id) ?? { duplicateAddress: false, duplicateInvoice: false };
      if (group.kind === 'address') current.duplicateAddress = true;
      else current.duplicateInvoice = true;
      flags.set(entry.id, current);
    }
  }

  return flags;
}

/** Mirrors `app.normalize_text` so the client can pre-empt a collision locally. */
export function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z֐-׿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mirrors `app.normalize_invoice`. */
export function normalizeInvoice(value: string): string {
  return value.trim().toLowerCase().replace(/[^0-9a-z֐-׿]+/g, '');
}
