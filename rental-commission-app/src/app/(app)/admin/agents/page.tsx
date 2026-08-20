import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth';
import { listAgents } from '@/lib/agents';
import { PageHeader } from '@/components/ui';
import { AgentsManager } from './agents-manager';

export const metadata: Metadata = { title: 'ניהול סוכנים' };
export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const admin = await requireAdmin();
  const agents = await listAgents(admin.id);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="ניהול סוכנים"
        subtitle="הוספת סוכנים חדשים והשבתה של סוכנים שאינם פעילים. היסטוריית הדיווחים נשמרת תמיד."
      />
      <AgentsManager agents={agents} />
    </div>
  );
}
