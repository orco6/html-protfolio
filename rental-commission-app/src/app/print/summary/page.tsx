import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth';
import { getAdminMonthOverview } from '@/lib/reports';
import { parsePeriod, periodLabel } from '@/lib/periods';
import { formatAmount, formatILS } from '@/lib/money';
import { AGENT_SHARE_PERCENT_LABEL, VAT_PERCENT_LABEL } from '@/lib/commission';
import { PrintHeader } from '@/components/print-report';
import { cx } from '@/components/ui';

export const metadata: Metadata = { title: 'דוח מרכז חודשי' };
export const dynamic = 'force-dynamic';

const TH = 'border border-line-strong bg-surface-sunken px-2.5 py-2 text-start text-[11.5px] font-semibold';
const TD = 'border border-line px-2.5 py-1.5 text-[12.5px]';

export default async function ConsolidatedPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const period = parsePeriod(query.year, query.month);

  const overview = await getAdminMonthOverview(admin.id, period);
  const crossAgentGroups = overview.duplicateGroups.filter((group) => group.crossAgent);

  return (
    <article className="bg-white p-8 shadow-card print:p-0 print:shadow-none">
      <PrintHeader
        title="דוח מרכז – עמלות סוכנים"
        subject={`סיכום כלל הסוכנים · הופק על ידי ${admin.fullName}`}
        period={period}
      />

      <h2 className="mb-2 text-[14px] font-semibold">ריכוז לפי סוכן – {periodLabel(period)}</h2>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={cx(TH, 'w-8 text-center')}>#</th>
            <th scope="col" className={TH}>סוכן</th>
            <th scope="col" className={cx(TH, 'w-20 text-center')}>נכסים</th>
            <th scope="col" className={cx(TH, 'w-24 text-center')}>עם חשבונית</th>
            <th scope="col" className={cx(TH, 'w-24 text-center')}>ללא חשבונית</th>
            <th scope="col" className={cx(TH, 'w-28')}>נגבה (₪)</th>
            <th scope="col" className={cx(TH, 'w-28')}>ללא מע״מ (₪)</th>
            <th scope="col" className={cx(TH, 'w-28')}>לתשלום (₪)</th>
          </tr>
        </thead>
        <tbody>
          {overview.agents.map((agent, index) => (
            <tr key={agent.agentId}>
              <td className={cx(TD, 'tnum text-center text-ink-muted')}>{index + 1}</td>
              <td className={TD}>
                {agent.agentName}
                {!agent.isActive ? <span className="text-ink-muted"> (לא פעיל)</span> : null}
              </td>
              <td className={cx(TD, 'tnum text-center')}>{agent.totals.entryCount}</td>
              <td className={cx(TD, 'tnum text-center')}>{agent.totals.invoicedCount}</td>
              <td
                className={cx(
                  TD,
                  'tnum text-center',
                  agent.totals.missingInvoiceCount > 0 && 'font-semibold text-pending-700',
                )}
              >
                {agent.totals.missingInvoiceCount}
              </td>
              <td className={cx(TD, 'tnum')}>{formatAmount(agent.totals.grossTotal)}</td>
              <td className={cx(TD, 'tnum')}>{formatAmount(agent.totals.netTotal)}</td>
              <td className={cx(TD, 'tnum font-semibold')}>{formatAmount(agent.totals.payableTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={cx(TD, 'border-ink font-bold')} colSpan={2}>
              סה״כ
            </td>
            <td className={cx(TD, 'tnum border-ink text-center font-bold')}>
              {overview.grandTotals.entryCount}
            </td>
            <td className={cx(TD, 'tnum border-ink text-center font-bold')}>
              {overview.grandTotals.invoicedCount}
            </td>
            <td className={cx(TD, 'tnum border-ink text-center font-bold')}>
              {overview.grandTotals.missingInvoiceCount}
            </td>
            <td className={cx(TD, 'tnum border-ink font-bold')}>
              {formatAmount(overview.grandTotals.grossTotal)}
            </td>
            <td className={cx(TD, 'tnum border-ink font-bold')}>
              {formatAmount(overview.grandTotals.netTotal)}
            </td>
            <td className={cx(TD, 'tnum border-ink font-bold')}>
              {formatAmount(overview.grandTotals.payableTotal)}
            </td>
          </tr>
        </tfoot>
      </table>

      <section className="mt-6 break-inside-avoid">
        <h2 className="mb-2 text-[14px] font-semibold">סיכום כספי</h2>
        <table className="ms-auto w-full max-w-[420px] border-collapse">
          <tbody>
            <tr>
              <td className={cx(TD, 'text-ink-soft')}>סך שנגבה (כולל מע״מ)</td>
              <td className={cx(TD, 'tnum font-medium')}>{formatILS(overview.grandTotals.grossTotal)}</td>
            </tr>
            <tr>
              <td className={cx(TD, 'text-ink-soft')}>מע״מ {VAT_PERCENT_LABEL}</td>
              <td className={cx(TD, 'tnum font-medium')}>−{formatILS(overview.grandTotals.vatTotal)}</td>
            </tr>
            <tr>
              <td className={cx(TD, 'text-ink-soft')}>סכום ללא מע״מ</td>
              <td className={cx(TD, 'tnum font-medium')}>{formatILS(overview.grandTotals.netTotal)}</td>
            </tr>
            {overview.grandTotals.pendingInvoiceTotal > 0 ? (
              <tr>
                <td className={cx(TD, 'text-ink-soft')}>לא לתשלום – חסרה חשבונית</td>
                <td className={cx(TD, 'tnum font-medium')}>
                  −{formatILS(overview.grandTotals.pendingInvoiceTotal)}
                </td>
              </tr>
            ) : null}
            <tr>
              <td className="border border-ink bg-surface-sunken px-2.5 py-2 text-[13.5px] font-bold">
                סה״כ עמלות לתשלום
              </td>
              <td className="tnum border border-ink bg-surface-sunken px-2.5 py-2 text-[14px] font-bold">
                {formatILS(overview.grandTotals.payableTotal)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
          אופן החישוב: מהסכום שנגבה מנוכה מע״מ בשיעור {VAT_PERCENT_LABEL}, ומהסכום ללא מע״מ מחושבת
          עמלת הסוכן בשיעור {AGENT_SHARE_PERCENT_LABEL}. שורה ללא חשבונית אינה נכללת בסכום לתשלום.
        </p>
      </section>

      {crossAgentGroups.length > 0 ? (
        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-2 text-[14px] font-semibold">התראות על דיווחים כפולים בין סוכנים</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={cx(TH, 'w-28')}>סוג</th>
                <th scope="col" className={TH}>ערך</th>
                <th scope="col" className={TH}>סוכנים מעורבים</th>
              </tr>
            </thead>
            <tbody>
              {crossAgentGroups.map((group) => (
                <tr key={`${group.kind}-${group.key}`}>
                  <td className={TD}>{group.kind === 'address' ? 'כתובת זהה' : 'חשבונית זהה'}</td>
                  <td className={TD}>{group.label}</td>
                  <td className={TD}>{group.agentNames.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </article>
  );
}
