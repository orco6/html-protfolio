import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAgent } from '@/lib/auth';
import { getAgentReport } from '@/lib/reports';
import { parsePeriod, periodLabel, currentPeriod, periodsEqual, isFuturePeriod } from '@/lib/periods';
import { Callout, PageHeader, linkButtonClass } from '@/components/ui';
import { PrintIcon } from '@/components/icons';
import { MonthPicker } from '@/components/month-picker';
import { ReportWorkspace } from '@/components/report-workspace';
import type { ClientEntry } from '@/components/entries-table';

export const metadata: Metadata = { title: 'הדיווח שלי' };
export const dynamic = 'force-dynamic';

export default async function AgentReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAgent();
  const params = await searchParams;
  const period = parsePeriod(params.year, params.month);

  const report = await getAgentReport(user.id, user.id, period);

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

  const isCurrent = periodsEqual(period, currentPeriod());
  const printHref = `/print/my-report?year=${period.year}&month=${period.month}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="הדיווח החודשי שלי"
        subtitle={
          <>
            {user.fullName} · {periodLabel(period)}
            {!isCurrent ? <span className="text-ink-faint"> · צפייה בחודש קודם</span> : null}
          </>
        }
        actions={
          <Link href={printHref} target="_blank" rel="noreferrer" className={linkButtonClass('secondary', 'sm')}>
            <PrintIcon className="size-[18px]" />
            הדפסת הדיווח
          </Link>
        }
      />

      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 no-print">
        <MonthPicker period={period} />
        <p className="text-[12.5px] text-ink-muted">
          הנתונים נשמרים בשרת ונשארים זמינים בכל כניסה.
        </p>
      </div>

      {isFuturePeriod(period) ? (
        <Callout tone="pending">
          נבחר חודש עתידי. אפשר להזין נתונים מראש, אך שימו לב שהדיווח שייך ל{periodLabel(period)}.
        </Callout>
      ) : null}

      <ReportWorkspace
        key={`${period.year}-${period.month}`}
        initialEntries={entries}
        period={period}
        duplicateScope="agent"
        editable
      />
    </div>
  );
}
