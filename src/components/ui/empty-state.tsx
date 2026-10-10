import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 px-1 py-10', className)}>
      {icon ? <div className="text-fg-subtle [&_svg]:size-5">{icon}</div> : null}
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-md font-medium text-fg">{title}</p>
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
