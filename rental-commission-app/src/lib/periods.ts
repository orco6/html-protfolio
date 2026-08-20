/** Calendar-month helpers. A "period" is always {year, month} with month 1-12. */

export interface Period {
  year: number;
  month: number;
}

export const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
] as const;

export const MIN_YEAR = 2020;

export function currentPeriod(): Period {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function isValidPeriod(period: Partial<Period> | null | undefined): period is Period {
  if (!period) return false;
  const { year, month } = period;
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    (year as number) >= MIN_YEAR &&
    (year as number) <= 2200 &&
    (month as number) >= 1 &&
    (month as number) <= 12
  );
}

/** Parses `?year=&month=`, falling back to the current month when absent or bogus. */
export function parsePeriod(
  year: string | string[] | undefined,
  month: string | string[] | undefined,
): Period {
  const y = Number(Array.isArray(year) ? year[0] : year);
  const m = Number(Array.isArray(month) ? month[0] : month);
  const candidate = { year: y, month: m };
  return isValidPeriod(candidate) ? candidate : currentPeriod();
}

export function periodLabel({ year, month }: Period): string {
  return `${HEBREW_MONTHS[month - 1]} ${year}`;
}

export function shortPeriodLabel({ year, month }: Period): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

export function shiftPeriod({ year, month }: Period, delta: number): Period {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

export function periodsEqual(a: Period, b: Period): boolean {
  return a.year === b.year && a.month === b.month;
}

export function comparePeriods(a: Period, b: Period): number {
  return a.year - b.year || a.month - b.month;
}

export function periodKey({ year, month }: Period): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Years offered in the year picker: from MIN_YEAR through next year. */
export function selectableYears(): number[] {
  const upper = currentPeriod().year + 1;
  const years: number[] = [];
  for (let y = upper; y >= MIN_YEAR; y -= 1) years.push(y);
  return years;
}

export function isFuturePeriod(period: Period): boolean {
  return comparePeriods(period, currentPeriod()) > 0;
}
