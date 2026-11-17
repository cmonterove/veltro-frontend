import { CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICON_TONE = {
  /** lo normal: un vacío que invita a empezar */
  accent: 'bg-accent-soft text-accent-ink ring-accent/10',
  /** una búsqueda o un filtro que no dejó nada: sin color, no es un estado del producto */
  quiet: 'bg-hover text-fg-subtle ring-line-soft',
  danger: 'bg-danger-soft text-danger ring-danger/10',
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'accent',
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  tone?: keyof typeof ICON_TONE
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-start gap-4 px-1 py-10', className)}>
      {icon ? <div className={cn('flex size-11 items-center justify-center rounded-2xl ring-1 [&_svg]:size-5', ICON_TONE[tone])}>{icon}</div> : null}
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-base font-semibold tracking-[-0.01em] text-fg">{title}</p>
        {description ? <p className="text-sm leading-relaxed text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

/**
 * Un vacío que es buena noticia (nada vencido, nada suelto): se dice con un sello de «hecho»
 * en frambuesa, no con una línea gris que parece un error de carga.
 */
export function AllClear({ title, hint, children, className }: { title: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-done-soft text-done ring-4 ring-done-soft/40">
        <CheckCheck className="size-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{hint}</p> : null}
        {children}
      </div>
    </div>
  )
}

const GHOST_WIDTHS = ['w-[58%]', 'w-[42%]', 'w-[50%]']

/**
 * Lo que va a aparecer aquí, antes de que haya algo: filas fantasma con el ícono de cada cosa
 * (que se desvanecen) y una línea que dice cómo llega. Enseña la forma del contenido en vez de
 * dejar un hueco.
 */
export function GhostRows({ icons, children, action, className }: { icons: React.ReactNode[]; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-line-soft bg-panel/60 px-4 pb-4 pt-3.5', className)}>
      <ul aria-hidden className="flex flex-col gap-3 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]">
        {icons.map((icon, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar [&_svg]:size-3.5">{icon}</span>
            <span className={cn('h-2 rounded-full bg-line', GHOST_WIDTHS[i % GHOST_WIDTHS.length])} />
            <span className="ml-auto h-2 w-9 shrink-0 rounded-full bg-line-soft" />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{children}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
