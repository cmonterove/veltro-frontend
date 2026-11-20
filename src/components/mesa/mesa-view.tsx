'use client'

import Link from 'next/link'
import { Fragment, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, CheckCheck, ChevronDown, CircleAlert, CircleCheck, Info, LayoutGrid, Minus, OctagonAlert, Users } from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { ScopeMenu, ScopePeople } from '@/components/app/scope-menu'
import { FullscreenExitButton } from '@/components/app/fullscreen'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { DateRangePicker, formatRange, rangeBuckets, resolveRange, type DateRangeValue } from '@/components/ui/date-range-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { CARD } from '@/components/ui/surface'
import { Tooltip } from '@/components/ui/tooltip'
import { StatusIcon } from '@/components/tasks/status-icon'
import { useTaskStats, useTasks } from '@/lib/queries/tasks'
import type { ApiTaskStats } from '@/lib/api/tareas'
import { useLocalStorage, useNow } from '@/lib/hooks'
import { useScopes, type ScopeOption } from '@/lib/scope'
import { assigneesOf } from '@/lib/assignees'
import { useOpenTask } from '@/lib/use-open-task'
import { LoadBar, LoadLegend } from '@/components/charts/load-bar'
import { useDateLocale, toDateKey } from '@/lib/dates'
import { cn, taskRef } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'
import type { Member, WorkspaceWithRole } from '@/lib/types'

/**
 * Mesa de control: cómo van los espacios. Responde tres preguntas para quien mira el conjunto
 * (gerencia, jefes de área): ¿cómo va cada espacio?, ¿avanzamos? y ¿quién está sobrecargado?
 * Lo del día (agenda, lo mío) vive en Pulso.
 */

type Bucket = { start: Date; end: Date; unit?: 'day' | 'week' | 'month' }
type Health = 'ok' | 'attention' | 'risk'

/** Más de este atraso (días) en alguna tarea, o tantas vencidas/bloqueadas, pone al espacio en riesgo. */
const RISK_DAYS = 3
const RISK_COUNT = 4

/** Suma las cerradas por día (claves AAAA-MM-DD) que caen en el tramo [start, end). */
const closedIn = (byDay: Record<string, number>, b: Bucket) => {
  let n = 0
  for (let d = b.start; d < b.end; d = addDays(d, 1)) n += byDay[toDateKey(d)] ?? 0
  return n
}

export function MesaView() {
  const t = useTranslations('mesa')
  const { accountRole } = useApp()
  const wsMap = useWorkspaceMap()
  const now = useNow()
  const locale = useDateLocale()
  const tr = useTranslations('dateRange')
  const { options, resolve } = useScopes()
  const admin = accountRole === 'owner' || accountRole === 'admin'
  const [scopeId, setScopeId] = useLocalStorage<string>('veltro:mesa-scope', admin ? 'all' : 'team')
  const scope = resolve(scopeId)
  // un atajo se guarda como atajo: "Últimos 7 días" sigue siendo relativo a hoy mañana
  const [rangeValue, setRangeValue] = useLocalStorage<DateRangeValue>('veltro:mesa-range', { preset: 'last7' })
  const weekStartsOn = locale.options?.weekStartsOn ?? 1
  const dayKey = toDateKey(now)
  const range = useMemo(() => {
    const r = resolveRange(rangeValue, new Date(`${dayKey}T12:00:00`), weekStartsOn)
    return { ...r, end: addDays(r.to, 1), buckets: rangeBuckets(r, weekStartsOn) }
  }, [rangeValue, dayKey, weekStartsOn])

  // Salud de cada espacio, carga por persona y cerradas del período: las calcula la API.
  // "Toda la empresa" incluye lo que no tiene responsable; los demás alcances, lo asignado a esas personas.
  const statsQuery = useTaskStats(scope.id, { from: toDateKey(range.from), to: toDateKey(range.to) })
  const data = statsQuery.data

  // la API ya los ordena: primero los en riesgo, luego los que piden atención
  const stats = useMemo<SpaceStat[]>(
    () =>
      (data?.workspaces ?? []).flatMap((w) => {
        const ws = wsMap.get(w.id)
        if (!ws) return []
        const buckets = range.buckets.map((b) => closedIn(w.closedByDay, b))
        return [{ ws, open: w.open, overdue: w.overdue, blocked: w.blocked, atRisk: w.atRisk, oldest: w.oldestOverdueDays, health: w.health, closed: w.closed, created: w.created, buckets }]
      }),
    [data, wsMap, range],
  )

  const totals = stats.reduce(
    (acc, s) => ({
      closed: acc.closed + s.closed,
      created: acc.created + s.created,
      overdue: acc.overdue + s.overdue,
      blocked: acc.blocked + s.blocked,
      atRisk: acc.atRisk + (s.health === 'risk' ? 1 : 0),
    }),
    { closed: 0, created: 0, overdue: 0, blocked: 0, atRisk: 0 },
  )
  const periodLabel = range.preset ? tr(`presets.${range.preset}`) : formatRange(range, locale, now)

  const sentence = data
    ? t.rich('sentence', {
        period: periodLabel,
        closed: totals.closed,
        created: totals.created,
        overdue: totals.overdue,
        blocked: totals.blocked,
        atRisk: totals.atRisk,
        problems: totals.overdue + totals.blocked ? 'some' : 'none',
        done: (c) => <Figure tone="done">{c}</Figure>,
        new: (c) => <Figure tone="new">{c}</Figure>,
        late: (c) => <Figure tone="late">{c}</Figure>,
        stuck: (c) => <Figure tone="stuck">{c}</Figure>,
        risk: (c) => <Figure tone="late">{c}</Figure>,
      })
    : t('subtitle')
  const peopleAll = data?.people ?? []

  // Mesa, de un vistazo: arriba la respuesta corta (una frase) y los filtros; a la izquierda si
  // avanzamos (el ritmo del período) y cómo va cada espacio; a la derecha qué pide atención y
  // quién está cargado. Cada bloque en su tarjeta, de la misma familia que las de Pulso.
  return (
    <div className="@container/mesa h-full">
    <div className="flex w-full flex-col gap-4 px-4 pb-4 pt-5 sm:px-6 @min-[980px]/mesa:h-full">
      <header className="shrink-0 px-1">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <h1 className="mr-auto text-[26px] font-semibold leading-tight tracking-[-0.025em] text-fg">{t('title')}</h1>
          {/* filtros: una fila, arriba de todo lo que acotan */}
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={rangeValue} onChange={setRangeValue} />
            <ScopeMenu options={options} value={scope} onChange={setScopeId} />
            <ScopePeople scope={scope} />
            <FullscreenExitButton />
          </div>
        </div>
        {/* la respuesta corta, en una frase: cada cifra con el color de lo que cuenta */}
        <p className="mt-1 max-w-[90ch] text-[15px] leading-relaxed text-fg-muted">{sentence}</p>
      </header>

      {statsQuery.isError ? (
        <ErrorState onRetry={() => statsQuery.refetch()} />
      ) : !data ? (
        <div className={GRID}>
          <Skeleton className="h-64 rounded-[24px]" />
          <Skeleton className="h-64 rounded-[24px]" />
          <Skeleton className="min-h-48 rounded-[24px]" />
          <Skeleton className="min-h-48 rounded-[24px]" />
        </div>
      ) : (
        <div className={GRID}>
          <Rhythm daily={data.daily} buckets={range.buckets} now={now} totals={totals} open={data.counters.open} />
          <Attention stats={stats} people={peopleAll} />
          <SpacesTable stats={stats} scope={scope} range={range} now={now} />
          <TeamLoad people={data.people} />
        </div>
      )}
    </div>
    </div>
  )
}

/**
 * Una grilla pareja de cuatro tarjetas: arriba Ritmo y Pide atención con el mismo alto; abajo
 * Espacios y Carga del equipo, que llegan hasta el pie de la pantalla y se desplazan por dentro.
 * Nunca más bajas que ~16rem: en pantallas bajas la página baja un poco en vez de aplastarlas.
 */
const GRID =
  'grid grid-cols-1 gap-4 @min-[980px]/mesa:min-h-0 @min-[980px]/mesa:flex-1 @min-[980px]/mesa:grid-cols-[minmax(0,1.6fr)_minmax(19rem,1fr)] @min-[980px]/mesa:grid-rows-[auto_minmax(16rem,1fr)]'

// ---------------- piezas comunes ----------------

/** Encabezado dentro de una tarjeta: título con su cuenta, una línea que explica y algo a la derecha. */
function CardHead({ icon, title, count, hint, aside }: { icon?: React.ReactNode; title: string; count?: number; hint?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-[-0.015em] text-fg">
          {icon ? (
            <span className="flex shrink-0 [&_svg]:size-4" aria-hidden>
              {icon}
            </span>
          ) : null}
          {title}
          {count != null ? (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-fg/[0.06] px-1.5 text-[11px] font-semibold tabular-nums text-fg-muted">{count}</span>
          ) : null}
        </h2>
        {hint ? <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">{hint}</div> : null}
      </div>
      {aside}
    </div>
  )
}

/** Una cifra dentro de la frase: lo hecho en frambuesa, lo nuevo neutro, lo atrasado en rojo, lo bloqueado en mandarina. */
const FIGURE_TONE = {
  done: 'bg-done-soft text-done',
  new: 'bg-hover text-fg',
  late: 'bg-danger-soft text-danger',
  stuck: 'bg-warning-soft text-mandarina-ink',
} as const

function Figure({ tone, children }: { tone: keyof typeof FIGURE_TONE; children: React.ReactNode }) {
  return <span className={cn('rounded-[5px] px-1 py-px font-semibold [box-decoration-break:clone]', FIGURE_TONE[tone])}>{children}</span>
}

// ---------------- ritmo ----------------

/** Tope redondo para el eje: 4, 6, 8, 10, 20, 30… (la mitad siempre entera). */
const niceTop = (max: number) => (max <= 4 ? 4 : max <= 10 ? Math.ceil(max / 2) * 2 : Math.ceil(max / 10) * 10)

/**
 * ¿Avanzamos? Lo cerrado contra lo nuevo del período, con las cifras al lado (las dos primeras hacen
 * de leyenda: cada una con la muestra de su color) y el balance: si se cierra más de lo que entra, el
 * pendiente baja. Por día en una semana; por semana o mes en períodos largos.
 */
function Rhythm({
  daily,
  buckets,
  now,
  totals,
  open,
}: {
  daily: ApiTaskStats['daily']
  buckets: Bucket[]
  now: Date
  totals: { closed: number; created: number }
  open: number
}) {
  const t = useTranslations('mesa.rhythm')
  const locale = useDateLocale()
  const unit = buckets[0]?.unit ?? 'day'
  const series = useMemo(() => {
    const byDay = new Map(daily.map((d) => [d.day, d]))
    return buckets.map((b) => {
      let closed = 0
      let created = 0
      for (let d = b.start; d < b.end; d = addDays(d, 1)) {
        const x = byDay.get(toDateKey(d))
        closed += x?.closed ?? 0
        created += x?.created ?? 0
      }
      const label = unit === 'day' ? format(b.start, 'EEE d', { locale }) : unit === 'month' ? format(b.start, 'LLL', { locale }) : format(b.start, 'd MMM', { locale })
      const when =
        unit === 'day'
          ? format(b.start, 'EEEE d MMM', { locale })
          : unit === 'month'
            ? format(b.start, 'LLLL', { locale })
            : `${format(b.start, 'd MMM', { locale })} – ${format(addDays(b.end, -1), 'd MMM', { locale })}`
      return { key: toDateKey(b.start), closed, created, label, when, future: b.start > now, current: b.start <= now && now < b.end }
    })
  }, [daily, buckets, now, unit, locale])

  const net = totals.closed - totals.created
  const top = niceTop(Math.max(0, ...series.flatMap((s) => [s.closed, s.created])))
  const ticks = [0, top / 2, top]
  const NetIcon = net > 0 ? ArrowDownRight : net < 0 ? ArrowUpRight : Minus

  // el ritmo es la pieza de Mesa: va sobre la ciruela del marco, con las cifras en perla
  return (
    <section className="on-frame day-surface @container/rhythm rounded-[24px] px-6 pb-5 pt-5 shadow-[0_18px_40px_-24px_oklch(0.3_0.12_312/0.55)]">
      <CardHead title={t('title')} hint={t(`hint.${unit}`)} />
      <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-6 @min-[34rem]/rhythm:grid-cols-[minmax(0,15.5rem)_minmax(0,1fr)]">
        {/* las cifras del período; cerradas y nuevas son también la leyenda del gráfico */}
        <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-4">
          <Kpi label={t('closed')} value={totals.closed} swatch="var(--chart-closed)" />
          <Kpi label={t('created')} value={totals.created} swatch="var(--chart-new)" />
          <Kpi
            label={t('balance')}
            value={net > 0 ? `+${net}` : String(net)}
            sub={
              <span
                // sobre ciruela: fondo translúcido y el texto en la versión clara de su color
                className={cn(
                  'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md bg-fg/[0.1] px-1.5 py-0.5 text-[11px] font-semibold',
                  net > 0 ? 'text-[oklch(0.86_0.12_155)]' : net < 0 ? 'text-mandarina-ink' : 'text-fg-muted',
                )}
              >
                <NetIcon className="size-3" strokeWidth={2.5} />
                {t(net > 0 ? 'down' : net < 0 ? 'up' : 'even')}
              </span>
            }
          />
          <Kpi label={t('open')} value={open} />
        </dl>

        {/* cerradas y nuevas por tramo, desde una misma base; el detalle de cada tramo, al pasar el mouse */}
        <div className="flex min-w-0 flex-col">
          <div className="relative flex h-36" aria-hidden>
            <div className="relative w-6 shrink-0 text-[10.5px] tabular-nums text-fg-subtle">
              {ticks.map((v) => (
                <span key={v} className="absolute right-2 translate-y-1/2 leading-none" style={{ bottom: `${(v / top) * 100}%` }}>
                  {v}
                </span>
              ))}
            </div>
            <div className="relative flex-1">
              {ticks.map((v) => (
                <span key={v} className={cn('absolute inset-x-0 h-px', v ? 'bg-fg/[0.08]' : 'bg-fg/[0.2]')} style={{ bottom: `${(v / top) * 100}%` }} />
              ))}
              <div className="absolute inset-0 flex">
                {series.map((s) => (
                  <Tooltip key={s.key} content={<span className="first-letter:uppercase">{t('tooltip', { when: s.when, closed: s.closed, created: s.created })}</span>}>
                    <span className="flex h-full flex-1 items-end justify-center gap-[3px] rounded-lg transition-colors duration-150 hover:bg-fg/[0.06]">
                      <Column v={s.closed} top={top} color="var(--chart-closed)" future={s.future} />
                      <Column v={s.created} top={top} color="var(--chart-new)" future={s.future} />
                    </span>
                  </Tooltip>
                ))}
              </div>
            </div>
          </div>
          <div className="ml-6 mt-1.5 flex" aria-hidden>
            {series.map((s) => (
              <span
                key={s.key}
                className={cn('min-w-0 flex-1 truncate text-center text-[11px] first-letter:uppercase', s.current ? 'font-semibold text-fg' : s.future ? 'text-fg-subtle/60' : 'text-fg-subtle')}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* la misma información en tabla, para lectores de pantalla */}
      <table className="sr-only">
        <caption>{t('title')}</caption>
        <thead>
          <tr>
            <th>{t('when')}</th>
            <th>{t('closed')}</th>
            <th>{t('created')}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.key}>
              <td>{s.when}</td>
              <td>{s.closed}</td>
              <td>{s.created}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/**
 * Una columna del ritmo: punta redondeada, base recta, nunca más ancha que 16 px, con su cifra encima.
 * En cero queda una marca baja (el día existió, no se cerró nada); lo que aún no llega, vacío.
 */
function Column({ v, top, color, future }: { v: number; top: number; color: string; future: boolean }) {
  return (
    <span className="flex h-full w-[min(16px,40%)] flex-col items-center justify-end">
      {v ? <span className="mb-1 text-[10.5px] font-semibold leading-none tabular-nums text-fg">{v}</span> : null}
      <span
        className="w-full rounded-t-[4px] rounded-b-[1px]"
        style={{ height: v ? `${Math.max(4, (v / top) * 100)}%` : future ? 0 : 3, background: v ? color : 'color-mix(in oklch, var(--fg) 16%, transparent)' }}
      />
    </span>
  )
}

/** Una cifra con su etiqueta; la muestra de color (si la hay) es la leyenda de su serie. */
function Kpi({ label, value, swatch, sub }: { label: string; value: number | string; swatch?: string; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        {swatch ? <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: swatch }} /> : null}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1.5 text-[32px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-fg">{value}</dd>
      {sub ? <dd className="mt-1.5">{sub}</dd> : null}
    </div>
  )
}

// ---------------- pide atención ----------------

/**
 * Lo primero que mira quien lleva la mesa: qué pide atención y por qué. Cada espacio en riesgo
 * (o que pide atención) y cada persona con vencidas o bloqueadas, con la razón y a un clic de sus
 * tareas. Sin nada de eso, la calma también se dice, en una línea.
 */
function Attention({ stats, people }: { stats: SpaceStat[]; people: ApiTaskStats['people'] }) {
  const t = useTranslations('mesa.attention')
  const memberMap = useMemberMap()
  const spaces = stats.filter((s) => s.health !== 'ok')
  const folks = people.filter((p) => p.overdue || p.blocked).sort((a, b) => b.overdue + b.blocked - (a.overdue + a.blocked))
  const health = { ok: stats.filter((s) => s.health === 'ok').length, attention: stats.filter((s) => s.health === 'attention').length, risk: stats.filter((s) => s.health === 'risk').length }
  const shownSpaces = spaces.slice(0, 5)
  const shownFolks = folks.slice(0, Math.max(0, 6 - shownSpaces.length))

  const reason = (overdue: number, blocked: number, oldest?: number) =>
    [overdue ? t('overdue', { count: overdue }) : null, oldest && oldest > 0 ? t('oldest', { days: oldest }) : null, blocked ? t('blocked', { count: blocked }) : null].filter(Boolean).join(' · ')
  const row = 'group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-hover/60'

  return (
    <section className={cn(CARD, 'flex min-h-0 flex-col px-5 pb-4 pt-4')}>
      <CardHead
        icon={spaces.length || folks.length ? <OctagonAlert className="text-danger" /> : <CheckCheck className="text-done" />}
        title={t('title')}
        count={spaces.length + folks.length || undefined}
      />
      {stats.length ? <HealthBar counts={health} /> : null}
      {!spaces.length && !folks.length ? (
        <div className="mt-3 flex flex-1 items-center gap-3 rounded-2xl bg-success-soft/60 px-4 py-3 ring-1 ring-success/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success ring-4 ring-success/10">
            <CheckCheck className="size-4" strokeWidth={2.25} />
          </span>
          <p className="min-w-0 text-sm leading-snug text-fg-muted">
            <span className="block font-semibold text-fg">{t('clearTitle')}</span>
            {t('clearHint')}
          </p>
        </div>
      ) : (
        <ul className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
          {shownSpaces.map((s) => (
            <li key={s.ws.id}>
              <Link href={`/w/${s.ws.slug}/tasks`} className={row}>
                <WorkspaceMark ws={s.ws} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-fg">{s.ws.name}</span>
                    <HealthBadge health={s.health} />
                  </span>
                  <span className="block truncate text-xs text-fg-muted">{reason(s.overdue, s.blocked, s.oldest)}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
          {shownFolks.map((p) => {
            const m = memberMap.get(p.userId)
            return (
              <li key={p.userId}>
                <Link href={`/tasks?tab=list&filter=overdue&scope=${encodeURIComponent(`person:${p.userId}`)}`} className={row}>
                  <Avatar name={p.fullName} src={p.avatarUrl ?? m?.avatar_url} seed={p.userId} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">{p.fullName}</span>
                    <span className="block truncate text-xs text-danger">{reason(p.overdue, p.blocked)}</span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Cuántos espacios hay en cada estado, en una barra (con sus nombres y cifras: el color nunca va solo). */
function HealthBar({ counts }: { counts: Record<Health, number> }) {
  const t = useTranslations('mesa.health')
  const keys = ['ok', 'attention', 'risk'] as const
  const color: Record<Health, string> = { ok: 'var(--success)', attention: 'var(--mandarina)', risk: 'var(--danger)' }
  return (
    <div className="mt-3">
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-fg/[0.06]" aria-hidden>
        {keys.map((k) => (counts[k] ? <span key={k} className="h-full" style={{ flexGrow: counts[k], background: color[k] }} /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: color[k] }} />
            <span className="font-semibold tabular-nums text-fg">{counts[k]}</span>
            {t(k)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------- espacios ----------------

type SpaceStat = {
  ws: WorkspaceWithRole
  open: number
  overdue: number
  blocked: number
  atRisk: number
  oldest: number
  health: Health
  closed: number
  created: number
  buckets: number[]
}

// las columnas siguen el ancho de la tarjeta (no el de la ventana): en la columna ancha de Mesa
// entran todas; en una angosta se esconden primero el avance y después vencidas y bloqueadas
const COLS =
  'grid-cols-[minmax(0,1fr)_auto_2.5rem] @md/spaces:grid-cols-[minmax(0,1fr)_6.5rem_3rem_3.5rem_3rem_0.75rem] @min-[38rem]/spaces:grid-cols-[minmax(8rem,1fr)_6.5rem_minmax(8.5rem,0.9fr)_3rem_3.5rem_3rem_0.75rem]'
const HEAD = 'text-[11.5px] font-medium text-fg-subtle'

function SpacesTable({ stats, scope, range, now }: { stats: SpaceStat[]; scope: ScopeOption; range: { from: Date; end: Date; buckets: Bucket[] }; now: Date }) {
  const t = useTranslations('mesa')
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className={cn(CARD, '@container/spaces flex min-h-0 flex-col overflow-hidden')}>
      <div className="shrink-0 px-5 pb-3 pt-4">
        <CardHead icon={<LayoutGrid className="text-accent" />} title={t('spaces.title')} count={stats.length} />
      </div>
      {stats.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-fg-muted">{t('spaces.empty')}</p>
      ) : (
        <>
          <div className={cn('grid shrink-0 items-center gap-x-3 border-y border-line-soft bg-canvas/70 px-5 py-2', HEAD, COLS)}>
            <span>{t('spaces.space')}</span>
            <span className="flex items-center gap-1">
              {t('spaces.health')}
              <Tooltip content={<span className="block max-w-64 whitespace-normal font-normal leading-snug">{t('spaces.healthHelp', { days: RISK_DAYS, count: RISK_COUNT })}</span>}>
                <button type="button" className="rounded-sm text-fg-subtle outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/35" aria-label={t('spaces.healthHelpLabel')}>
                  <Info className="size-3" />
                </button>
              </Tooltip>
            </span>
            <span className="hidden @min-[38rem]/spaces:block">{t('spaces.progress')}</span>
            <span className="text-right">{t('spaces.open')}</span>
            <span className="hidden text-right @md/spaces:block">{t('spaces.overdue')}</span>
            <span className="hidden text-right @md/spaces:block">{t('spaces.blocked')}</span>
            <span className="hidden @md/spaces:block" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {stats.map((s) => {
            const expanded = openId === s.ws.id
            return (
              <Fragment key={s.ws.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? null : s.ws.id)}
                  aria-expanded={expanded}
                  className={cn(
                    'group/row grid w-full items-center gap-x-3 border-b border-line-soft px-5 py-3 text-left outline-none transition-colors duration-150 last:border-0 hover:bg-hover/45 focus-visible:bg-hover/45',
                    COLS,
                    expanded && 'bg-hover/45',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <WorkspaceMark ws={s.ws} size={34} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-fg">{s.ws.name}</span>
                      <span className="block font-mono text-[10.5px] leading-tight text-fg-subtle">{s.ws.key}</span>
                    </span>
                  </span>
                  <HealthBadge health={s.health} />
                  <span className="hidden items-center gap-3 @min-[38rem]/spaces:flex">
                    <MiniColumns values={s.buckets} buckets={range.buckets} now={now} />
                    <NetChange closed={s.closed} created={s.created} />
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums text-fg">{s.open}</span>
                  <Count n={s.overdue} tone="late" className="hidden @md/spaces:flex" />
                  <Count n={s.blocked} tone="stuck" className="hidden @md/spaces:flex" />
                  <ChevronDown
                    className={cn('hidden size-3.5 text-fg-subtle transition-[transform,color] duration-200 ease-out group-hover/row:text-fg-muted @md/spaces:block', expanded && 'rotate-180 text-fg-muted')}
                  />
                </button>
                {expanded ? <SpaceDetail stat={s} scope={scope} now={now} /> : null}
              </Fragment>
            )
          })}
          </div>
        </>
      )}
    </section>
  )
}

/** Vencidas o bloqueadas: si hay, resalta con su color; si no, un cero callado. */
function Count({ n, tone, className }: { n: number; tone: 'late' | 'stuck'; className?: string }) {
  return (
    <span className={cn('justify-end', className)}>
      {n ? (
        <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] px-1 text-xs font-semibold tabular-nums', FIGURE_TONE[tone])}>{n}</span>
      ) : (
        <span className="text-xs tabular-nums text-fg-subtle/70">0</span>
      )}
    </span>
  )
}

function HealthBadge({ health }: { health: Health }) {
  const t = useTranslations('mesa.health')
  const Icon = health === 'risk' ? OctagonAlert : health === 'attention' ? CircleAlert : CircleCheck
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2 text-[11.5px] font-semibold',
        health === 'risk' ? 'bg-danger-soft text-danger' : health === 'attention' ? 'bg-warning-soft text-mandarina-ink' : 'bg-success-soft text-success',
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      {t(health)}
    </span>
  )
}

/** Tareas cerradas por día (semana) o por semana (mes, trimestre). Lo que aún no llega queda como una marca baja. */
function MiniColumns({ values, buckets, now }: { values: number[]; buckets: Bucket[]; now: Date }) {
  const t = useTranslations('mesa')
  const locale = useDateLocale()
  const max = Math.max(1, ...values)
  const daily = (buckets[0]?.unit ?? 'day') === 'day'
  return (
    <span className="flex h-6 shrink-0 items-end gap-[3px]" aria-hidden>
      {values.map((v, i) => {
        const b = buckets[i]
        const future = b.start > now
        const label = daily
          ? format(b.start, 'EEE d MMM', { locale })
          : b.unit === 'month'
            ? format(b.start, 'LLLL', { locale })
            : `${format(b.start, 'd MMM', { locale })} – ${format(addDays(b.end, -1), 'd MMM', { locale })}`
        return (
          <Tooltip key={i} content={future ? label : t('closedIn', { count: v, when: label })}>
            <span className="flex h-6 w-1.5 items-end">
              {/* lo cerrado, en el color de «hecho»; sin cierres o por venir, una marca baja */}
              <span
                className="w-full rounded-[2px]"
                style={{ height: future ? 3 : v ? Math.max(4, Math.round((v / max) * 24)) : 3, background: future || !v ? 'var(--chart-track)' : 'var(--chart-closed)' }}
              />
            </span>
          </Tooltip>
        )
      })}
    </span>
  )
}

/** Cerradas contra nuevas: positivo = el espacio está bajando su pendiente. */
function NetChange({ closed, created }: { closed: number; created: number }) {
  const t = useTranslations('mesa')
  const net = closed - created
  const Arrow = net > 0 ? ArrowDownRight : net < 0 ? ArrowUpRight : Minus
  return (
    <Tooltip content={t('closedVsNew', { closed, created })}>
      <span
        aria-label={t('closedVsNew', { closed, created })}
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 rounded-[5px] px-1 py-px text-xs font-semibold tabular-nums',
          net > 0 ? 'bg-success-soft text-success' : net < 0 ? 'bg-warning-soft text-mandarina-ink' : 'bg-hover text-fg-muted',
        )}
      >
        {/* la flecha es el pendiente: baja si se cierra más de lo que entra */}
        <Arrow className="size-3" strokeWidth={2.5} />
        {net > 0 ? `+${net}` : net}
      </span>
    </Tooltip>
  )
}

function SpaceDetail({ stat, scope, now }: { stat: SpaceStat; scope: ScopeOption; now: Date }) {
  const t = useTranslations('mesa')
  const memberMap = useMemberMap()
  const { open } = useOpenTask()
  // las abiertas del alcance en este espacio, recién al abrir la fila
  const { data: tasks } = useTasks({ kind: 'scope', scopeId: scope.id, workspaceIds: [stat.ws.id], openOnly: true })
  const todayKey = toDateKey(now)
  const lateDays = (x: TaskRow) => (x.due_date && x.due_date < todayKey ? differenceInCalendarDays(now, parseISO(x.due_date)) : 0)
  const risky = (tasks ?? [])
    .filter((x) => lateDays(x) > 0 || x.status === 'blocked')
    .sort((a, b) => lateDays(b) - lateDays(a) || (a.status === 'blocked' ? -1 : 1))
  // quién carga este espacio: tareas abiertas por responsable
  const load = useMemo(() => {
    const m = new Map<string, number>()
    ;(tasks ?? []).forEach((x) => assigneesOf(x).forEach((id) => m.set(id, (m.get(id) ?? 0) + 1)))
    return [...m]
      .map(([id, n]) => ({ member: memberMap.get(id), n }))
      .filter((x): x is { member: Member; n: number } => Boolean(x.member))
      .sort((a, b) => b.n - a.n)
  }, [tasks, memberMap])

  return (
    <div className="@container/detail border-b border-line-soft bg-canvas/60 px-5 py-4 last:border-0">
      <div className="grid animate-in gap-8 fade-in-0 @min-[34rem]/detail:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] @min-[34rem]/detail:pl-[38px]">
        <div className="min-w-0">
          <p className={cn('mb-2', HEAD)}>{t('detail.risks')}</p>
          {!tasks ? (
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-7" />
              <Skeleton className="h-7" />
            </div>
          ) : risky.length ? (
            <ul className="flex flex-col">
              {risky.slice(0, 6).map((x) => {
                const late = lateDays(x)
                const people = assigneesOf(x).flatMap((id) => memberMap.get(id) ?? [])
                return (
                  <li key={x.id}>
                    <button type="button" onClick={() => open(x.id)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-hover">
                      <StatusIcon status={x.status} />
                      <span className="w-14 shrink-0 font-mono text-2xs text-fg-subtle">{taskRef(stat.ws.key, x.number)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{x.title}</span>
                      <AvatarStack people={people} size={18} ring="sidebar" />
                      <span className="w-20 shrink-0 text-right text-xs text-danger">{late ? t('detail.late', { count: late }) : t('detail.blocked')}</span>
                    </button>
                  </li>
                )
              })}
              {risky.length > 6 ? <li className="pt-1 text-xs text-fg-subtle">{t('detail.more', { count: risky.length - 6 })}</li> : null}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t('detail.noRisks')}</p>
          )}
        </div>
        <div className="min-w-0">
          <p className={cn('mb-2', HEAD)}>{t('detail.load')}</p>
          {!tasks ? (
            <Skeleton className="h-7" />
          ) : load.length ? (
            <ul className="flex flex-col gap-1.5">
              {load.slice(0, 6).map(({ member, n }) => (
                <li key={member.id} className="flex items-center gap-2 text-sm">
                  <Avatar name={member.full_name} src={member.avatar_url} seed={member.id} size={20} />
                  <span className="min-w-0 flex-1 truncate text-fg">{member.full_name}</span>
                  <span className="tabular-nums text-fg-muted">{t('detail.openCount', { count: n })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t('detail.noLoad')}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <Link href={`/w/${stat.ws.slug}/tasks`} className="inline-flex items-center gap-1 text-accent-ink hover:underline">
              {t('detail.openTasks')}
              <ArrowUpRight className="size-3" />
            </Link>
            <Link href={`/w/${stat.ws.slug}`} className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">
              {t('detail.openSpace')}
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------- carga del equipo ----------------

function TeamLoad({ people }: { people: ApiTaskStats['people'] }) {
  const t = useTranslations('mesa')
  const memberMap = useMemberMap()

  // la API ya trae a quienes tienen abiertas o cerradas en el período, de más a menos en riesgo
  const rows = useMemo(
    () =>
      people.flatMap((p) => {
        const member = memberMap.get(p.userId)
        if (!member) return []
        return [{ member, open: p.open, risk: p.atRisk, progress: p.inProgress, rest: p.rest, overdue: p.overdue, blocked: p.blocked, closed: p.closed }]
      }),
    [people, memberMap],
  )
  const max = Math.max(1, ...rows.map((r) => r.open))

  return (
    <section className={cn(CARD, '@container/team flex min-h-0 flex-col overflow-hidden')}>
      <div className="shrink-0 px-5 pb-2 pt-4">
        {/* leyenda: siempre visible, la identidad nunca depende solo del color */}
        <CardHead icon={<Users className="text-accent" />} title={t('team.title')} count={rows.length} hint={<LoadLegend className="mt-1.5" />} />
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-fg-muted">{t('team.empty')}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-2 scrollbar-thin">
          {rows.map((r) => (
            <Link
              key={r.member.id}
              href={`/tasks?tab=list&scope=${encodeURIComponent(`person:${r.member.id}`)}`}
              className="group/row mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl px-3 py-2.5 outline-none transition-colors duration-150 hover:bg-hover/60 focus-visible:bg-hover/60 @min-[36rem]/team:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_9rem]"
            >
              <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5">
                <Avatar name={r.member.full_name} src={r.member.avatar_url} seed={r.member.id} size={34} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-fg">{r.member.full_name}</span>
                  <span className="block truncate text-xs text-fg-subtle">{r.member.title || r.member.email}</span>
                </span>
              </span>
              <span className="col-span-2 col-start-1 row-start-2 flex @min-[36rem]/team:col-span-1 @min-[36rem]/team:col-start-2 @min-[36rem]/team:row-start-1">
                <LoadBar load={{ risk: r.risk, progress: r.progress, rest: r.rest, overdue: r.overdue, blocked: r.blocked }} max={max} className="h-2.5" />
              </span>
              <span className="col-start-2 row-start-1 flex flex-col items-end gap-1 whitespace-nowrap leading-none @min-[36rem]/team:col-start-3">
                <span className="text-[13px] font-semibold tabular-nums text-fg">{t('team.open', { count: r.open })}</span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  {r.risk ? <span className="rounded-[4px] bg-danger-soft px-1 py-px font-semibold text-danger">{t('team.atRisk', { count: r.risk })}</span> : null}
                  <span className="text-fg-subtle">{t('team.closed', { count: r.closed })}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
