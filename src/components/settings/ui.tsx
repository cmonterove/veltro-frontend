'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/** Encabezado de cada página de Ajustes: qué es y, opcionalmente, acciones y pestañas. */
export function SettingsHeader({
  title,
  description,
  leading,
  actions,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  /** marca o ícono a la izquierda del título (p. ej. el de un espacio) */
  leading?: React.ReactNode
  actions?: React.ReactNode
  /** pestañas u otra fila debajo del título */
  children?: React.ReactNode
}) {
  return (
    <header className="mb-8">
      <div className="flex items-start gap-4">
        {leading ? <div className="shrink-0 pt-0.5">{leading}</div> : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-fg">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">{description}</p> : null}
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
  children,
  className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  tone?: 'danger'
  children: React.ReactNode
  className?: string
}) {
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

/** Aparece al cambiar algo: un solo guardar por página o pestaña, siempre a la vista. */
export function SaveBar({ dirty, pending, onSave, onDiscard, disabled }: { dirty: boolean; pending?: boolean; onSave: () => void; onDiscard: () => void; disabled?: boolean }) {
  const t = useTranslations('settings.common')
  if (!dirty) return null
  return (
    <div className="popup-motion sticky bottom-4 z-10 mt-2 flex items-center gap-3 rounded-xl border border-line bg-panel/95 px-4 py-2.5 shadow-lift backdrop-blur-sm">
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
