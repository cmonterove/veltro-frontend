'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { addDays, format, startOfDay } from 'date-fns'
import { CalendarDays, CalendarPlus } from 'lucide-react'
import { canEdit, useApp } from '@/components/app/app-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { toDateKey, useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { NewMeetingDialog } from './new-meeting-dialog'

/**
 * Los próximos 7 días con hoy marcado. Un punto mandarina en los días en que vence algo:
 * la semana libre de reuniones se lee junto a lo que hay que entregar.
 */
export function WeekStrip({ now, due = [], className }: { now: Date; due?: string[]; className?: string }) {
  const locale = useDateLocale()
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), i))
  const dueSet = new Set(due)
  return (
    <ol className={cn('grid grid-cols-7 gap-1', className)} aria-hidden>
      {days.map((d, i) => {
        const today = i === 0
        const busy = dueSet.has(toDateKey(d))
        const weekend = d.getDay() === 0 || d.getDay() === 6
        return (
          <li key={d.toISOString()} className="flex min-w-0 flex-col items-center gap-1">
            <span className={cn('text-2xs font-medium uppercase', today ? 'text-accent-ink' : 'text-fg-subtle', weekend && !today && 'opacity-60')}>
              {format(d, 'EEEEE', { locale })}
            </span>
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-full text-[13px] tabular-nums',
                today
                  ? 'bg-accent font-semibold text-accent-fg shadow-[0_6px_14px_-8px_var(--accent)]'
                  : weekend
                    ? 'border border-dashed border-line-strong text-fg-subtle'
                    : 'bg-panel text-fg-muted ring-1 ring-line',
              )}
            >
              {format(d, 'd')}
            </span>
            <span className={cn('size-1.5 rounded-full', busy ? 'bg-mandarina' : 'bg-transparent')} />
          </li>
        )
      })}
    </ol>
  )
}

/** Fechas (yyyy-MM-dd) de los próximos 7 días en que vence una tarea abierta. */
export function dueThisWeek(tasks: { status: string; due_date: string | null }[] | undefined, now: Date) {
  const from = toDateKey(now)
  const to = toDateKey(addDays(now, 6))
  return (tasks ?? []).flatMap((x) => (x.status !== 'done' && x.due_date && x.due_date >= from && x.due_date <= to ? [x.due_date] : []))
}

/**
 * Sin reuniones por delante: no es un hueco, es una semana libre. La tira de los próximos días
 * (con lo que vence) y dos caminos: crear una reunión en Veltro o abrir el calendario.
 * `compact` para columnas angostas (Pulso): todo apilado.
 */
export function NoMeetingsAhead({
  now,
  workspaceId,
  due = [],
  calendarHref = '/calendar',
  eyebrow,
  hint,
  compact = false,
}: {
  now: Date
  /** el espacio de la página: la reunión nueva se crea ahí */
  workspaceId?: string
  due?: string[]
  calendarHref?: string
  eyebrow?: string
  hint?: string
  compact?: boolean
}) {
  const t = useTranslations('calendar.empty')
  const { workspaces } = useApp()
  const [creating, setCreating] = useState(false)
  const canCreate = workspaceId ? canEdit(workspaces.find((w) => w.id === workspaceId)) : workspaces.some((w) => canEdit(w))

  const legend = due.length ? (
    <p className="flex items-center gap-1.5 text-xs text-fg-muted">
      <span className="size-1.5 shrink-0 rounded-full bg-mandarina" />
      {t('due', { count: due.length })}
    </p>
  ) : null

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {canCreate ? (
        <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
          <CalendarPlus />
          {t('new')}
        </Button>
      ) : null}
      <Link href={calendarHref} className={buttonVariants({ variant: compact ? 'ghost' : 'secondary', size: 'sm' })}>
        <CalendarDays />
        {t('calendar')}
      </Link>
    </div>
  )

  return (
    <>
      {compact ? (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-fg">{t('title')}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{hint ?? t('hint')}</p>
          </div>
          <div className="rounded-lg bg-panel/70 px-1 pb-1 pt-2 ring-1 ring-line-soft">
            <WeekStrip now={now} due={due} />
          </div>
          {legend}
          {actions}
        </div>
      ) : (
        // por el ancho de la tarjeta, no de la ventana: en dos columnas solo si cabe la tira al lado
        <div className="@container">
          <div className="flex flex-col gap-5 @min-[540px]:flex-row @min-[540px]:items-center @min-[540px]:justify-between @min-[540px]:gap-8">
            <div className="flex min-w-0 flex-col gap-4">
              <div>
                {eyebrow ? <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{eyebrow}</p> : null}
                <p className={cn('text-lg font-semibold tracking-[-0.01em] text-fg', eyebrow && 'mt-1.5')}>{t('title')}</p>
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-fg-muted">{hint ?? t('hint')}</p>
              </div>
              {actions}
            </div>
            <div className="flex shrink-0 flex-col gap-2 @min-[540px]:w-[264px]">
              <div className="rounded-xl bg-panel/80 px-1.5 pb-1.5 pt-2.5 ring-1 ring-line">
                <WeekStrip now={now} due={due} />
              </div>
              {legend}
            </div>
          </div>
        </div>
      )}
      {canCreate ? <NewMeetingDialog open={creating} onOpenChange={setCreating} defaults={workspaceId ? { workspaceId } : undefined} /> : null}
    </>
  )
}
