import { Skeleton } from '@/components/ui/skeleton'

// Se muestra al instante al navegar mientras el servidor prepara la vista.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12" aria-busy>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-7 w-72" />
      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12 w-2/3" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9 w-3/4" />
        </div>
      </div>
    </div>
  )
}
