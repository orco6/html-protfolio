'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { SummaryStrip } from './summary';
import { DuplicatePanel, type PanelGroup } from './duplicate-panel';
import { EntriesTable, type ClientEntry } from './entries-table';
import { calculateTotals } from '@/lib/commission';
import { findDuplicateGroups } from '@/lib/duplicates';
import type { Period } from '@/lib/periods';

/**
 * Owns the month's rows on the client so the headline figures, the duplicate
 * warnings and the table always agree.
 *
 * Adding a row has to update all three at once — a summary that only catches
 * up on the next page load is worse than no summary at all when someone is
 * keying in twenty properties in a row.
 *
 * Only rows the viewer is already authorised to see ever reach this component:
 * for an agent the server sends their own rows and nothing else, so the
 * duplicate groups computed here cannot reference anybody else.
 */
export function ReportWorkspace({
  initialEntries,
  period,
  editable,
  agentNames,
  duplicateScope,
}: {
  initialEntries: ClientEntry[];
  period: Period;
  editable: boolean;
  /** agentId → display name. Empty for the agent's own view. */
  agentNames?: Record<string, string>;
  duplicateScope: 'agent' | 'admin';
}) {
  const [entries, setEntries] = useState(initialEntries);

  useEffect(() => setEntries(initialEntries), [initialEntries]);

  const totals = useMemo(() => calculateTotals(entries), [entries]);

  const duplicateGroups = useMemo<PanelGroup[]>(
    () =>
      findDuplicateGroups(
        entries.map((entry) => ({
          ...entry,
          agentName: agentNames?.[entry.agentId],
        })),
      ).map((group) => ({
        kind: group.kind,
        key: group.key,
        label: group.label,
        crossAgent: group.crossAgent,
        agentNames: group.agentNames,
        entries: group.entries.map((entry) => ({
          id: entry.id,
          agentId: entry.agentId,
          agentName: entry.agentName,
          propertyAddress: entry.propertyAddress,
          invoiceNumber: entry.invoiceNumber,
          amountCollected: entry.amountCollected,
        })),
      })),
    [entries, agentNames],
  );

  const handleChange = useCallback((next: ClientEntry[]) => setEntries(next), []);

  return (
    <>
      <SummaryStrip totals={totals} />
      <DuplicatePanel scope={duplicateScope} groups={duplicateGroups} />
      <EntriesTable
        entries={entries}
        onEntriesChange={handleChange}
        period={period}
        editable={editable}
      />
    </>
  );
}
