'use client'

import Link from 'next/link'
import { useLayoutEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, ChevronDown, CircleAlert, CircleDashed, LayoutGrid, Minus, SignalHigh, Timer } from 'lucide-react'
import { useApp, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { ScopeMenu, ScopePeople } from '@/components/app/scope-menu'
import { DateRangePicker, formatRange, resolveRange, type DateRangeValue } from '@/components/ui/date-range-picker'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { Tooltip } from '@/components/ui/tooltip'
import { CARD } from '@/components/ui/surface'
import { PriorityIcon, StatusIcon } from '@/components/tasks/status-icon'
import { useTasks } from '@/lib/queries/tasks'
import { useLocalStorage, useNow } from '@/lib/hooks'
import { useScopes } from '@/lib/scope'
import { toDateKey, useDateLocale } from '@/lib/dates'
import { TASK_PRIORITIES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { TaskPriority, TaskRow, TaskStatus } from '@/lib/database.types'

/**
 * Dashboards: los números que dicen cómo van las tareas, para quien mira el conjunto. Complementa a
 * Mesa (que responde quién y qué espacio pide atención): aquí van la respuesta corta, la tendencia y
 * las mezclas. Todo sale de la misma lista de tareas del alcance (abiertas y terminadas), así las
 * cifras cuadran entre sí; los filtros (período, alcance, espacio) van en una fila arriba y acotan todo.
 *
 * Arriba, sobre el color de la cuenta (como el bloque del día en Pulso y Ritmo en Mesa): la frase,
 * las cifras y lo pendiente día a día. Debajo, cuatro tarjetas, cada una con su ícono, su cifra y su
 * gráfico. Colores validados con la guía de dataviz: sobre el marco, lo abierto en lavanda
 * (--hero-open) y lo vencido en coral (--hero-late); en las tarjetas, lo abierto en ciruela
 * (--dash-open), el riesgo en rojo (--chart-risk) y lo terminado en frambuesa (--chart-closed).
 * El color nunca va solo: cada línea, barra o columna lleva su nombre, su ícono o su cifra.
 */

type OpenStatus = Exclude<TaskStatus, 'done'>
const OPEN_STATUSES: OpenStatus[] = ['backlog', 'todo', 'in_progress', 'blocked']
const CYCLE_BUCKETS = ['sameDay', 'd3', 'd7', 'd14', 'more'] as const
const DUE_DAYS = 14

type Metrics = {
  total: number
  open: number
  inProgress: number
  blocked: number
  overdue: number
  noDate: number
  done: number
  donePrev: number
  created: number
  onTime: { pct: number | null; base: number }
  onTimePrev: { pct: number | null; base: number }
  cycle: { median: number | null; count: number }
  cyclePrev: { median: number | null; count: number }
  byStatus: Record<OpenStatus, number>
  byPriority: Record<TaskPriority, number>
  trend: { day: string; open: number; overdue: number }[]
  due: { late: number; days: { day: string; n: number }[] }
  cycleBuckets: number[]
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Todo lo del tablero, de una pasada por las tareas (las fechas como AAAA-MM-DD, en la zona de quien mira). */
function computeMetrics(tasks: TaskRow[], r: { days: string[]; fromKey: string; toKey: string; prevFromKey: string; prevToKey: string; todayKey: string }): Metrics {
  const byStatus: Record<OpenStatus, number> = { backlog: 0, todo: 0, in_progress: 0, blocked: 0 }
  const byPriority = Object.fromEntries(TASK_PRIORITIES.map((p) => [p, 0])) as Record<TaskPriority, number>
  const dueDays = Array.from({ length: DUE_DAYS }, (_, i) => toDateKey(addDays(parseISO(r.todayKey), i)))
  const dueCount = new Map(dueDays.map((d) => [d, 0]))
  const cycleBuckets = [0, 0, 0, 0, 0]
  const cur = { cycles: [] as number[], dated: 0, onTime: 0, done: 0 }
  const prev = { cycles: [] as number[], dated: 0, onTime: 0, done: 0 }
  let open = 0
  let inProgress = 0
  let blocked = 0
  let overdue = 0
  let noDate = 0
  let created = 0
  // para la tendencia: cuándo nació y cuándo se terminó cada una
  const life: { born: string; died: string | null; due: string | null }[] = []

  for (const t of tasks) {
    const born = toDateKey(new Date(t.created_at))
    if (born >= r.fromKey && born <= r.toKey) created++
    const isDone = t.status === 'done'
    // terminada sin fecha de cierre (datos viejos): cuenta como terminada desde siempre
    const died = isDone ? (t.completed_at ? toDateKey(new Date(t.completed_at)) : '0000-00-00') : null
    life.push({ born, died, due: t.due_date })

    if (!isDone) {
      open++
      byStatus[t.status as OpenStatus]++
      byPriority[t.priority]++
      if (t.status === 'in_progress') inProgress++
      if (t.status === 'blocked') blocked++
      if (!t.due_date) noDate++
      else if (t.due_date < r.todayKey) overdue++
      else if (dueCount.has(t.due_date)) dueCount.set(t.due_date, dueCount.get(t.due_date)! + 1)
      continue
    }
    if (!died || died === '0000-00-00') continue
    const bucket = died >= r.fromKey && died <= r.toKey ? cur : died >= r.prevFromKey && died <= r.prevToKey ? prev : null
    if (!bucket) continue
    bucket.done++
    const days = differenceInCalendarDays(parseISO(died), parseISO(born))
    bucket.cycles.push(Math.max(0, days))
    if (t.due_date) {
      bucket.dated++
      if (died <= t.due_date) bucket.onTime++
    }
    if (bucket === cur) cycleBuckets[days <= 0 ? 0 : days <= 3 ? 1 : days <= 7 ? 2 : days <= 14 ? 3 : 4]++
  }

  const trend = r.days.map((day) => {
    let o = 0
    let late = 0
    for (const l of life) {
      if (l.born > day || (l.died !== null && l.died <= day)) continue
      o++
      if (l.due && l.due < day) late++
    }
    return { day, open: o, overdue: late }
  })

  return {
    total: tasks.length,
    open,
    inProgress,
    blocked,
    overdue,
    noDate,
    done: cur.done,
    donePrev: prev.done,
    created,
    onTime: { pct: cur.dated ? (cur.onTime / cur.dated) * 100 : null, base: cur.dated },
    onTimePrev: { pct: prev.dated ? (prev.onTime / prev.dated) * 100 : null, base: prev.dated },
    cycle: { median: median(cur.cycles), count: cur.cycles.length },
    cyclePrev: { median: median(prev.cycles), count: prev.cycles.length },
    byStatus,
    byPriority,
    trend,
    due: { late: overdue, days: dueDays.map((day) => ({ day, n: dueCount.get(day) ?? 0 })) },
    cycleBuckets,
  }
}

/** Tope redondo para el eje: 4, 6, 8, 10, 20, 30… */
const niceTop = (max: number) => (max <= 4 ? 4 : max <= 10 ? Math.ceil(max / 2) * 2 : max <= 50 ? Math.ceil(max / 10) * 10 : Math.ceil(max / 50) * 50)

export function DashboardsView() {
  const t = useTranslations('dashboards')
  const tNav = useTranslations('nav')
  const tr = useTranslations('dateRange')
  const { accountRole } = useApp()
  const wsMap = useWorkspaceMap()
  const now = useNow()
  const locale = useDateLocale()
  const { options, resolve } = useScopes()
  const admin = accountRole === 'owner' || accountRole === 'admin'
  // lo más amplio que cada quien puede ver: toda la empresa, su equipo o lo suyo
  const fallback = admin ? 'all' : options.some((o) => o.id === 'team') ? 'team' : 'me'
  const [scopeId, setScopeId] = useLocalStorage<string>('veltro:dash-scope', fallback)
  const scope = resolve(scopeId)
  const [rangeValue, setRangeValue] = useLocalStorage<DateRangeValue>('veltro:dash-range', { preset: 'last30' })
  const [wsId, setWsId] = useLocalStorage<string>('veltro:dash-ws', 'all')
  const ws = wsId !== 'all' ? wsMap.get(wsId) : undefined

  const todayKey = toDateKey(now)
  const weekStartsOn = locale.options?.weekStartsOn ?? 1
  const range = useMemo(() => {
    const res = resolveRange(rangeValue, new Date(`${todayKey}T12:00:00`), weekStartsOn)
    // lo que todavía no pasó no tiene datos: la tendencia llega hasta hoy
    const end = res.to > parseISO(todayKey) ? parseISO(todayKey) : res.to
    const len = Math.max(1, differenceInCalendarDays(end, res.from) + 1)
    const days = Array.from({ length: len }, (_, i) => toDateKey(addDays(res.from, i)))
    const prevTo = addDays(res.from, -1)
    return {
      preset: res.preset,
      from: res.from,
      to: res.to,
      days,
      fromKey: days[0],
      toKey: days[days.length - 1],
      prevFromKey: toDateKey(addDays(prevTo, -(len - 1))),
      prevToKey: toDateKey(prevTo),
      todayKey,
    }
  }, [rangeValue, todayKey, weekStartsOn])
  const period = range.preset ? tr(`presets.${range.preset}`) : formatRange(range, locale, now)

  const tasksQuery = useTasks({ kind: 'scope', scopeId: scope.id, workspaceIds: ws ? [ws.id] : undefined })
  const tasks = tasksQuery.data
  const m = useMemo(() => (tasks ? computeMetrics(tasks, range) : null), [tasks, range])
  // las tareas de lo que se mira, en la página de Tareas (para los atajos de los vacíos)
  const tasksHref = (extra: string) => `/tasks?tab=list${scope.id !== 'me' ? `&scope=${encodeURIComponent(scope.id)}` : ''}${ws ? `&ws=${ws.id}` : ''}${extra}`

  return (
    // lo abierto en ciruela (claro) o lavanda (oscuro) en las tarjetas; sobre el marco, lavanda y coral
    <div className="@container/dash h-full [--dash-open:#7e45a1] dark:[--dash-open:#9d78c6]">
      <div className="flex w-full flex-col gap-4 px-4 pb-4 pt-5 sm:px-6 @min-[1000px]/dash:h-full">
        <header className="flex shrink-0 flex-wrap items-end gap-x-8 gap-y-3 px-1">
          <div className="mr-auto min-w-0">
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-fg">{t('title')}</h1>
            {/* quién y dónde: eso lo responde Mesa */}
            <Link href="/mesa" className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-fg-muted hover:text-fg hover:underline">
              {t('goMesa', { mesa: tNav('mesa') })}
              <ArrowRight className="size-3" />
            </Link>
          </div>
          {/* filtros: una fila, arriba de todo lo que acotan */}
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={rangeValue} onChange={setRangeValue} align="end" />
            <ScopeMenu options={options} value={scope} onChange={setScopeId} />
            <SpaceFilter value={wsId} onChange={setWsId} />
            <ScopePeople scope={scope} />
          </div>
        </header>

        {tasksQuery.isError ? (
          <ErrorState onRetry={() => tasksQuery.refetch()} />
        ) : !m ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <Skeleton className="h-60 shrink-0 rounded-[24px]" />
            <div className={GRID}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="min-h-56 rounded-[24px]" />
              ))}
            </div>
          </div>
        ) : m.total === 0 ? (
          <div className={cn(CARD, 'flex flex-1 items-center justify-center px-6 py-16 text-center')}>
            <p className="max-w-sm text-sm text-fg-muted">{t('empty')}</p>
          </div>
        ) : (
          // al cambiar un filtro, lo anterior queda a la vista (atenuado) hasta que llegan los datos nuevos
          <div className={cn('flex min-h-0 flex-1 flex-col gap-4 transition-opacity duration-200', tasksQuery.isFetching && 'opacity-60')}>
            <Hero m={m} period={period} />
            <div className={GRID}>
              <ByStatus m={m} />
              <ByPriority m={m} />
              <DueSoon m={m} todayKey={todayKey} noDateHref={tasksHref('&due=none')} />
              <CycleTime m={m} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Cuatro tarjetas parejas que llegan hasta abajo; nunca más bajas que 14rem (si no caben, la página baja). */
const GRID =
  'grid grid-cols-1 gap-4 @min-[640px]/dash:grid-cols-2 @min-[1000px]/dash:min-h-0 @min-[1000px]/dash:flex-1 @min-[1000px]/dash:grid-cols-4 @min-[1000px]/dash:grid-rows-[minmax(14rem,1fr)]'

// ---------------- filtro de espacio ----------------

function SpaceFilter({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const t = useTranslations('dashboards')
  const { workspaces } = useApp()
  const current = workspaces.find((w) => w.id === value)
  if (workspaces.length < 2) return null
  return (
    <Menu>
      <MenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-sm text-fg outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:border-accent-mid">
        {current ? <WorkspaceMark ws={current} size={16} /> : <LayoutGrid className="size-3.5 text-fg-subtle" />}
        <span className="max-w-40 truncate">{current?.name ?? t('allSpaces')}</span>
        <ChevronDown className="size-3.5 text-fg-subtle" />
      </MenuTrigger>
      <MenuContent align="end" className="w-60">
        <MenuRadioGroup value={current ? value : 'all'} onValueChange={(v) => onChange(String(v))}>
          <MenuRadioItem value="all" closeOnClick>
            <LayoutGrid />
            {t('allSpaces')}
          </MenuRadioItem>
          <MenuSeparator />
          {workspaces.map((w) => (
            <MenuRadioItem key={w.id} value={w.id} closeOnClick>
              <WorkspaceMark ws={w} size={16} />
              <span className="truncate">{w.name}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

// ---------------- arriba: la respuesta corta, sobre el color de la cuenta ----------------

/**
 * El bloque de arriba, sobre el marco (perla sobre el color de la cuenta): a la izquierda la frase
 * con las dos cifras que importan y las cuatro cifras del período; a la derecha lo pendiente día a día.
 */
function Hero({ m, period }: { m: Metrics; period: string }) {
  const t = useTranslations('dashboards.hero')
  const tk = useTranslations('dashboards.kpi')
  const cycleValue = m.cycle.median == null ? '—' : m.cycle.median < 1 ? tk('lessThanDay') : tk('daysValue', { n: Math.round(m.cycle.median * 10) / 10 })
  const strong = (chunks: React.ReactNode) => <span className="text-fg">{chunks}</span>
  const late = (chunks: React.ReactNode) => <span className="text-danger">{chunks}</span>
  return (
    <section
      className="on-frame day-surface grid shrink-0 gap-x-8 gap-y-5 rounded-[24px] px-6 py-5 shadow-[0_18px_40px_-24px_oklch(0.3_0.12_312/0.55)] [--hero-late:#e86154] [--hero-open:#9186d1] sm:px-7 @min-[1000px]/dash:h-64 @min-[1000px]/dash:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)]"
    >
      <div className="flex min-w-0 flex-col">
        <p className="text-[13px] font-medium text-fg-muted">{period}</p>
        <p className="mt-1.5 text-[24px] font-semibold leading-[1.2] tracking-[-0.025em] text-fg-muted">
          {m.open === 0
            ? t.rich('nothingOpen', { b: strong })
            : m.overdue
              ? t.rich('openOverdue', { open: m.open, overdue: m.overdue, b: strong, l: late })
              : t.rich('openClear', { open: m.open, b: strong })}
        </p>
        <p className="mt-1.5 text-[13px] text-fg-muted">{t('subline', { done: m.done, created: m.created })}</p>
        {/* las cifras del período: grandes, en perla; el cambio contra el período anterior, debajo */}
        <dl className="mt-auto grid grid-cols-2 gap-x-6 gap-y-3 pt-5 @min-[700px]/dash:grid-cols-4">
          <HeroStat label={tk('done')} value={m.done} sub={<Delta cur={m.done} prev={m.donePrev} betterWhen="up" onFrame />} />
          <HeroStat
            label={tk('onTime')}
            value={m.onTime.pct == null ? '—' : `${Math.round(m.onTime.pct)}%`}
            sub={m.onTime.pct == null ? tk('onTimeNoneShort') : <Delta cur={m.onTime.pct} prev={m.onTimePrev.pct} betterWhen="up" unit="pts" onFrame />}
            title={m.onTime.base ? tk('onTimeHint', { count: m.onTime.base }) : undefined}
          />
          <HeroStat
            label={tk('cycleShort')}
            value={cycleValue}
            sub={m.cycle.median == null ? tk('cycleNoneShort') : <Delta cur={m.cycle.median} prev={m.cyclePrev.median} betterWhen="down" unit="days" onFrame />}
            title={m.cycle.count ? tk('cycleHint', { count: m.cycle.count }) : undefined}
          />
          <HeroStat label={tk('inMotion')} value={m.inProgress} sub={tk('blockedCount', { count: m.blocked })} />
        </dl>
      </div>
      <TrendChart m={m} />
    </section>
  )
}

function HeroStat({ label, value, sub, title }: { label: string; value: number | string; sub: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="truncate text-[12px] text-fg-muted">{label}</dt>
      {/* cifras grandes con números proporcionales (las tabulares se ven sueltas a este tamaño) */}
      <dd className="mt-0.5 truncate text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg">{value}</dd>
      <dd className="mt-1 truncate text-[11.5px] text-fg-muted">{sub}</dd>
    </div>
  )
}

/** Cambio contra el período anterior: flecha y signo; mejor en verde, peor en rojo (sobre el marco, tonos claros). */
function Delta({ cur, prev, betterWhen, unit = 'pct', onFrame }: { cur: number | null; prev: number | null; betterWhen: 'up' | 'down'; unit?: 'pct' | 'pts' | 'days'; onFrame?: boolean }) {
  const t = useTranslations('dashboards.kpi')
  if (cur == null || prev == null) return <span title={t('noPrev')}>{t('noPrevShort')}</span>
  const diff = unit === 'pct' ? (prev === 0 ? (cur === 0 ? 0 : null) : ((cur - prev) / prev) * 100) : cur - prev
  // antes no había ninguna: el porcentaje no dice nada, se dice el número de antes
  if (diff == null) return <span title={t('vsPrevLong')}>{t('before', { n: prev })}</span>
  const rounded = unit === 'days' ? Math.round(diff * 10) / 10 : Math.round(diff)
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-1" title={t('vsPrevLong')}>
        <Minus className="size-3" />
        {t('sameShort')}
      </span>
    )
  }
  const up = rounded > 0
  const good = up === (betterWhen === 'up')
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const n = Math.abs(rounded)
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium', good ? (onFrame ? 'text-[oklch(0.86_0.12_158)]' : 'text-success') : 'text-danger')} title={t('vsPrevLong')}>
      <Icon className="size-3.5" />
      {unit === 'pct' ? `${n}%` : unit === 'pts' ? t('pts', { n }) : t('days', { n })}
    </span>
  )
}

// ---------------- lo pendiente día a día (líneas, sobre el marco) ----------------

/**
 * El tamaño real de una caja (para dibujar el SVG a su medida, con líneas de 2 px nítidas). Con una
 * ref de función: si la caja se vuelve a montar, se vuelve a medir.
 */
function useSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((s) => (s.w === Math.round(r.width) && s.h === Math.round(r.height) ? s : { w: Math.round(r.width), h: Math.round(r.height) }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, size] as const
}

/**
 * ¿Crece o baja lo pendiente? Las abiertas de cada día y cuántas de ellas estaban vencidas: dos
 * líneas de 2 px en el mismo eje (las dos son tareas), con su cifra y su nombre al final. Al pasar
 * el mouse (o con ← → en el teclado) una línea vertical marca el día y un cuadro da las dos cifras.
 */
function TrendChart({ m }: { m: Metrics }) {
  const t = useTranslations('dashboards.backlog')
  const locale = useDateLocale()
  const [box, size] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const data = m.trend
  const top = niceTop(Math.max(1, ...data.map((d) => d.open)))
  const PAD = { l: 26, r: 88, t: 8, b: 20 }
  const w = Math.max(0, size.w - PAD.l - PAD.r)
  const h = Math.max(0, size.h - PAD.t - PAD.b)
  const x = (i: number) => PAD.l + (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w)
  const y = (v: number) => PAD.t + h - (v / top) * h
  const path = (k: 'open' | 'overdue') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join('')
  const area = data.length ? `${path('open')}L${x(data.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : ''
  const last = data[data.length - 1]
  const first = data[0]
  const label = (day: string) => format(parseISO(day), 'd MMM', { locale })
  const ticks = data.length > 2 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : data.map((_, i) => i)
  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect()
    const i = Math.round(((clientX - r.left - PAD.l) / Math.max(1, w)) * (data.length - 1))
    setHover(Math.min(data.length - 1, Math.max(0, i)))
  }
  const hv = hover != null ? data[hover] : null
  const change = last && first ? last.open - first.open : 0

  return (
    <div className="flex min-h-48 min-w-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{t('title')}</h2>
        <p className="text-xs text-fg-muted">{change === 0 ? t('flat') : change > 0 ? t('grew', { n: change }) : t('shrank', { n: -change })}</p>
        {/* leyenda: siempre a la vista (dos series), con la marca de cada línea */}
        <div className="ml-auto flex items-center gap-3 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: 'var(--hero-open)' }} />
            {t('open')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: 'var(--hero-late)' }} />
            {t('overdue')}
          </span>
        </div>
      </div>
      <div
        ref={box}
        title={t('hint')}
        className="relative mt-2 min-h-32 flex-1 outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-fg/30"
        tabIndex={0}
        role="img"
        aria-label={t('aria', { open: last?.open ?? 0, overdue: last?.overdue ?? 0 })}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          setHover((i) => Math.min(data.length - 1, Math.max(0, (i ?? data.length - 1) + (e.key === 'ArrowRight' ? 1 : -1))))
        }}
      >
        {size.w > 0 ? (
          <svg width={size.w} height={size.h} className="absolute inset-0 overflow-visible" aria-hidden>
            <defs>
              {/* el lavado bajo lo abierto: 18 % arriba, nada en la base (un velo, no un bloque) */}
              <linearGradient id="dash-open-wash" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--hero-open)" stopOpacity={0.18} />
                <stop offset="1" stopColor="var(--hero-open)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* rejilla: líneas finas, una sombra más que el fondo */}
            {[0, top / 2, top].map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={PAD.l + w} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" strokeWidth={1} />
                <text x={PAD.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-fg-muted text-[11px] tabular-nums">
                  {v}
                </text>
              </g>
            ))}
            {ticks.map((i) => (
              <text key={i} x={x(i)} y={PAD.t + h + 15} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} className="fill-fg-muted text-[11px]">
                {label(data[i].day)}
              </text>
            ))}
            <path d={area} fill="url(#dash-open-wash)" />
            <path d={path('open')} fill="none" stroke="var(--hero-open)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={path('overdue')} fill="none" stroke="var(--hero-late)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* al final de cada línea, su punto (con anillo del color del fondo) y su cifra */}
            {last ? (
              <>
                <circle cx={x(data.length - 1)} cy={y(last.open)} r={4} fill="var(--hero-open)" stroke="var(--frame)" strokeWidth={2} />
                <circle cx={x(data.length - 1)} cy={y(last.overdue)} r={4} fill="var(--hero-late)" stroke="var(--frame)" strokeWidth={2} />
                <EndLabel x={x(data.length - 1) + 10} y={y(last.open)} other={y(last.overdue)} value={last.open} name={t('open')} />
                <EndLabel x={x(data.length - 1) + 10} y={y(last.overdue)} other={y(last.open)} value={last.overdue} name={t('overdue')} below />
              </>
            ) : null}
            {hv && hover != null ? (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + h} stroke="var(--line-strong)" strokeWidth={1} />
                <circle cx={x(hover)} cy={y(hv.open)} r={4} fill="var(--hero-open)" stroke="var(--frame)" strokeWidth={2} />
                <circle cx={x(hover)} cy={y(hv.overdue)} r={4} fill="var(--hero-late)" stroke="var(--frame)" strokeWidth={2} />
              </g>
            ) : null}
          </svg>
        ) : null}
        {hv && hover != null ? (
          // el cuadro del día va en blanco (fuera del marco): se lee igual sobre cualquier color de cuenta
          <div
            className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-lg bg-[oklch(0.99_0.004_80)] px-3 py-2 text-xs text-[oklch(0.25_0.03_312)] shadow-popover"
            style={{ left: Math.min(Math.max(x(hover), 80), size.w - 80), top: 0 }}
          >
            <p className="mb-1 opacity-70">{format(parseISO(hv.day), "EEE d 'de' MMM", { locale })}</p>
            <TipRow color="var(--hero-open)" value={hv.open} name={t('open')} />
            <TipRow color="var(--hero-late)" value={hv.overdue} name={t('overdue')} />
          </div>
        ) : null}
        {/* la misma información, en tabla, para quien no ve el gráfico (la tabla va dentro de un div:
            una tabla no se achica a 1 px y estiraba la página) */}
        <div className="sr-only">
          <table>
            <caption>{t('tableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('day')}</th>
                <th scope="col">{t('open')}</th>
                <th scope="col">{t('overdue')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <th scope="row">{label(d.day)}</th>
                  <td>{d.open}</td>
                  <td>{d.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** La cifra al final de una línea; si las dos quedan muy juntas, una sube y la otra baja. */
function EndLabel({ x, y, other, value, name, below }: { x: number; y: number; other: number; value: number; name: string; below?: boolean }) {
  const close = Math.abs(y - other) < 16
  const dy = close ? (below ? 9 : -7) : 0
  return (
    <text x={x} y={y + dy} dy="0.32em" className="text-[11.5px]">
      <tspan className="fill-fg font-semibold tabular-nums">{value}</tspan>
      <tspan className="fill-fg-muted" dx={4}>
        {name.toLowerCase()}
      </tspan>
    </text>
  )
}

function TipRow({ color, value, name }: { color: string; value: number; name: string }) {
  return (
    <p className="flex items-center gap-2">
      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-70">{name}</span>
    </p>
  )
}

// ---------------- tarjetas de abajo ----------------

/** El tono de cada tarjeta: su ícono va en una ficha de ese color (como las columnas de Pulso). */
const TONE = {
  plum: 'bg-accent-soft text-accent-ink',
  warn: 'bg-warning-soft text-mandarina-ink',
  late: 'bg-danger-soft text-danger',
  done: 'bg-done-soft text-done',
} as const

function Card({
  icon,
  tone,
  title,
  hint,
  figure,
  figureLabel,
  children,
}: {
  icon: React.ReactNode
  tone: keyof typeof TONE
  title: string
  hint?: React.ReactNode
  /** la cifra de la tarjeta, grande, arriba a la derecha */
  figure?: React.ReactNode
  figureLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn(CARD, 'flex min-h-56 min-w-0 flex-col px-5 pb-4 pt-4 @min-[1000px]/dash:min-h-0')}>
      <div className="flex shrink-0 items-start gap-3">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4', TONE[tone])} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
          {hint ? <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-fg-muted">{hint}</p> : null}
        </div>
        {figure != null ? (
          <div className="shrink-0 text-right">
            <p className="text-[24px] font-semibold leading-none tracking-[-0.02em] text-fg">{figure}</p>
            {figureLabel ? <p className="mt-1 text-[11px] text-fg-subtle">{figureLabel}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

/**
 * Una fila por categoría: su ícono y nombre arriba con la cifra, y debajo la barra (largo = parte
 * del total, sobre un riel del mismo tono). El ícono dice qué es; la barra va en un solo tono (lo que
 * importa es el largo), salvo lo que es riesgo, que va en rojo.
 */
function BarRows({ rows, total }: { rows: { key: string; icon: React.ReactNode; label: string; n: number; risk?: boolean }[]; total: number }) {
  const t = useTranslations('dashboards')
  return (
    <ul className="flex flex-1 flex-col justify-between gap-2">
      {rows.map((r) => {
        const pct = total ? Math.round((r.n / total) * 100) : 0
        return (
          <li key={r.key}>
            <Tooltip content={t('rowTip', { count: r.n, pct, name: r.label })}>
              <div tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-mid/40">
                <div className="flex items-center gap-2 text-[13px]">
                  {r.icon}
                  <span className={cn('min-w-0 flex-1 truncate', r.n ? 'text-fg' : 'text-fg-subtle')}>{r.label}</span>
                  <span className="tabular-nums">
                    <span className={cn('font-semibold', r.n ? 'text-fg' : 'text-fg-subtle')}>{r.n}</span>
                    <span className="ml-1.5 text-xs text-fg-subtle">{pct}%</span>
                  </span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--chart-track)]">
                  {r.n ? (
                    <span
                      className="block h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{ width: `${Math.max(3, pct)}%`, background: r.risk ? 'var(--chart-risk)' : 'var(--dash-open)' }}
                    />
                  ) : null}
                </span>
              </div>
            </Tooltip>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Columnas de hasta 24 px que nacen de una misma base, con la punta redonda (4 px) y la base recta.
 * La cifra va solo donde aporta (la más alta y las marcadas); el resto, al pasar el mouse.
 */
function Columns({ cols }: { cols: { key: string; label: React.ReactNode; n: number; tip: string; color: string; strong?: boolean; showValue?: boolean }[] }) {
  const max = Math.max(1, ...cols.map((c) => c.n))
  return (
    <div className="flex min-h-28 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-end gap-1 border-b border-line-soft">
        {cols.map((c) => (
          <Tooltip key={c.key} content={c.tip}>
            <div tabIndex={0} className="group/col flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent-mid/40">
              {c.n && (c.showValue || c.n === max) ? <span className="mb-1 text-[11px] font-semibold tabular-nums text-fg">{c.n}</span> : null}
              <span
                className="w-full max-w-6 rounded-t-[4px] transition-[height,filter] duration-500 ease-out group-hover/col:brightness-110"
                style={{ height: c.n ? `${Math.max(4, (c.n / max) * 86)}%` : 2, background: c.n ? c.color : 'var(--chart-track)' }}
              />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        {cols.map((c) => (
          // etiquetas cortas: una inicial o «Hoy» puede asomar un poco sobre la de al lado, pero no se corta
          <span key={c.key} className={cn('flex min-w-0 flex-1 justify-center whitespace-nowrap text-center text-[10.5px] leading-tight', c.strong ? 'font-semibold text-fg' : 'text-fg-subtle')}>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Sin datos para ese gráfico: la silueta de lo que va a aparecer (columnas punteadas) y una línea
 * que dice qué falta, con el atajo para hacerlo si lo hay. No una caja vacía.
 */
function Ghost({ text, action }: { text: string; action?: { href: string; label: string } }) {
  const heights = [38, 62, 46, 78, 54, 30, 66]
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div aria-hidden className="flex min-h-12 flex-1 items-end gap-2 border-b border-dashed border-line-strong/70 px-2 opacity-70">
        {heights.map((h, i) => (
          <span key={i} className="flex-1 rounded-t-[4px] border border-b-0 border-dashed border-line-strong" style={{ height: `${h}%` }} />
        ))}
      </div>
      <p className="mt-2.5 text-center text-[12.5px] leading-snug text-fg-muted">{text}</p>
      {action ? (
        <Link href={action.href} className="mt-1 inline-flex items-center justify-center gap-1 self-center text-xs font-medium text-accent-ink hover:underline">
          {action.label}
          <ArrowRight className="size-3" />
        </Link>
      ) : null}
    </div>
  )
}

function ByStatus({ m }: { m: Metrics }) {
  const t = useTranslations('dashboards.status')
  const tStatus = useTranslations('tasks.status')
  return (
    <Card icon={<CircleDashed />} tone="plum" title={t('titleShort')} hint={t('hintShort')} figure={m.open} figureLabel={t('figure')}>
      {m.open ? (
        <BarRows total={m.open} rows={OPEN_STATUSES.map((s) => ({ key: s, icon: <StatusIcon status={s} />, label: tStatus(s), n: m.byStatus[s], risk: s === 'blocked' }))} />
      ) : (
        <Ghost text={t('none')} />
      )}
    </Card>
  )
}

function ByPriority({ m }: { m: Metrics }) {
  const t = useTranslations('dashboards.priority')
  const tPriority = useTranslations('tasks.priority')
  const hot = m.byPriority.urgent + m.byPriority.high
  return (
    <Card icon={<SignalHigh />} tone="warn" title={t('titleShort')} hint={t('hint')} figure={hot} figureLabel={t('figure')}>
      {m.open ? (
        <BarRows total={m.open} rows={TASK_PRIORITIES.map((p) => ({ key: p, icon: <PriorityIcon priority={p} />, label: tPriority(p), n: m.byPriority[p], risk: p === 'urgent' }))} />
      ) : (
        <Ghost text={t('none')} />
      )}
    </Card>
  )
}

function DueSoon({ m, todayKey, noDateHref }: { m: Metrics; todayKey: string; noDateHref: string }) {
  const t = useTranslations('dashboards.due')
  const tc = useTranslations('dashboards')
  const locale = useDateLocale()
  const upcoming = m.due.days.reduce((n, d) => n + d.n, 0)
  const fixDates = m.noDate ? { href: noDateHref, label: t('fixDates', { count: m.noDate }) } : undefined
  return (
    <Card icon={<CalendarClock />} tone="late" title={t('title')} hint={t('hintShort')} figure={upcoming} figureLabel={t('figure')}>
      {m.due.late || upcoming ? (
        <div className="flex min-h-0 flex-1 gap-3">
          {/* lo atrasado no es un día más: va aparte, como cifra, en rojo y con su ícono */}
          <Tooltip content={t('lateTip', { count: m.due.late })}>
            <div tabIndex={0} className="flex w-14 shrink-0 flex-col justify-end border-r border-line-soft pb-5 pr-3 outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent-mid/40">
              <span className={cn('text-[24px] font-semibold leading-none tracking-[-0.02em]', m.due.late ? 'text-danger' : 'text-fg-subtle')}>{m.due.late}</span>
              <span className="mt-1 flex items-center gap-1 text-[11px] text-fg-muted">
                <CircleAlert className={cn('size-3 shrink-0', m.due.late ? 'text-danger' : 'text-fg-subtle')} />
                {t('late')}
              </span>
            </div>
          </Tooltip>
          {upcoming ? (
            <Columns
              cols={m.due.days.map((d) => {
                const day = parseISO(d.day)
                const isToday = d.day === todayKey
                // en una tarjeta angosta catorce iniciales se amontonan: hoy y el comienzo de cada semana
                const weekStart = day.getDay() === (locale.options?.weekStartsOn ?? 1)
                return {
                  key: d.day,
                  label: isToday ? t('today') : weekStart ? format(day, 'd MMM', { locale }) : '',
                  n: d.n,
                  tip: `${tc('tasks', { count: d.n })} · ${format(day, "EEE d 'de' MMM", { locale })}`,
                  color: 'var(--dash-open)',
                  strong: isToday,
                  showValue: isToday,
                }
              })}
            />
          ) : (
            <Ghost text={t('none')} action={fixDates} />
          )}
        </div>
      ) : (
        <Ghost text={t('none')} action={fixDates} />
      )}
    </Card>
  )
}

function CycleTime({ m }: { m: Metrics }) {
  const t = useTranslations('dashboards.cycle')
  const tk = useTranslations('dashboards.kpi')
  const tc = useTranslations('dashboards')
  const figure = m.cycle.median == null ? '—' : m.cycle.median < 1 ? tk('lessThanDayShort') : tk('daysShort', { n: Math.round(m.cycle.median * 10) / 10 })
  return (
    <Card icon={<Timer />} tone="done" title={t('titleShort')} hint={t('hintShort', { count: m.cycle.count })} figure={figure} figureLabel={t('figure')}>
      {m.cycle.count ? (
        <Columns
          cols={CYCLE_BUCKETS.map((b, i) => ({
            key: b,
            label: t(`buckets.${b}`),
            n: m.cycleBuckets[i],
            tip: `${tc('tasks', { count: m.cycleBuckets[i] })} · ${t(`buckets.${b}`)}`,
            color: 'var(--chart-closed)',
            showValue: true,
          }))}
        />
      ) : (
        <Ghost text={t('none')} />
      )}
    </Card>
  )
}
