import { formatAmount, formatILS } from '@/lib/money';
import {
  AGENT_SHARE_PERCENT_LABEL,
  VAT_PERCENT_LABEL,
  calculateEntry,
  type CommissionTotals,
} from '@/lib/commission';
import { periodLabel, type Period } from '@/lib/periods';
import type { ReportEntry } from '@/lib/reports';
import { cx } from './ui';

/* -------------------------------------------------------------------------- */
/* Document header                                                             */
/* -------------------------------------------------------------------------- */

export function PrintHeader({
  title,
  subject,
  period,
}: {
  title: string;
  subject: string;
  period: Period;
}) {
  const printedAt = new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  return (
    <header className="mb-6 border-b-2 border-ink pb-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wider text-ink-muted">
            ניהול עמלות סוכני השכרה
          </p>
          <h1 className="mt-1 text-[22px] font-bold leading-tight">{title}</h1>
          <p className="mt-1 text-[15px] text-ink-soft">{subject}</p>
        </div>
        <div className="text-end">
          <p className="text-[12px] text-ink-muted">חודש דיווח</p>
          <p className="text-[17px] font-semibold">{periodLabel(period)}</p>
          <p className="mt-2 text-[11px] text-ink-faint">הופק ב־{printedAt}</p>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Entry table                                                                 */
/* -------------------------------------------------------------------------- */

const PTH = 'border border-line-strong bg-surface-sunken px-2.5 py-2 text-start text-[11.5px] font-semibold';
const PTD = 'border border-line px-2.5 py-1.5 text-[12.5px] align-top';

export function PrintEntriesTable({ entries }: { entries: readonly ReportEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-ink-muted">
        לא דווחו נכסים בחודש זה.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th scope="col" className={cx(PTH, 'w-8 text-center')}>
            #
          </th>
          <th scope="col" className={PTH}>
            כתובת הנכס
          </th>
          <th scope="col" className={cx(PTH, 'w-24')}>
            נגבה (₪)
          </th>
          <th scope="col" className={cx(PTH, 'w-16 text-center')}>
            חשבונית
          </th>
          <th scope="col" className={cx(PTH, 'w-24')}>
            מס׳ חשבונית
          </th>
          <th scope="col" className={cx(PTH, 'w-24')}>
            ללא מע״מ (₪)
          </th>
          <th scope="col" className={cx(PTH, 'w-24')}>
            עמלה (₪)
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, index) => {
          const row = calculateEntry(entry);
          return (
            <tr key={entry.id}>
              <td className={cx(PTD, 'tnum text-center text-ink-muted')}>{index + 1}</td>
              <td className={PTD}>{entry.propertyAddress}</td>
              <td className={cx(PTD, 'tnum')}>{formatAmount(entry.amountCollected)}</td>
              <td className={cx(PTD, 'text-center')}>{entry.hasInvoice ? 'כן' : 'לא'}</td>
              <td className={cx(PTD, 'tnum')}>{entry.invoiceNumber ?? '—'}</td>
              <td className={cx(PTD, 'tnum')}>{formatAmount(row.net)}</td>
              <td className={cx(PTD, 'tnum font-semibold')}>
                {row.payable > 0 ? formatAmount(row.payable) : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */
/* Settlement summary                                                          */
/* -------------------------------------------------------------------------- */

export function PrintSummary({ totals }: { totals: CommissionTotals }) {
  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: 'מספר נכסים שדווחו', value: String(totals.entryCount) },
    { label: 'נכסים עם חשבונית', value: String(totals.invoicedCount) },
    { label: 'סך שנגבה (כולל מע״מ)', value: formatILS(totals.grossTotal) },
    { label: `מע״מ ${VAT_PERCENT_LABEL}`, value: `−${formatILS(totals.vatTotal)}` },
    { label: 'סכום ללא מע״מ', value: formatILS(totals.netTotal) },
    { label: `עמלת סוכן ${AGENT_SHARE_PERCENT_LABEL}`, value: formatILS(totals.commissionTotal) },
  ];

  if (totals.pendingInvoiceTotal > 0) {
    rows.push({
      label: 'לא לתשלום – חסרה חשבונית',
      value: `−${formatILS(totals.pendingInvoiceTotal)}`,
    });
  }

  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 text-[14px] font-semibold">סיכום לתשלום</h2>
      <table className="w-full max-w-[420px] border-collapse ms-auto">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="border border-line px-2.5 py-1.5 text-[12.5px] text-ink-soft">{row.label}</td>
              <td className="tnum border border-line px-2.5 py-1.5 text-[12.5px] font-medium">{row.value}</td>
            </tr>
          ))}
          <tr>
            <td className="border border-ink bg-surface-sunken px-2.5 py-2 text-[13.5px] font-bold">
              סה״כ עמלה לתשלום
            </td>
            <td className="tnum border border-ink bg-surface-sunken px-2.5 py-2 text-[14px] font-bold">
              {formatILS(totals.payableTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        אופן החישוב: מהסכום שנגבה מנוכה מע״מ בשיעור {VAT_PERCENT_LABEL}, ומהסכום ללא מע״מ מחושבת עמלת
        הסוכן בשיעור {AGENT_SHARE_PERCENT_LABEL}. שורה ללא חשבונית אינה נכללת בסכום לתשלום.
      </p>
    </section>
  );
}

export function PrintSignature() {
  return (
    <section className="mt-10 grid grid-cols-2 gap-10 break-inside-avoid text-[12px]">
      {['חתימת הסוכן', 'אישור הנהלה'].map((label) => (
        <div key={label}>
          <div className="h-10 border-b border-ink" />
          <p className="mt-1 text-ink-muted">{label}</p>
        </div>
      ))}
    </section>
  );
}
