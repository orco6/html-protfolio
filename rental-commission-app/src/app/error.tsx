'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui';
import { AlertIcon } from '@/components/icons';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('unhandled application error', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <AlertIcon className="size-9 text-conflict-600" />
      <div>
        <h1 className="text-[22px] font-semibold">אירעה שגיאה בלתי צפויה</h1>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-muted">
          לא הצלחנו לטעון את המסך. אפשר לנסות שוב; אם התקלה חוזרת, יש לפנות למנהל המערכת.
        </p>
      </div>
      <Button type="button" variant="primary" onClick={reset}>
        ניסיון חוזר
      </Button>
    </main>
  );
}
