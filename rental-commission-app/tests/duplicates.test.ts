import { describe, expect, it } from 'vitest';

import {
  findDuplicateGroups,
  flagEntries,
  normalizeInvoice,
  normalizeText,
  type DuplicateCandidate,
} from '../src/lib/duplicates';

/** Builds a candidate with the normalised keys the database would generate. */
function entry(
  id: string,
  agentId: string,
  address: string,
  invoice: string | null,
  agentName?: string,
): DuplicateCandidate {
  return {
    id,
    agentId,
    agentName,
    propertyAddress: address,
    invoiceNumber: invoice,
    addressKey: normalizeText(address) || null,
    invoiceKey: invoice ? normalizeInvoice(invoice) || null : null,
  };
}

describe('normalisation', () => {
  it('collapses spacing, casing and punctuation in addresses', () => {
    expect(normalizeText('שדרות  רוטשילד 12 , תל אביב')).toBe(
      normalizeText('שדרות רוטשילד 12, תל אביב'),
    );
    expect(normalizeText('Herzl ST. 5')).toBe(normalizeText('herzl st 5'));
    expect(normalizeText('  רחוב הרצל 5  ')).toBe('רחוב הרצל 5');
  });

  it('strips every separator from invoice numbers', () => {
    expect(normalizeInvoice('2024-118')).toBe('2024118');
    expect(normalizeInvoice('2024 118')).toBe('2024118');
    expect(normalizeInvoice('2024/118')).toBe('2024118');
    expect(normalizeInvoice('  2024118 ')).toBe('2024118');
  });

  it('does not conflate genuinely different values', () => {
    expect(normalizeText('הרצל 5')).not.toBe(normalizeText('הרצל 15'));
    expect(normalizeInvoice('1041')).not.toBe(normalizeInvoice('10041'));
  });
});

describe('findDuplicateGroups', () => {
  it('finds addresses that differ only by spacing or punctuation', () => {
    const groups = findDuplicateGroups([
      entry('1', 'a', 'שדרות רוטשילד 12, תל אביב', '4401'),
      entry('2', 'a', 'שדרות  רוטשילד 12 , תל אביב', '4402'),
      entry('3', 'a', 'הירקון 150, תל אביב', '4403'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('address');
    expect(groups[0].entries.map((e) => e.id)).toEqual(['1', '2']);
    expect(groups[0].crossAgent).toBe(false);
  });

  it('finds invoice numbers that differ only by separators', () => {
    const groups = findDuplicateGroups([
      entry('1', 'a', 'הנביאים 33', '2024-118'),
      entry('2', 'b', 'סוקולוב 21', '2024 118'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('invoice');
    expect(groups[0].crossAgent).toBe(true);
  });

  it('marks a group as cross-agent only when more than one agent is involved', () => {
    const sameAgent = findDuplicateGroups([
      entry('1', 'a', 'הרצל 5', '10'),
      entry('2', 'a', 'הרצל 5', '11'),
    ]);
    expect(sameAgent[0].crossAgent).toBe(false);

    const twoAgents = findDuplicateGroups([
      entry('1', 'a', 'הרצל 5', '10', 'אופיר'),
      entry('2', 'b', 'הרצל 5', '11', 'גילנה'),
    ]);
    expect(twoAgents[0].crossAgent).toBe(true);
    expect(twoAgents[0].agentNames).toEqual(['אופיר', 'גילנה']);
  });

  it('ignores rows with no invoice when matching invoices', () => {
    const groups = findDuplicateGroups([
      entry('1', 'a', 'הרצל 5', null),
      entry('2', 'a', 'ויצמן 14', null),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('reports both an address and an invoice collision for the same rows', () => {
    const groups = findDuplicateGroups([
      entry('1', 'a', 'הרצל 5', '900'),
      entry('2', 'b', 'הרצל 5', '900'),
    ]);
    expect(groups.map((g) => g.kind).sort()).toEqual(['address', 'invoice']);
  });

  it('returns nothing for a clean report', () => {
    expect(
      findDuplicateGroups([
        entry('1', 'a', 'הרצל 5', '1'),
        entry('2', 'a', 'ויצמן 14', '2'),
        entry('3', 'a', 'דיזנגוף 210', '3'),
      ]),
    ).toHaveLength(0);
  });
});

describe('flagEntries', () => {
  it('flags each affected row by the kind of collision', () => {
    const flags = flagEntries([
      entry('1', 'a', 'הרצל 5', '900'),
      entry('2', 'a', 'הרצל 5', '901'),
      entry('3', 'a', 'ויצמן 14', '900'),
    ]);

    expect(flags.get('1')).toEqual({ duplicateAddress: true, duplicateInvoice: true });
    expect(flags.get('2')).toEqual({ duplicateAddress: true, duplicateInvoice: false });
    expect(flags.get('3')).toEqual({ duplicateAddress: false, duplicateInvoice: true });
  });

  it('leaves clean rows out of the map entirely', () => {
    const flags = flagEntries([entry('1', 'a', 'הרצל 5', '1'), entry('2', 'a', 'ויצמן 14', '2')]);
    expect(flags.size).toBe(0);
  });
});

describe('agent privacy', () => {
  it('cannot surface another agent when only own rows are supplied', () => {
    // This mirrors what the agent screen receives: RLS has already removed
    // every row belonging to anybody else.
    const ownRowsOnly = [
      entry('1', 'a', 'הרצל 5', '900', 'אופיר'),
      entry('2', 'a', 'הרצל 5', '901', 'אופיר'),
    ];
    const groups = findDuplicateGroups(ownRowsOnly);

    expect(groups.every((g) => !g.crossAgent)).toBe(true);
    expect(new Set(groups.flatMap((g) => g.entries.map((e) => e.agentId)))).toEqual(new Set(['a']));
  });
});
