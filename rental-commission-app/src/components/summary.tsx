import { cx } from './ui';
import { formatILS } from '@/lib/money';
import { AGENT_SHARE_PERCENT_LABEL, VAT_PERCENT_LABEL, type CommissionTotals } from '@/lib/commission';

/**
 * The month's headline figures. Deliberately flat — four values on one strip,
 * no cards inside cards, with the payable amount carrying the only emphasis.
 */
export function SummaryStrip({
  totals,
  className,
  showPending = true,
}: {
  totals: CommissionTotals;
  className?: string;
  showPending?: boolean;
}) {
  // Every number embedded in a Hebrew sentence is isolated with <bdi> so the
  // bidi algorithm cannot reorder "18%" or "₪2,135.60" against its label.
  const num = (text: string) => <bdi className="tnum">{text}</bdi>;

  const items = [
    {
      label: 'נכסים שדווחו',
      value: String(totals.entryCount),
      hint:
        totals.missingInvoiceCount > 0 ? (
          <>
            {num(String(totals.invoicedCount))} עם חשבונית · {num(String(totals.missingInvoiceCount))} ללא
          </>
        ) : totals.entryCount > 0 ? (
          'כולם עם חשבונית'
        ) : (
          'טרם דווחו נכסים'
        ),
      tone: 'plain' as const,
    },
    {
      label: 'סך שנגבה (כולל מע״מ)',
      value: formatILS(totals.grossTotal),
      hint: (
        <>
          מע״מ {num(VAT_PERCENT_LABEL)} · {num(formatILS(totals.vatTotal))}
        </>
      ),
      tone: 'plain' as const,
    },
    {
      label: 'סכום ללא מע״מ',
      value: formatILS(totals.netTotal),
      hint: <>בסיס לחישוב עמלת {num(AGENT_SHARE_PERCENT_LABEL)}</>,
      tone: 'plain' as const,
    },
    {
      label: 'עמלה לתשלום',
      value: formatILS(totals.payableTotal),
      hint:
        showPending && totals.pendingInvoiceTotal > 0 ? (
          <>{num(formatILS(totals.pendingInvoiceTotal))} ממתין לחשבונית</>
        ) : (
          'שורות עם חשבונית בלבד'
        ),
      tone: totals.payableTotal > 0 ? ('payable' as const) : ('plain' as const),
    },
  ];

  return (
    <dl
      className={cx(
        'grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cx('flex flex-col gap-1 px-4 py-4 sm:px-5', item.tone === 'payable' ? 'bg-payable-50' : 'bg-surface')}
        >
          <dt className="text-[12.5px] font-medium text-ink-muted">{item.label}</dt>
          <dd
            className={cx(
              'tnum text-[20px] font-semibold leading-tight sm:text-[23px]',
              item.tone === 'payable' ? 'text-payable-700' : 'text-ink',
            )}
          >
            {item.value}
          </dd>
          <p
            className={cx(
              'text-[11.5px] leading-snug',
              item.tone === 'payable' ? 'text-payable-700/80' : 'text-ink-muted',
            )}
          >
            {item.hint}
          </p>
        </div>
      ))}
    </dl>
  );
}

/** Compact single-line total, used in admin drill-downs. */
export function TotalsLine({ totals }: { totals: CommissionTotals }) {
  return (
    <p className="text-[13.5px] text-ink-muted">
      <bdi className="tnum font-medium text-ink">{totals.entryCount}</bdi> נכסים ·{' '}
      <bdi className="tnum font-medium text-ink">{formatILS(totals.grossTotal)}</bdi> נגבו ·{' '}
      <bdi className="tnum font-semibold text-payable-700">{formatILS(totals.payableTotal)}</bdi> לתשלום
    </p>
  );
}
