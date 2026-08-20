import { requireUser } from '@/lib/auth';
import { AppShell, type NavItem } from '@/components/app-shell';

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'סקירה חודשית', icon: 'dashboard' },
  { href: '/admin/agents', label: 'ניהול סוכנים', icon: 'users' },
];

const AGENT_NAV: NavItem[] = [{ href: '/report', label: 'הדיווח שלי', icon: 'report' }];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell
      user={{ fullName: user.fullName, role: user.role }}
      navItems={user.role === 'admin' ? ADMIN_NAV : AGENT_NAV}
    >
      {children}
    </AppShell>
  );
}
