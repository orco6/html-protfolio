import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/lib/auth';
import { getAgent } from '@/lib/agents';
import { getAgentReport } from '@/lib/reports';
import { parsePeriod, periodLabel } from '@/lib/periods';
import {
  PrintEntriesTable,
  PrintHeader,
  PrintSignature,
  PrintSummary,
} from '@/components/print-report';

export const metadata: Metadata = { title: 'הדפסת דיווח סוכן' };
export const dynamic = 'force-dynamic';

export default async function AdminAgentPrintPage({
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

  const report = await getAgentReport(admin.id, agent.id, period);

  return (
    <article className="bg-white p-8 shadow-card print:p-0 print:shadow-none">
      <PrintHeader title="דיווח נכסים חודשי" subject={`סוכן: ${agent.fullName}`} period={period} />
      <h2 className="mb-2 text-[14px] font-semibold">פירוט נכסים – {periodLabel(period)}</h2>
      <PrintEntriesTable entries={report.entries} />
      <PrintSummary totals={report.totals} />
      <PrintSignature />
    </article>
  );
}
