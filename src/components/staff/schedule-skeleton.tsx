import { Skeleton } from '@/components/ui/primitives'

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading">
      <Skeleton className="h-10 w-64 rounded-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  )
}
