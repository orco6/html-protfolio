import { TableSkeleton } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="טוען סוכנים">
      <span className="sr-only">טוען סוכנים…</span>
      <TableSkeleton rows={3} />
      <TableSkeleton rows={7} />
    </div>
  );
}
