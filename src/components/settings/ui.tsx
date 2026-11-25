'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, LayoutTemplate, LifeBuoy, Network, Users, UsersRound, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CoverBackdrop } from '@/components/app/cover'

/** El ícono de cada página de la cuenta, el mismo que tiene en el menú: la cabecera no queda en solo texto. */
const PAGE_ICON: Record<string, LucideIcon> = {
  '/settings/account': Building2,
  '/settings/members': Users,
  '/settings/org': Network,
  '/settings/teams': UsersRound,
  '/settings/templates': LayoutTemplate,
  '/settings/support': LifeBuoy,
}

/**
 * Encabezado de cada página de Ajustes, sobre su portada ciruela (la misma de tus ajustes): su ícono, qué es
 * y, opcionalmente, acciones y una fila debajo (pestañas, la barra de una vista). La portada baja más que el
 * encabezado y lo primero de la página se monta sobre su borde: tiene que ser una tarjeta con fondo. Con
 * `overlap={false}` la portada termina con el encabezado.
 */
export function SettingsHeader({
  title,
  description,
  leading,
  actions,
  children,
  overlap = true,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  /** marca o ícono a la izquierda del título (p. ej. el de un espacio); si falta, el de la página */
  leading?: React.ReactNode
  actions?: React.ReactNode
  /** pestañas u otra fila debajo del título */
  children?: React.ReactNode
  /** false: la portada no se mete debajo de lo que sigue (cuando arriba de la página no va una tarjeta) */
  overlap?: boolean
}) {
  const pathname = usePathname()
  const Icon = PAGE_ICON[pathname]
  return (
    <header className={cn('on-frame relative', overlap ? 'mb-4' : 'mb-9')}>
      {/* sobresale por los lados y arriba (en el margen de la hoja) y, abajo, queda debajo de lo primero de la página */}
      <CoverBackdrop className={cn('-inset-x-2.5 -top-4 sm:-inset-x-5 sm:-top-5', overlap ? '-bottom-[76px]' : '-bottom-5')} />
      <div className="flex items-center gap-4">
        {leading ? (
          <div className="shrink-0">{leading}</div>
        ) : Icon ? (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent-ink">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight tracking-[-0.015em] text-fg">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}

/** Pestañas de una página de Ajustes; cada una es un enlace (?tab=…) para poder compartirla. */
export function SettingsTabs({ tabs, active }: { tabs: { id: string; label: string; href: string; count?: number }[]; active: string }) {
  const t = useTranslations('settings')
  return (
    <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line scrollbar-none" aria-label={t('tabs')}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          scroll={false}
          aria-current={tab.id === active ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 text-sm outline-none transition-colors focus-visible:bg-hover focus-visible:text-fg',
            tab.id === active ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-muted hover:text-fg',
          )}
        >
          {tab.label}
          {tab.count ? <span className="rounded-full bg-hover px-1.5 text-2xs tabular-nums text-fg-muted">{tab.count}</span> : null}
        </Link>
      ))}
    </nav>
  )
}

/** Grupo de ajustes: título corto encima y las filas dentro de una tarjeta. */
export function SettingsCard({
  title,
  description,
  action,
  tone,
  inside = false,
  children,
  className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  tone?: 'danger'
  /** el título va adentro de la tarjeta, como su primera fila (cuando la tarjeta se monta sobre la portada) */
  inside?: boolean
  children: React.ReactNode
  className?: string
}) {
  if (inside) {
    return (
      <section className={cn('mb-8 divide-y divide-line-soft rounded-2xl bg-panel shadow-sheet ring-1 ring-line-soft', className)}>
        {title || action ? (
          <div className="flex items-end gap-4 px-5 pb-3 pt-4">
            <div className="min-w-0 flex-1">
              {title ? <h2 className={cn('text-sm font-semibold', tone === 'danger' ? 'text-danger' : 'text-fg')}>{title}</h2> : null}
              {description ? <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-fg-muted">{description}</p> : null}
            </div>
            {action}
          </div>
        ) : null}
        <div className="divide-y divide-line-soft">{children}</div>
      </section>
    )
  }
  return (
    <section className={cn('mb-8', className)}>
      {title || action ? (
        <div className="mb-3 flex items-end gap-4">
          <div className="min-w-0 flex-1">
            {title ? <h2 className={cn('text-sm font-semibold', tone === 'danger' ? 'text-danger' : 'text-fg')}>{title}</h2> : null}
            {description ? <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-fg-muted">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={cn('divide-y divide-line-soft rounded-xl border bg-panel', tone === 'danger' ? 'border-danger/30' : 'border-line')}>{children}</div>
    </section>
  )
}

/** Una fila: qué es a la izquierda (con su explicación) y el control a la derecha. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  align = 'center',
  children,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  htmlFor?: string
  /** start: para controles altos (textos largos, listas) */
  align?: 'center' | 'start'
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:gap-8', align === 'center' ? 'sm:items-center' : 'sm:items-start')}>
      <div className="min-w-0 sm:w-[38%] sm:shrink-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium text-fg">{label}</p>
        )}
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</p> : null}
      </div>
      <div className="flex min-w-0 flex-1 items-center sm:justify-end">{children}</div>
    </div>
  )
}

/**
 * Aparece al cambiar algo: un solo guardar por página o pestaña, siempre a la vista. `floating`: flota
 * sobre el panel (abajo al centro) sin empujar nada; en las páginas que caben en la pantalla, empujar
 * haría aparecer el scroll.
 */
export function SaveBar({
  dirty,
  pending,
  onSave,
  onDiscard,
  disabled,
  floating,
}: {
  dirty: boolean
  pending?: boolean
  onSave: () => void
  onDiscard: () => void
  disabled?: boolean
  floating?: boolean
}) {
  const t = useTranslations('settings.common')
  if (!dirty) return null
  return (
    <div
      className={cn(
        'popup-motion z-20 flex items-center gap-3 rounded-xl border border-line bg-panel/95 px-4 py-2.5 shadow-lift backdrop-blur-sm',
        floating ? 'absolute bottom-4 left-1/2 w-[min(34rem,calc(100%-2rem))] -translate-x-1/2' : 'sticky bottom-4 mt-2',
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-accent" />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{t('unsaved')}</span>
      <Button variant="ghost" size="sm" onClick={onDiscard} disabled={pending}>
        {t('discard')}
      </Button>
      <Button variant="primary" size="sm" onClick={onSave} loading={pending} disabled={disabled}>
        {t('save')}
      </Button>
    </div>
  )
}

/**
 * Una sola superficie partida en dos: lo que se edita a la izquierda y, a la derecha, una columna teñida
 * con la vista previa y lo que ayuda a entender. Llena el alto que le queda a la página (sin scroll de
 * página: si algo crece, se desplaza adentro de su lado). En pantallas angostas, la columna va debajo.
 */
export function SplitPanel({ main, side, className }: { main: React.ReactNode; side: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-card xl:grid xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]',
        className,
      )}
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">{main}</div>
      <aside className="flex min-h-0 min-w-0 flex-col overflow-y-auto border-t border-line-soft bg-sidebar/45 scrollbar-thin xl:border-l xl:border-t-0">{side}</aside>
    </div>
  )
}

/** Un bloque de la columna de la derecha de un SplitPanel: título chico y su contenido, separados por una línea. */
export function SideSection({ title, children, className }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-line-soft px-5 py-4 last:border-b-0', className)}>
      {title ? <h2 className="mb-3 text-[13px] font-semibold text-fg">{title}</h2> : null}
      {children}
    </section>
  )
}
