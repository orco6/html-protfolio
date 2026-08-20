import { describe, expect, it } from 'vitest';

import {
  comparePeriods,
  currentPeriod,
  isValidPeriod,
  parsePeriod,
  periodLabel,
  shiftPeriod,
  shortPeriodLabel,
} from '../src/lib/periods';

describe('shiftPeriod', () => {
  it('moves within a year', () => {
    expect(shiftPeriod({ year: 2026, month: 5 }, -1)).toEqual({ year: 2026, month: 4 });
    expect(shiftPeriod({ year: 2026, month: 5 }, 1)).toEqual({ year: 2026, month: 6 });
  });

  it('rolls across year boundaries in both directions', () => {
    expect(shiftPeriod({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftPeriod({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftPeriod({ year: 2026, month: 1 }, -13)).toEqual({ year: 2024, month: 12 });
  });
});

describe('parsePeriod', () => {
  it('accepts valid query parameters', () => {
    expect(parsePeriod('2025', '3')).toEqual({ year: 2025, month: 3 });
  });

  it('falls back to the current month for anything invalid', () => {
    const now = currentPeriod();
    for (const [y, m] of [
      [undefined, undefined],
      ['abc', '3'],
      ['2025', '13'],
      ['2025', '0'],
      ['1999', '3'],
      ['2025', '-1'],
      ['2025.5', '3'],
    ] as Array<[string | undefined, string | undefined]>) {
      expect(parsePeriod(y, m)).toEqual(now);
    }
  });

  it('handles repeated query parameters by taking the first', () => {
    expect(parsePeriod(['2025', '2024'], ['3', '4'])).toEqual({ year: 2025, month: 3 });
  });
});

describe('isValidPeriod', () => {
  it('rejects malformed input', () => {
    expect(isValidPeriod(null)).toBe(false);
    expect(isValidPeriod({ year: 2025 })).toBe(false);
    expect(isValidPeriod({ year: 2025, month: 12.5 })).toBe(false);
    expect(isValidPeriod({ year: 2025, month: 12 })).toBe(true);
  });
});

describe('labels', () => {
  it('renders Hebrew month names', () => {
    expect(periodLabel({ year: 2026, month: 1 })).toBe('ינואר 2026');
    expect(periodLabel({ year: 2026, month: 12 })).toBe('דצמבר 2026');
  });

  it('renders a zero-padded short label', () => {
    expect(shortPeriodLabel({ year: 2026, month: 3 })).toBe('03/2026');
  });
});

describe('comparePeriods', () => {
  it('orders chronologically', () => {
    expect(comparePeriods({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBeLessThan(0);
    expect(comparePeriods({ year: 2026, month: 2 }, { year: 2026, month: 1 })).toBeGreaterThan(0);
    expect(comparePeriods({ year: 2026, month: 1 }, { year: 2026, month: 1 })).toBe(0);
  });
});
