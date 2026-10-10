import { cn } from '@/lib/utils'

export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('border-b border-line py-8 first:pt-0 last:border-0', className)}>
      <div className="mb-5 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-md font-semibold text-fg">{title}</h2>
          {description ? <p className="mt-1 max-w-xl text-sm text-fg-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
