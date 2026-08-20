import { requireUser } from '@/lib/auth';
import { PrintChrome } from '@/components/print-chrome';

/**
 * Print documents live outside the application shell: no navigation, no
 * editing affordances, nothing that would land on paper by accident.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <PrintChrome />
      <div className="mx-auto max-w-[820px] px-5 py-8 print:max-w-none print:px-0 print:py-0">
        {children}
      </div>
    </div>
  );
}
