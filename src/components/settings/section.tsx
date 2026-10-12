import { cn } from '@/lib/utils'

/** Bloque de una página de Ajustes: título corto y su contenido (listas, tablas, formularios propios). */
export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn('mb-10', className)}>
      <div className="mb-3 flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description ? <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-fg-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
