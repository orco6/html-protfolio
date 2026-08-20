import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/lib/auth';
import { getAgent } from '@/lib/agents';
import { getAgentActivePeriods, getAgentReport } from '@/lib/reports';
import { parsePeriod, periodLabel, shortPeriodLabel } from '@/lib/periods';
import { Badge, PageHeader, cx, linkButtonClass } from '@/components/ui';
import { PrevIcon, PrintIcon } from '@/components/icons';
import { MonthPicker } from '@/components/month-picker';
import { ReportWorkspace } from '@/components/report-workspace';
import type { ClientEntry } from '@/components/entries-table';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const admin = await requireAdmin();
  const { id } = await params;
  const agent = await getAgent(admin.id, id);
  return { title: agent ? `דיווח ${agent.fullName}` : 'סוכן' };
}

export default async function AdminAgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const period = parsePeriod(query.year, query.month);

  const agent = await getAgent(admin.id, id);
  if (!agent) notFound();

  const [report, activePeriods] = await Promise.all([
    getAgentReport(admin.id, agent.id, period),
    getAgentActivePeriods(admin.id, agent.id),
  ]);

  const entries: ClientEntry[] = report.entries.map((entry) => ({
    id: entry.id,
    agentId: entry.agentId,
    propertyAddress: entry.propertyAddress,
    amountCollected: entry.amountCollected,
    hasInvoice: entry.hasInvoice,
    invoiceNumber: entry.invoiceNumber,
    addressKey: entry.addressKey,
    invoiceKey: entry.invoiceKey,
  }));

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/admin?year=${period.year}&month=${period.month}`}
        className="no-print inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"
      >
        <PrevIcon className="size-3.5" />
        חזרה לסקירה החודשית
      </Link>

      <PageHeader
        title={agent.fullName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span dir="ltr">{agent.email}</span>
            <span className="text-ink-faint">·</span>
            <span>{periodLabel(period)}</span>
            {agent.isActive ? (
              <Badge tone="payable">פעיל</Badge>
            ) : (
              <Badge tone="neutral">לא פעיל</Badge>
            )}
          </span>
        }
        actions={
          <Link
            href={`/print/agent/${agent.id}?year=${period.year}&month=${period.month}`}
            target="_blank"
            rel="noreferrer"
            className={linkButtonClass('secondary', 'sm')}
          >
            <PrintIcon className="size-[18px]" />
            הדפסת דיווח הסוכן
          </Link>
        }
      />

      <div className="card flex flex-col gap-3 px-4 py-3 sm:px-5 no-print">
        <MonthPicker period={period} />
        {activePeriods.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
            <span className="text-[12.5px] text-ink-muted">חודשים עם דיווח:</span>
            {activePeriods.slice(0, 14).map((p) => {
              const selected = p.year === period.year && p.month === period.month;
              return (
                <Link
                  key={`${p.year}-${p.month}`}
                  prefetch={false}
                  href={`/admin/agents/${agent.id}?year=${p.year}&month=${p.month}`}
                  className={cx(
                    'tnum rounded-md border px-2 py-0.5 text-[12px] font-medium transition-colors',
                    selected
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {shortPeriodLabel(p)}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      <ReportWorkspace
        key={`${agent.id}-${period.year}-${period.month}`}
        initialEntries={entries}
        period={period}
        editable={false}
        duplicateScope="admin"
        agentNames={{ [agent.id]: agent.fullName }}
      />
    </div>
  );
}
