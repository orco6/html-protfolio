'use client';

import { useEffect } from 'react';

import { Button } from './ui';
import { PrintIcon } from './icons';

/**
 * The on-screen bar above a print document. It is `no-print`, so the paper
 * output starts at the report header itself.
 */
export function PrintChrome() {
  useEffect(() => {
    // Nudge the browser toward background colours on this document only.
    document.documentElement.style.setProperty('print-color-adjust', 'exact');
  }, []);

  return (
    <div className="no-print sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[820px] items-center justify-between gap-3 px-5 py-3">
        <p className="text-[13px] text-ink-muted">תצוגת הדפסה</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => window.close()}>
            סגירה
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => window.print()}>
            <PrintIcon className="size-[18px]" />
            הדפסה
          </Button>
        </div>
      </div>
    </div>
  );
}
