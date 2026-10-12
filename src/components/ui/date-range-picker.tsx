'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isSameYear,
  isToday,
  isValid,
  parse,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subWeeks,
} from 'date-fns'
import type { Locale } from 'date-fns'
import { ArrowRight, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Button } from './button'
import { toDateKey, useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'

export const RANGE_PRESETS = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'last7', 'last30', 'thisMonth'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

/** Un atajo se guarda como atajo (se recalcula cada día); un rango propio, con sus dos fechas. */
export type DateRangeValue = { preset: RangePreset } | { from: string; to: string }
/** Rango resuelto: `to` es el último día incluido. */
export type ResolvedRange = { from: Date; to: Date; preset: RangePreset | null }

export function resolveRange(value: DateRangeValue, now: Date, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1): ResolvedRange {
  const today = startOfDay(now)
  if ('from' in value) {
    const from = parseISO(value.from)
    const to = parseISO(value.to)
    if (isValid(from) && isValid(to)) return isAfter(from, to) ? { from: to, to: from, preset: null } : { from, to, preset: null }
    return resolveRange({ preset: 'last7' }, now, weekStartsOn)
  }
  const p = value.preset
  const week = startOfWeek(today, { weekStartsOn })
  const ranges: Record<RangePreset, [Date, Date]> = {
    today: [today, today],
    yesterday: [subDays(today, 1), subDays(today, 1)],
    thisWeek: [week, endOfWeek(today, { weekStartsOn })],
    lastWeek: [subWeeks(week, 1), subDays(week, 1)],
    last7: [subDays(today, 6), today],
    last30: [subDays(today, 29), today],
    thisMonth: [startOfMonth(today), endOfMonth(today)],
  }
  const [from, to] = ranges[RANGE_PRESETS.includes(p) ? p : 'last7']
  return { from: startOfDay(from), to: startOfDay(to), preset: RANGE_PRESETS.includes(p) ? p : 'last7' }
}

/** "6 – 12 oct", "28 sept – 4 oct", "1 dic 2025 – 5 ene 2026" según haga falta. */
export function formatRange(r: { from: Date; to: Date }, locale: Locale, now = new Date()) {
  const yearNeeded = !isSameYear(r.from, now) || !isSameYear(r.to, now)
  if (isSameDay(r.from, r.to)) return format(r.from, yearNeeded ? 'd MMM yyyy' : 'EEE d MMM', { locale })
  if (isSameMonth(r.from, r.to)) return `${format(r.from, 'd', { locale })} – ${format(r.to, yearNeeded ? 'd MMM yyyy' : 'd MMM', { locale })}`
  const f = yearNeeded ? 'd MMM yyyy' : 'd MMM'
  return `${format(r.from, f, { locale })} – ${format(r.to, f, { locale })}`
}

/**
 * Rango de fechas con atajos (Hoy, Ayer, Esta semana…) y un calendario de dos meses para uno propio.
 * Los atajos se aplican con un click; un rango propio se confirma con "Aplicar".
 */
export function DateRangePicker({
  value,
  onChange,
  presets = RANGE_PRESETS,
  className,
  align = 'start',
}: {
  value: DateRangeValue
  onChange: (v: DateRangeValue) => void
  presets?: readonly RangePreset[]
  className?: string
  align?: 'start' | 'end'
}) {
  const t = useTranslations('dateRange')
  const locale = useDateLocale()
  const weekStartsOn = locale.options?.weekStartsOn ?? 1
  const now = new Date()
  const current = resolveRange(value, now, weekStartsOn)
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'inline-flex h-8 items-center gap-2 rounded-lg bg-hover px-2.5 text-sm font-medium text-fg transition-colors hover:bg-active data-[popup-open]:bg-active',
          className,
        )}
      >
        <CalendarRange className="size-4 text-fg-muted" />
        {current.preset ? t(`presets.${current.preset}`) : null}
        <span className={cn('tabular-nums', current.preset ? 'font-normal text-fg-subtle' : 'text-fg')}>{formatRange(current, locale, now)}</span>
        <ChevronDown className="size-3.5 text-fg-subtle" />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(calc(100vw-2rem),42rem)] overflow-hidden rounded-xl p-0">
        {open ? (
          <RangePanel
            key={String(open)}
            current={current}
            presets={presets}
            weekStartsOn={weekStartsOn}
            onPreset={(p) => {
              onChange({ preset: p })
              setOpen(false)
            }}
            onApply={(from, to) => {
              onChange({ from: toDateKey(from), to: toDateKey(to) })
              setOpen(false)
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function RangePanel({
  current,
  presets,
  weekStartsOn,
  onPreset,
  onApply,
  onCancel,
}: {
  current: ResolvedRange
  presets: readonly RangePreset[]
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
  onPreset: (p: RangePreset) => void
  onApply: (from: Date, to: Date) => void
  onCancel: () => void
}) {
  const t = useTranslations('dateRange')
  const locale = useDateLocale()
  const [from, setFrom] = useState<Date | null>(current.from)
  const [to, setTo] = useState<Date | null>(current.to)
  const [hover, setHover] = useState<Date | null>(null)
  // qué punta se está eligiendo: la próxima fecha que se toque va a esa punta
  const [picking, setPicking] = useState<'from' | 'to'>('from')
  const [month, setMonth] = useState(() => startOfMonth(isSameMonth(current.from, current.to) ? addMonths(current.from, -1) : current.from))

  const pick = (d: Date) => {
    if (picking === 'from' || !from) {
      setFrom(d)
      setTo(null)
      setPicking('to')
      return
    }
    if (isBefore(d, from)) {
      setTo(from)
      setFrom(d)
    } else setTo(d)
    setPicking('from')
  }

  // mientras falta el fin, el rango se previsualiza hasta el día bajo el puntero (hacia adelante o hacia atrás)
  const preview = from && !to && hover ? hover : null
  const shownFrom = preview && from && isBefore(preview, from) ? preview : from
  const shownTo = preview && from ? (isBefore(preview, from) ? from : preview) : to
  const days = from && to ? differenceInCalendarDays(to, from) + 1 : null

  return (
    <div className="flex flex-col sm:flex-row">
      <ul className="flex gap-1 overflow-x-auto border-b border-line bg-sidebar/50 p-2 scrollbar-none sm:w-44 sm:shrink-0 sm:flex-col sm:gap-px sm:border-b-0 sm:border-r">
        {presets.map((p) => {
          const active = current.preset === p
          return (
            <li key={p} className="shrink-0">
              <button
                type="button"
                onClick={() => onPreset(p)}
                className={cn(
                  'flex h-8 w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-2.5 text-left text-sm transition-colors hover:bg-hover/70',
                  active ? 'font-semibold text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {t(`presets.${p}`)}
                {active ? <Check className="size-4 shrink-0 text-accent" strokeWidth={2.75} /> : null}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="min-w-0 flex-1 p-4">
        {/* inicio y fin: se pueden escribir o elegir en el calendario */}
        <div className="flex items-end gap-2">
          <DateField label={t('start')} value={from} active={picking === 'from'} onFocus={() => setPicking('from')} onCommit={(d) => (to && isAfter(d, to) ? (setFrom(to), setTo(d)) : setFrom(d))} />
          <ArrowRight className="mb-2.5 size-4 shrink-0 text-fg-subtle" />
          <DateField label={t('end')} value={to} active={picking === 'to'} onFocus={() => setPicking('to')} onCommit={(d) => (from && isBefore(d, from) ? (setTo(from), setFrom(d)) : setTo(d))} placeholder={t('pickEnd')} />
        </div>

        <div className="mt-4 flex gap-6" onMouseLeave={() => setHover(null)}>
          {[0, 1].map((offset) => (
            <MonthGrid
              key={offset}
              month={addMonths(month, offset)}
              weekStartsOn={weekStartsOn}
              locale={locale}
              from={shownFrom}
              to={shownTo}
              onPick={pick}
              onHover={setHover}
              className={offset === 1 ? 'hidden sm:block' : undefined}
              nav={
                offset === 0 ? (
                  <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('prev')} className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg">
                    <ChevronLeft className="size-4" />
                  </button>
                ) : null
              }
              navEnd={
                <button
                  type="button"
                  onClick={() => setMonth(addMonths(month, 1))}
                  aria-label={t('next')}
                  className={cn('size-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg', offset === 1 ? 'inline-flex' : 'inline-flex sm:hidden')}
                >
                  <ChevronRight className="size-4" />
                </button>
              }
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
          <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
            {from && to ? t('summary', { days: days ?? 0, range: formatRange({ from, to }, locale) }) : t('pickEnd')}
          </span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="primary" size="sm" disabled={!from || !to} onClick={() => from && to && onApply(from, to)}>
            {t('apply')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Campo de fecha escribible ("06/10/2026" según el idioma); al soltarlo se interpreta. */
function DateField({
  label,
  value,
  active,
  onFocus,
  onCommit,
  placeholder,
}: {
  label: string
  value: Date | null
  active: boolean
  onFocus: () => void
  onCommit: (d: Date) => void
  placeholder?: string
}) {
  const locale = useDateLocale()
  const shown = value ? format(value, 'P', { locale }) : ''
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text == null) return
    const d = parse(text.trim(), 'P', new Date(), { locale })
    if (isValid(d)) onCommit(startOfDay(d))
    setText(null)
  }
  return (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-fg-subtle">{label}</span>
      <input
        value={text ?? shown}
        onChange={(e) => setText(e.target.value)}
        onFocus={onFocus}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder={placeholder ?? format(new Date(), 'P', { locale })}
        inputMode="numeric"
        className={cn(
          'h-9 w-full rounded-lg border bg-canvas px-3 text-sm tabular-nums text-fg outline-none transition-colors placeholder:text-fg-subtle',
          active ? 'border-accent shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent)_16%,transparent)]' : 'border-line hover:border-line-strong',
        )}
      />
    </label>
  )
}

function MonthGrid({
  month,
  weekStartsOn,
  locale,
  from,
  to,
  onPick,
  onHover,
  nav,
  navEnd,
  className,
}: {
  month: Date
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
  locale: Locale
  from: Date | null
  to: Date | null
  onPick: (d: Date) => void
  onHover: (d: Date | null) => void
  nav?: React.ReactNode
  navEnd?: React.ReactNode
  className?: string
}) {
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn }), end: endOfWeek(endOfMonth(month), { weekStartsOn }) }),
    [month, weekStartsOn],
  )
  const weekdays = days.slice(0, 7)

  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <div className="mb-2 flex h-7 items-center gap-1">
        {nav}
        <span className="flex-1 text-center text-sm font-medium capitalize text-fg">{format(month, 'LLLL yyyy', { locale })}</span>
        {navEnd}
      </div>
      <div className="grid grid-cols-7">
        {weekdays.map((d) => (
          <span key={d.toISOString()} className="pb-1 text-center text-2xs font-medium uppercase text-fg-subtle">
            {format(d, 'EEEEEE', { locale })}
          </span>
        ))}
        {days.map((d) => {
          if (!isSameMonth(d, month)) return <span key={d.toISOString()} className="h-9" />
          const isStart = from && isSameDay(d, from)
          const isEnd = to && isSameDay(d, to)
          const inside = from && to && isAfter(d, from) && isBefore(d, to)
          const edge = isStart || isEnd
          const col = (d.getDay() - weekStartsOn + 7) % 7
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'relative h-9',
                // la franja del rango corre de punta a punta; se corta en los bordes de la semana
                (inside || (isStart && to && !isSameDay(from!, to)) || (isEnd && from && !isSameDay(from, to!))) && 'bg-accent-soft',
                isStart && to && !isSameDay(from!, to) && 'rounded-l-lg',
                isEnd && from && !isSameDay(from, to!) && 'rounded-r-lg',
                inside && (col === 0 || d.getDate() === 1) && 'rounded-l-lg',
                inside && (col === 6 || isSameDay(d, endOfMonth(d))) && 'rounded-r-lg',
              )}
            >
              <button
                type="button"
                onClick={() => onPick(d)}
                onMouseEnter={() => onHover(d)}
                onFocus={() => onHover(d)}
                className={cn(
                  'relative flex h-9 w-full items-center justify-center rounded-lg text-sm tabular-nums transition-colors',
                  edge ? 'bg-accent font-semibold text-accent-fg' : inside ? 'text-accent-ink hover:bg-accent/15' : 'text-fg hover:bg-hover',
                )}
              >
                {format(d, 'd')}
                {isToday(d) ? <span className={cn('absolute bottom-1 size-1 rounded-full', edge ? 'bg-accent-fg' : 'bg-accent')} /> : null}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Tramos para graficar un rango: días si es corto, semanas si es mediano, meses si es largo. */
export function rangeBuckets(r: { from: Date; to: Date }, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1) {
  const end = addDays(r.to, 1)
  const span = differenceInCalendarDays(end, r.from)
  const out: { start: Date; end: Date; unit: 'day' | 'week' | 'month' }[] = []
  if (span <= 14) {
    for (let d = r.from; d < end; d = addDays(d, 1)) out.push({ start: d, end: addDays(d, 1), unit: 'day' })
  } else if (span <= 120) {
    for (let s = startOfWeek(r.from, { weekStartsOn }); s < end; s = addDays(s, 7)) out.push({ start: s < r.from ? r.from : s, end: addDays(s, 7) > end ? end : addDays(s, 7), unit: 'week' })
  } else {
    for (let s = startOfMonth(r.from); s < end; s = addMonths(s, 1)) out.push({ start: s < r.from ? r.from : s, end: addMonths(s, 1) > end ? end : addMonths(s, 1), unit: 'month' })
  }
  return out
}
