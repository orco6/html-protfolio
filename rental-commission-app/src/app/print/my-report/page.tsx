import type { Metadata } from 'next';

import { requireAgent } from '@/lib/auth';
import { getAgentReport } from '@/lib/reports';
import { parsePeriod, periodLabel } from '@/lib/periods';
import {
  PrintEntriesTable,
  PrintHeader,
  PrintSignature,
  PrintSummary,
} from '@/components/print-report';

export const metadata: Metadata = { title: 'הדפסת דיווח' };
export const dynamic = 'force-dynamic';

export default async function AgentPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAgent();
  const params = await searchParams;
  const period = parsePeriod(params.year, params.month);
  const report = await getAgentReport(user.id, user.id, period);

  return (
    <article className="bg-white p-8 shadow-card print:p-0 print:shadow-none">
      <PrintHeader
        title="דיווח נכסים חודשי"
        subject={`סוכן: ${user.fullName}`}
        period={period}
      />
      <h2 className="mb-2 text-[14px] font-semibold">פירוט נכסים – {periodLabel(period)}</h2>
      <PrintEntriesTable entries={report.entries} />
      <PrintSummary totals={report.totals} />
      <PrintSignature />
    </article>
  );
}
