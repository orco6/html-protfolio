import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAdmin } from '@/lib/auth';
import { getAdminMonthOverview } from '@/lib/reports';
import { parsePeriod, periodLabel } from '@/lib/periods';
import { formatAmount, formatILS } from '@/lib/money';
import { Badge, EmptyState, PageHeader, cx, linkButtonClass } from '@/components/ui';
import { PrintIcon, NextIcon } from '@/components/icons';
import { MonthPicker } from '@/components/month-picker';
import { SummaryStrip } from '@/components/summary';
import { DuplicatePanel } from '@/components/duplicate-panel';

export const metadata: Metadata = { title: 'סקירה חודשית' };
export const dynamic = 'force-dynamic';

const TH =
  'px-4 py-2.5 text-start text-[12px] font-semibold uppercase tracking-wide text-ink-muted';
const TD = 'px-4 py-3 align-middle text-[14px]';

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const period = parsePeriod(params.year, params.month);

  const overview = await getAdminMonthOverview(admin.id, period);
  const reportedAgents = overview.agents.filter((a) => a.totals.entryCount > 0);
  const pendingAgents = overview.agents.filter((a) => a.totals.entryCount === 0 && a.isActive);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="סקירה חודשית"
        subtitle={
          <>
            {periodLabel(period)} · <bdi className="tnum">{reportedAgents.length}</bdi> מתוך{' '}
            <bdi className="tnum">{overview.agents.length}</bdi> סוכנים דיווחו
          </>
        }
        actions={
          <Link
            href={`/print/summary?year=${period.year}&month=${period.month}`}
            target="_blank"
            rel="noreferrer"
            className={linkButtonClass('secondary', 'sm')}
          >
            <PrintIcon className="size-[18px]" />
            הדפסת דוח מרכז
          </Link>
        }
      />

      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 no-print">
        <MonthPicker period={period} />
        {pendingAgents.length > 0 ? (
          <p className="text-[12.5px] text-pending-700">
            טרם דיווחו: {pendingAgents.map((a) => a.agentName).join(', ')}
          </p>
        ) : (
          <p className="text-[12.5px] text-payable-700">כל הסוכנים הפעילים דיווחו החודש.</p>
        )}
      </div>

      <SummaryStrip totals={overview.grandTotals} />

      <DuplicatePanel
        scope="admin"
        groups={overview.duplicateGroups.map((group) => ({
          ...group,
          entries: group.entries.map((entry) => ({
            id: entry.id,
            agentId: entry.agentId,
            agentName: entry.agentName,
            propertyAddress: entry.propertyAddress,
            invoiceNumber: entry.invoiceNumber,
            amountCollected: entry.amountCollected,
          })),
        }))}
      />

      {/* ------------------------------------------------------------ agents */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-[15px] font-semibold">תוצאות לפי סוכן</h2>
          <p className="text-[13px] text-ink-muted">
            סה״כ לתשלום:{' '}
            <bdi className="tnum font-semibold text-payable-700">
              {formatILS(overview.grandTotals.payableTotal)}
            </bdi>
          </p>
        </div>

        {overview.agents.length === 0 ? (
          <EmptyState
            title="אין סוכנים במערכת"
            description="יש להוסיף סוכנים במסך ניהול הסוכנים כדי להתחיל לקבל דיווחים."
          />
        ) : (
          <>
            {/* desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[780px] border-collapse">
                <thead className="border-b border-line bg-surface-sunken">
                  <tr>
                    <th scope="col" className={TH}>
                      סוכן
                    </th>
                    <th scope="col" className={cx(TH, 'w-28')}>
                      נכסים
                    </th>
                    <th scope="col" className={cx(TH, 'w-32')}>
                      עם חשבונית
                    </th>
                    <th scope="col" className={cx(TH, 'w-36')}>
                      סך שנגבה
                    </th>
                    <th scope="col" className={cx(TH, 'w-36')}>
                      ללא מע״מ
                    </th>
                    <th scope="col" className={cx(TH, 'w-36')}>
                      עמלה לתשלום
                    </th>
                    <th scope="col" className={cx(TH, 'w-24 no-print')}>
                      <span className="sr-only">פעולות</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]">
                  {overview.agents.map((agent) => (
                    <tr key={agent.agentId} className="transition-colors hover:bg-surface-sunken">
                      <td className={TD}>
                        <Link
                          prefetch={false}
                          href={`/admin/agents/${agent.agentId}?year=${period.year}&month=${period.month}`}
                          className="font-medium text-ink hover:text-brand-600 hover:underline"
                        >
                          {agent.agentName}
                        </Link>
                        {!agent.isActive ? (
                          <Badge tone="neutral" className="ms-2">
                            לא פעיל
                          </Badge>
                        ) : null}
                        {agent.totals.entryCount === 0 ? (
                          <Badge tone="pending" className="ms-2">
                            טרם דיווח
                          </Badge>
                        ) : null}
                      </td>
                      <td className={cx(TD, 'tnum')}>{agent.totals.entryCount}</td>
                      <td className={cx(TD, 'tnum')}>
                        {agent.totals.invoicedCount}
                        {agent.totals.missingInvoiceCount > 0 ? (
                          <span className="ms-1.5 text-[12.5px] text-pending-700">
                            (<bdi className="tnum">{agent.totals.missingInvoiceCount}</bdi> חסרות)
                          </span>
                        ) : null}
                      </td>
                      <td className={cx(TD, 'tnum')}>{formatAmount(agent.totals.grossTotal)}</td>
                      <td className={cx(TD, 'tnum text-ink-soft')}>
                        {formatAmount(agent.totals.netTotal)}
                      </td>
                      <td
                        className={cx(
                          TD,
                          'tnum font-semibold',
                          agent.totals.payableTotal > 0 ? 'text-payable-700' : 'text-ink-faint',
                        )}
                      >
                        {formatAmount(agent.totals.payableTotal)}
                      </td>
                      <td className={cx(TD, 'no-print')}>
                        <Link
                          prefetch={false}
                          href={`/admin/agents/${agent.agentId}?year=${period.year}&month=${period.month}`}
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-brand-700"
                        >
                          פירוט
                          <NextIcon className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-line-strong bg-surface-sunken">
                  <tr>
                    <td className={cx(TD, 'font-semibold')}>סה״כ</td>
                    <td className={cx(TD, 'tnum font-semibold')}>
                      {overview.grandTotals.entryCount}
                    </td>
                    <td className={cx(TD, 'tnum font-semibold')}>
                      {overview.grandTotals.invoicedCount}
                    </td>
                    <td className={cx(TD, 'tnum font-semibold')}>
                      {formatAmount(overview.grandTotals.grossTotal)}
                    </td>
                    <td className={cx(TD, 'tnum font-semibold')}>
                      {formatAmount(overview.grandTotals.netTotal)}
                    </td>
                    <td className={cx(TD, 'tnum font-bold text-payable-700')}>
                      {formatAmount(overview.grandTotals.payableTotal)}
                    </td>
                    <td className="no-print" />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* mobile */}
            <ul className="divide-y divide-[var(--color-line)] md:hidden">
              {overview.agents.map((agent) => (
                <li key={agent.agentId}>
                  <Link
                    prefetch={false}
                    href={`/admin/agents/${agent.agentId}?year=${period.year}&month=${period.month}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-surface-sunken"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[15px] font-medium">
                        {agent.agentName}
                        {!agent.isActive ? <Badge tone="neutral">לא פעיל</Badge> : null}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-ink-muted">
                        <bdi className="tnum">{agent.totals.entryCount}</bdi> נכסים ·{' '}
                        <bdi className="tnum">{agent.totals.invoicedCount}</bdi> עם חשבונית
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p
                        className={cx(
                          'tnum text-[15px] font-semibold',
                          agent.totals.payableTotal > 0 ? 'text-payable-700' : 'text-ink-faint',
                        )}
                      >
                        {formatILS(agent.totals.payableTotal)}
                      </p>
                      <p className="text-[11.5px] text-ink-muted">לתשלום</p>
                    </div>
                    <NextIcon className="size-4 shrink-0 text-ink-faint" />
                  </Link>
                </li>
              ))}
              <li className="flex items-center justify-between bg-surface-sunken px-4 py-3.5">
                <span className="text-[14px] font-semibold">סה״כ לתשלום</span>
                <span className="tnum text-[16px] font-bold text-payable-700">
                  {formatILS(overview.grandTotals.payableTotal)}
                </span>
              </li>
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
