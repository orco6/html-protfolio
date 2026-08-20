import Link from 'next/link';

import { linkButtonClass } from '@/components/ui';
import { BrandMark } from '@/components/icons';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <BrandMark className="size-10" />
      <div>
        <p className="tnum text-[13px] font-medium tracking-wide text-ink-faint">404</p>
        <h1 className="mt-1 text-[22px] font-semibold">הדף לא נמצא</h1>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-muted">
          ייתכן שהקישור אינו תקין, או שאין לך הרשאה לצפות בעמוד המבוקש.
        </p>
      </div>
      <Link href="/" className={linkButtonClass('primary', 'md')}>
        חזרה למסך הראשי
      </Link>
    </main>
  );
}
