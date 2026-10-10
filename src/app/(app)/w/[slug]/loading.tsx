import { Skeleton } from '@/components/ui/skeleton'

export default function WorkspaceLoading() {
  return (
    <div className="flex flex-col gap-2 px-4 py-4 sm:px-6" aria-busy>
      <Skeleton className="h-7 w-80" />
      <div className="mt-3 flex flex-col gap-1.5">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    </div>
  )
}
