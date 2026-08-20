import { describe, expect, it } from 'vitest';

import {
  agentShare,
  calculateEntry,
  calculateTotals,
  netOfVat,
  sumTotals,
} from '../src/lib/commission';
import {
  agorotToNumeric,
  formatILS,
  numericToAgorot,
  parseAmountToAgorot,
  scale,
} from '../src/lib/money';

/* -------------------------------------------------------------------------- */
/* Money primitives                                                            */
/* -------------------------------------------------------------------------- */

describe('parseAmountToAgorot', () => {
  it('parses plain and decorated amounts', () => {
    expect(parseAmountToAgorot('1250')).toBe(125_000);
    expect(parseAmountToAgorot('1250.5')).toBe(125_050);
    expect(parseAmountToAgorot('1250.50')).toBe(125_050);
    expect(parseAmountToAgorot('1,250.50')).toBe(125_050);
    expect(parseAmountToAgorot('₪1,250.50')).toBe(125_050);
    expect(parseAmountToAgorot(' 0.07 ')).toBe(7);
    expect(parseAmountToAgorot('0')).toBe(0);
  });

  it('rejects anything that is not a clean non-negative amount', () => {
    for (const bad of ['', '   ', 'abc', '-5', '1.234', '1.2.3', '1e3', '5%', '..', '12,', '1,5', '1,23', '1,2345']) {
      expect(parseAmountToAgorot(bad), `expected ${JSON.stringify(bad)} to be rejected`).toBeNull();
    }
  });

  it('accepts properly grouped thousands', () => {
    expect(parseAmountToAgorot('1,250')).toBe(125_000);
    expect(parseAmountToAgorot('1,250,000.25')).toBe(125_000_025);
  });

  it('round-trips through the PostgreSQL numeric representation', () => {
    for (const value of [0, 1, 99, 100, 125_050, 1_234_567]) {
      expect(numericToAgorot(agorotToNumeric(value))).toBe(value);
    }
    expect(agorotToNumeric(7)).toBe('0.07');
    expect(agorotToNumeric(100)).toBe('1.00');
  });
});

describe('scale', () => {
  it('rounds half away from zero without touching floats', () => {
    // 0.5 agora must round up, not to even
    expect(scale(1, 1, 2)).toBe(1);
    expect(scale(3, 1, 2)).toBe(2);
    expect(scale(100, 40, 100)).toBe(40);
  });
});

/* -------------------------------------------------------------------------- */
/* Business rule                                                               */
/* -------------------------------------------------------------------------- */

describe('commission rule', () => {
  it('strips 18% VAT then pays the agent 40% of the remainder', () => {
    // ₪1,180.00 collected → ₪1,000.00 net → ₪400.00 commission
    const result = calculateEntry({ amountCollected: 118_000, hasInvoice: true });
    expect(result.net).toBe(100_000);
    expect(result.vat).toBe(18_000);
    expect(result.commission).toBe(40_000);
    expect(result.payable).toBe(40_000);
  });

  it('matches hand-checked figures for a typical management fee', () => {
    // ₪4,200.00 → net 4200/1.18 = 3559.322… → ₪3,559.32 → 40% = ₪1,423.73
    const result = calculateEntry({ amountCollected: 420_000, hasInvoice: true });
    expect(result.net).toBe(355_932);
    expect(result.commission).toBe(142_373);
  });

  it('never pays out a row without an invoice', () => {
    const result = calculateEntry({ amountCollected: 420_000, hasInvoice: false });
    expect(result.commission).toBe(142_373); // still earned on paper
    expect(result.payable).toBe(0); // but nothing is payable
  });

  it('handles zero without producing negative zero or NaN', () => {
    const result = calculateEntry({ amountCollected: 0, hasInvoice: true });
    expect(result).toEqual({ gross: 0, net: 0, vat: 0, commission: 0, payable: 0 });
  });

  it('keeps net + VAT equal to gross for every amount, so nothing leaks', () => {
    for (let gross = 0; gross <= 20_000; gross += 7) {
      const { net, vat } = calculateEntry({ amountCollected: gross, hasInvoice: true });
      expect(net + vat).toBe(gross);
    }
  });

  it('is free of binary floating point drift', () => {
    // 0.1 + 0.2 style inputs that break naive float arithmetic
    const a = calculateEntry({ amountCollected: 10, hasInvoice: true }); // ₪0.10
    const b = calculateEntry({ amountCollected: 20, hasInvoice: true }); // ₪0.20
    expect(Number.isInteger(a.commission)).toBe(true);
    expect(Number.isInteger(b.commission)).toBe(true);
  });

  it('exposes netOfVat and agentShare as the composable primitives', () => {
    expect(agentShare(netOfVat(118_000))).toBe(40_000);
  });
});

/* -------------------------------------------------------------------------- */
/* Totals                                                                      */
/* -------------------------------------------------------------------------- */

describe('calculateTotals', () => {
  const entries = [
    { amountCollected: 420_000, hasInvoice: true }, // payable 142_373
    { amountCollected: 360_000, hasInvoice: true }, // payable 122_034
    { amountCollected: 295_050, hasInvoice: false }, // earned but not payable
  ];

  it('counts properties and invoice coverage', () => {
    const totals = calculateTotals(entries);
    expect(totals.entryCount).toBe(3);
    expect(totals.invoicedCount).toBe(2);
    expect(totals.missingInvoiceCount).toBe(1);
  });

  it('sums the per-row rounded figures so the footer matches the column', () => {
    const totals = calculateTotals(entries);
    const perRow = entries.map((e) => calculateEntry(e));

    expect(totals.grossTotal).toBe(perRow.reduce((s, r) => s + r.gross, 0));
    expect(totals.netTotal).toBe(perRow.reduce((s, r) => s + r.net, 0));
    expect(totals.payableTotal).toBe(perRow.reduce((s, r) => s + r.payable, 0));
  });

  it('excludes uninvoiced rows from payable and reports them separately', () => {
    const totals = calculateTotals(entries);
    expect(totals.payableTotal).toBe(142_373 + 122_034);
    expect(totals.pendingInvoiceTotal).toBe(calculateEntry(entries[2]).commission);
    expect(totals.commissionTotal).toBe(totals.payableTotal + totals.pendingInvoiceTotal);
  });

  it('returns a zeroed shape for an empty report', () => {
    const totals = calculateTotals([]);
    expect(totals.entryCount).toBe(0);
    expect(totals.payableTotal).toBe(0);
    expect(totals.grossTotal).toBe(0);
  });

  it('aggregates agent totals into a consolidated total', () => {
    const a = calculateTotals(entries);
    const b = calculateTotals([{ amountCollected: 118_000, hasInvoice: true }]);
    const combined = sumTotals([a, b]);

    expect(combined.entryCount).toBe(4);
    expect(combined.payableTotal).toBe(a.payableTotal + b.payableTotal);
    expect(combined.payableTotal).toBe(calculateTotals([...entries, { amountCollected: 118_000, hasInvoice: true }]).payableTotal);
  });
});

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

describe('formatILS', () => {
  it('always renders two decimals with the shekel sign', () => {
    expect(formatILS(0)).toMatch(/0\.00/);
    expect(formatILS(142_373)).toMatch(/1,423\.73/);
    expect(formatILS(100)).toMatch(/1\.00/);
  });
});
