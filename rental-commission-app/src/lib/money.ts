/**
 * Money is handled exclusively as an integer number of agorot (1/100 ILS).
 * No monetary value is ever kept in a float, so no rounding drift can build up
 * across a month's worth of rows.
 */

export type Agorot = number;

/** Rounds a rational quotient half-away-from-zero, staying in integer space. */
function divideRound(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    throw new Error('divideRound: invalid operands');
  }
  const sign = numerator < 0 !== denominator < 0 ? -1 : 1;
  const a = Math.abs(numerator);
  const b = Math.abs(denominator);
  return sign * Math.floor((2 * a + b) / (2 * b));
}

export const round = divideRound;

/** Multiplies an agorot amount by the rational number `num/den`. */
export function scale(amount: Agorot, num: number, den: number): Agorot {
  return divideRound(amount * num, den);
}

/** Either an ungrouped number, or one grouped in proper thousands. */
const AMOUNT_PATTERN = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

/**
 * Parses user input ("1,250.50", "₪1250", "1250") into agorot.
 * Returns null for anything that is not a clean non-negative amount.
 *
 * Comma handling is deliberately strict: "1,250" is one thousand two hundred
 * and fifty, while "1,5" and "12," are rejected outright rather than silently
 * reinterpreted — a typo must never turn into a wrong payout.
 */
export function parseAmountToAgorot(input: string | number | null | undefined): Agorot | null {
  if (input === null || input === undefined) return null;

  // Strip currency sign, bidi marks and whitespace, but keep separators intact.
  const raw = String(input)
    .replace(/[‎‏\s₪]/g, '')
    .replace(/^\+/, '');

  if (raw === '' || !AMOUNT_PATTERN.test(raw)) return null;

  const [whole, fraction = ''] = raw.replace(/,/g, '').split('.');
  const agorot = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(agorot) ? agorot : null;
}

/** Converts a `numeric(12,2)` value coming back from PostgreSQL into agorot. */
export function numericToAgorot(value: string | number): Agorot {
  const parsed = parseAmountToAgorot(value);
  if (parsed === null) throw new Error(`numericToAgorot: unparsable value ${String(value)}`);
  return parsed;
}

/** Converts agorot back into the decimal string PostgreSQL expects. */
export function agorotToNumeric(agorot: Agorot): string {
  const sign = agorot < 0 ? '-' : '';
  const abs = Math.abs(agorot);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const plainFormatter = new Intl.NumberFormat('he-IL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * "₪1,250.50".
 *
 * Intl's own ILS output embeds right-to-left marks around the sign, which the
 * bidi algorithm then reorders unpredictably once the string is dropped into a
 * left-to-right numeric column inside a right-to-left page. Composing the
 * string by hand keeps the sign glued to the front of the digits everywhere —
 * on screen, in a table column and on paper.
 */
export function formatILS(agorot: Agorot): string {
  const sign = agorot < 0 ? '-' : '';
  return `${sign}₪${plainFormatter.format(Math.abs(agorot) / 100)}`;
}

/** "1,250.50" — for table cells that carry their own currency column header. */
export function formatAmount(agorot: Agorot): string {
  return plainFormatter.format(agorot / 100);
}

/** "1250.50" — for populating an <input type="text"> during editing. */
export function toInputValue(agorot: Agorot): string {
  return agorotToNumeric(agorot);
}
