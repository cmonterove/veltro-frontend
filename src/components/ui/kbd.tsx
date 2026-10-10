import { cn } from '@/lib/utils'

export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-canvas px-1 font-sans text-2xs font-medium text-fg-subtle',
        className,
      )}
      {...props}
    />
  )
}
