/**
 * The single source of truth for every monetary rule in the product.
 *
 * Business rule
 * -------------
 * The agency collects a management fee from the property owner. That figure
 * is VAT-inclusive. To find what the agent is owed:
 *
 *   1. strip 18% VAT      →  net = gross / 1.18
 *   2. the agent's share  →  commission = net * 40%
 *
 * A row with no invoice is still reported (the property was managed), but it
 * contributes nothing payable until an invoice exists.
 *
 * All arithmetic runs on integer agorot; see lib/money.ts.
 */

import { scale, type Agorot } from './money';

/** VAT rate expressed as a rational number, so it never becomes a float. */
export const VAT_RATE = { num: 18, den: 100 } as const;

/** The agent's share of the net (VAT-exclusive) fee. */
export const AGENT_SHARE = { num: 40, den: 100 } as const;

export const VAT_PERCENT_LABEL = '18%';
export const AGENT_SHARE_PERCENT_LABEL = '40%';

export interface CommissionInput {
  /** Management fee collected, VAT included, in agorot. */
  amountCollected: Agorot;
  hasInvoice: boolean;
}

export interface CommissionBreakdown {
  /** Gross fee collected, VAT included. */
  gross: Agorot;
  /** Fee excluding VAT. */
  net: Agorot;
  /** The VAT portion (gross − net). */
  vat: Agorot;
  /** 40% of net — what the agent earned on paper. */
  commission: Agorot;
  /** The commission actually payable this month (zero without an invoice). */
  payable: Agorot;
}

/**
 * net = gross / 1.18, i.e. gross * 100 / 118.
 * Rounded to the nearest agora so the displayed net and the arithmetic agree.
 */
export function netOfVat(gross: Agorot): Agorot {
  return scale(gross, VAT_RATE.den, VAT_RATE.den + VAT_RATE.num);
}

/** 40% of the VAT-exclusive amount. */
export function agentShare(net: Agorot): Agorot {
  return scale(net, AGENT_SHARE.num, AGENT_SHARE.den);
}

export function calculateEntry({ amountCollected, hasInvoice }: CommissionInput): CommissionBreakdown {
  const gross = amountCollected;
  const net = netOfVat(gross);
  const commission = agentShare(net);

  return {
    gross,
    net,
    vat: gross - net,
    commission,
    payable: hasInvoice ? commission : 0,
  };
}

export interface CommissionTotals {
  /** Number of properties reported, invoiced or not. */
  entryCount: number;
  /** Rows that carry an invoice. */
  invoicedCount: number;
  /** Rows still missing an invoice. */
  missingInvoiceCount: number;
  grossTotal: Agorot;
  netTotal: Agorot;
  vatTotal: Agorot;
  /** Commission earned across every row, ignoring invoice status. */
  commissionTotal: Agorot;
  /** Commission actually payable — invoiced rows only. This is what gets paid. */
  payableTotal: Agorot;
  /** Commission blocked purely by a missing invoice. */
  pendingInvoiceTotal: Agorot;
}

export const EMPTY_TOTALS: CommissionTotals = {
  entryCount: 0,
  invoicedCount: 0,
  missingInvoiceCount: 0,
  grossTotal: 0,
  netTotal: 0,
  vatTotal: 0,
  commissionTotal: 0,
  payableTotal: 0,
  pendingInvoiceTotal: 0,
};

/**
 * Totals are summed from the per-row rounded figures, so the footer of a
 * printed report always equals the column above it to the agora.
 */
export function calculateTotals(entries: readonly CommissionInput[]): CommissionTotals {
  return entries.reduce<CommissionTotals>((acc, entry) => {
    const row = calculateEntry(entry);
    return {
      entryCount: acc.entryCount + 1,
      invoicedCount: acc.invoicedCount + (entry.hasInvoice ? 1 : 0),
      missingInvoiceCount: acc.missingInvoiceCount + (entry.hasInvoice ? 0 : 1),
      grossTotal: acc.grossTotal + row.gross,
      netTotal: acc.netTotal + row.net,
      vatTotal: acc.vatTotal + row.vat,
      commissionTotal: acc.commissionTotal + row.commission,
      payableTotal: acc.payableTotal + row.payable,
      pendingInvoiceTotal: acc.pendingInvoiceTotal + (entry.hasInvoice ? 0 : row.commission),
    };
  }, { ...EMPTY_TOTALS });
}

export function sumTotals(groups: readonly CommissionTotals[]): CommissionTotals {
  return groups.reduce<CommissionTotals>((acc, g) => ({
    entryCount: acc.entryCount + g.entryCount,
    invoicedCount: acc.invoicedCount + g.invoicedCount,
    missingInvoiceCount: acc.missingInvoiceCount + g.missingInvoiceCount,
    grossTotal: acc.grossTotal + g.grossTotal,
    netTotal: acc.netTotal + g.netTotal,
    vatTotal: acc.vatTotal + g.vatTotal,
    commissionTotal: acc.commissionTotal + g.commissionTotal,
    payableTotal: acc.payableTotal + g.payableTotal,
    pendingInvoiceTotal: acc.pendingInvoiceTotal + g.pendingInvoiceTotal,
  }), { ...EMPTY_TOTALS });
}
