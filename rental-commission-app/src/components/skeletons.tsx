/**
 * Route-level placeholders.
 *
 * Switching months is the most common navigation in the product, and it always
 * hits the database. Reserving the real layout — same strip, same table shape —
 * means the page never jumps when the data lands.
 */

function Shimmer({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-line ${className}`} aria-hidden />;
}

export function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2 bg-surface px-4 py-4 sm:px-5">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="h-6 w-32" />
          <Shimmer className="h-2.5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5">
        <Shimmer className="h-4 w-28" />
        <Shimmer className="h-3 w-16" />
      </div>
      <div className="divide-y divide-[var(--color-line)]">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4 sm:px-5">
            <Shimmer className="h-4 flex-1" />
            <Shimmer className="hidden h-4 w-24 sm:block" />
            <Shimmer className="hidden h-4 w-20 md:block" />
            <Shimmer className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="טוען נתונים">
      <span className="sr-only">טוען נתונים…</span>
      <div className="flex flex-col gap-2">
        <Shimmer className="h-7 w-56" />
        <Shimmer className="h-4 w-40" />
      </div>
      <div className="card px-4 py-3 sm:px-5">
        <Shimmer className="h-10 w-72" />
      </div>
      <SummarySkeleton />
      <TableSkeleton rows={rows} />
    </div>
  );
}
