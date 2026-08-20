'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Button, cx } from './ui';
import { NextIcon, PrevIcon } from './icons';
import {
  HEBREW_MONTHS,
  currentPeriod,
  periodsEqual,
  selectableYears,
  shiftPeriod,
  type Period,
} from '@/lib/periods';

/**
 * Month navigation. The URL is the single source of truth for the selected
 * period, so a month is linkable, bookmarkable and survives a refresh.
 */
export function MonthPicker({ period, className }: { period: Period; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const goTo = (next: Period) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('year', String(next.year));
    params.set('month', String(next.month));
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const atCurrentMonth = periodsEqual(period, currentPeriod());
  const selectClass =
    'h-10 rounded-lg border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink ' +
    'transition-colors hover:border-ink-faint focus:border-brand-500 focus:outline-none ' +
    'focus:ring-2 focus:ring-brand-500/25';

  return (
    <div
      className={cx('flex flex-wrap items-center gap-2', pending && 'opacity-70', className)}
      data-pending={pending || undefined}
    >
      {/* In RTL, "previous" sits on the right and its chevron points right. */}
      <Button
        type="button"
        size="sm"
        aria-label="חודש קודם"
        title="חודש קודם"
        className="size-10 p-0"
        onClick={() => goTo(shiftPeriod(period, -1))}
      >
        <PrevIcon className="size-[18px]" />
      </Button>

      <label className="sr-only" htmlFor="month-select">
        חודש
      </label>
      <select
        id="month-select"
        className={selectClass}
        value={period.month}
        onChange={(event) => goTo({ ...period, month: Number(event.target.value) })}
      >
        {HEBREW_MONTHS.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="year-select">
        שנה
      </label>
      <select
        id="year-select"
        className={cx(selectClass, 'tnum')}
        value={period.year}
        onChange={(event) => goTo({ ...period, year: Number(event.target.value) })}
      >
        {selectableYears().map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      <Button
        type="button"
        size="sm"
        aria-label="חודש הבא"
        title="חודש הבא"
        className="size-10 p-0"
        onClick={() => goTo(shiftPeriod(period, 1))}
      >
        <NextIcon className="size-[18px]" />
      </Button>

      {!atCurrentMonth ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => goTo(currentPeriod())}>
          חזרה לחודש הנוכחי
        </Button>
      ) : null}
    </div>
  );
}
