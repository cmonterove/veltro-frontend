import { Skeleton } from '@/components/ui/skeleton'

export default function DocLoading() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-[18px] pt-16 sm:px-[54px]" aria-busy>
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="mt-4 h-4 w-48" />
      <div className="mt-10 flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}
