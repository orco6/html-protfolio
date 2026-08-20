'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { Button, cx } from './ui';
import { BrandMark, DashboardIcon, LogoutIcon, MenuIcon, CloseIcon, ReportIcon, UsersIcon } from './icons';
import { logoutAction } from '@/app/logout/actions';

export interface NavItem {
  href: string;
  label: string;
  icon: 'dashboard' | 'report' | 'users';
}

const ICONS = {
  dashboard: DashboardIcon,
  report: ReportIcon,
  users: UsersIcon,
} as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors duration-150',
              active
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-soft hover:bg-canvas hover:text-ink',
            )}
          >
            <Icon className="size-[18px] shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
}

export function AppShell({
  user,
  navItems,
  children,
}: {
  user: { fullName: string; role: 'admin' | 'agent' };
  navItems: NavItem[];
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const roleLabel = user.role === 'admin' ? 'מנהל מערכת' : 'סוכן';

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-white"
      >
        דילוג לתוכן הראשי
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-sm no-print">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
          <Link href={user.role === 'admin' ? '/admin' : '/report'} className="flex shrink-0 items-center gap-2.5">
            <BrandMark className="size-8" />
            <span className="hidden text-[15px] font-semibold text-ink sm:inline">ניהול עמלות סוכנים</span>
          </Link>

          <nav aria-label="ניווט ראשי" className="mx-2 hidden items-center gap-1 md:flex">
            <NavLinks items={navItems} />
          </nav>

          <div className="me-auto" />

          <div className="hidden items-center gap-3 md:flex">
            <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-sunken py-1.5 pe-3 ps-1.5">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-md bg-brand-900 text-[12px] font-semibold text-white"
              >
                {initials(user.fullName)}
              </span>
              <span className="leading-tight">
                <span className="block text-[13px] font-medium text-ink">{user.fullName}</span>
                <span className="block text-[11.5px] text-ink-muted">{roleLabel}</span>
              </span>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm" aria-label="יציאה מהמערכת">
                <LogoutIcon className="size-[18px]" />
                <span>יציאה</span>
              </Button>
            </form>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'סגירת תפריט' : 'פתיחת תפריט'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </Button>
        </div>

        {menuOpen ? (
          <div id="mobile-nav" className="border-t border-line bg-surface px-4 pb-4 pt-3 md:hidden animate-fade-in">
            <div className="mb-3 flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2.5">
              <span className="leading-tight">
                <span className="block text-[13.5px] font-medium text-ink">{user.fullName}</span>
                <span className="block text-[12px] text-ink-muted">{roleLabel}</span>
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="סגירת תפריט"
                className="rounded-md p-1.5 text-ink-muted hover:bg-line/50"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>
            <nav aria-label="ניווט ראשי" className="flex flex-col gap-1">
              <NavLinks items={navItems} onNavigate={() => setMenuOpen(false)} />
            </nav>
            <form action={logoutAction} className="mt-3">
              <Button type="submit" variant="secondary" size="sm" className="w-full">
                <LogoutIcon className="size-[18px]" />
                יציאה מהמערכת
              </Button>
            </form>
          </div>
        ) : null}
      </header>

      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="no-print border-t border-line py-5 text-center text-[12px] text-ink-faint">
        מערכת ניהול עמלות סוכני השכרה
      </footer>
    </div>
  );
}
