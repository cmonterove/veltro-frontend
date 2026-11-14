'use client'

import Link from 'next/link'
import { Fragment, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns'
import { ArrowDownRight, ArrowUpRight, ChevronDown, CircleAlert, CircleCheck, Info, Minus, OctagonAlert } from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { ScopeMenu, ScopePeople } from '@/components/app/scope-menu'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { DateRangePicker, formatRange, rangeBuckets, resolveRange, type DateRangeValue } from '@/components/ui/date-range-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
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

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col px-4 pb-16 pt-7 sm:px-8">
      <header>
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg">{t('title')}</h1>
        <p className="mt-1 text-[13px] text-fg-muted">{t('subtitle')}</p>
      </header>

      {/* filtros: una fila, arriba de todo lo que acotan */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DateRangePicker value={rangeValue} onChange={setRangeValue} />
        <ScopeMenu options={options} value={scope} onChange={setScopeId} />
        <ScopePeople scope={scope} />
      </div>

      {statsQuery.isError ? (
        <ErrorState onRetry={() => statsQuery.refetch()} className="mt-4" />
      ) : !data ? (
        <div className="mt-6 flex flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-4 h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          {/* la respuesta corta, en una frase: cada cifra con el color de lo que cuenta */}
          <p className="mt-6 max-w-[70ch] text-[15px] leading-[1.65] text-fg">
            {t.rich('sentence', {
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
            })}
          </p>

          <SpacesTable stats={stats} scope={scope} range={range} now={now} />
          <TeamLoad people={data.people} />
        </>
      )}
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

/** Título de sección con su cuenta y, si hace falta, una línea que explica qué se ve. */
function SectionHead({ title, count, hint, aside }: { title: string; count?: number; hint?: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-end gap-x-6 gap-y-2">
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-fg">
          {title}
          {count != null ? <span className="rounded-full bg-hover px-1.5 text-[11px] font-medium leading-[18px] tabular-nums text-fg-muted">{count}</span> : null}
        </h2>
        {hint ? <p className="mt-0.5 text-xs text-fg-muted">{hint}</p> : null}
      </div>
      {aside}
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

// las columnas siguen el ancho de la tabla (no el de la ventana): con el menú abierto o cerrado
const COLS =
  'grid-cols-[minmax(0,1fr)_auto_3rem] @xl:grid-cols-[minmax(0,1fr)_6.5rem_3.5rem_4.5rem_3.5rem_1rem] @4xl:grid-cols-[minmax(10rem,1.4fr)_6.5rem_minmax(10rem,1.1fr)_3.5rem_4.5rem_3.5rem_1rem]'
const HEAD = 'text-[10.5px] font-medium uppercase tracking-[0.07em] text-fg-subtle'

function SpacesTable({ stats, scope, range, now }: { stats: SpaceStat[]; scope: ScopeOption; range: { from: Date; end: Date; buckets: Bucket[] }; now: Date }) {
  const t = useTranslations('mesa')
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className="mt-8">
      <SectionHead title={t('spaces.title')} count={stats.length} />
      {stats.length === 0 ? (
        <p className="rounded-xl bg-panel px-5 py-6 text-sm text-fg-muted shadow-card">{t('spaces.empty')}</p>
      ) : (
        <div className="@container overflow-hidden rounded-xl bg-panel shadow-card">
          <div className={cn('grid items-center gap-x-4 border-b border-line-soft px-4 py-2', HEAD, COLS)}>
            <span>{t('spaces.space')}</span>
            <span className="flex items-center gap-1">
              {t('spaces.health')}
              <Tooltip content={<span className="block max-w-64 whitespace-normal font-normal normal-case tracking-normal leading-snug">{t('spaces.healthHelp', { days: RISK_DAYS, count: RISK_COUNT })}</span>}>
                <button type="button" className="rounded-sm text-fg-subtle outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/35" aria-label={t('spaces.healthHelpLabel')}>
                  <Info className="size-3" />
                </button>
              </Tooltip>
            </span>
            <span className="hidden @4xl:block">{t('spaces.progress')}</span>
            <span className="text-right">{t('spaces.open')}</span>
            <span className="hidden text-right @xl:block">{t('spaces.overdue')}</span>
            <span className="hidden text-right @xl:block">{t('spaces.blocked')}</span>
            <span className="hidden @xl:block" />
          </div>
          {stats.map((s) => {
            const expanded = openId === s.ws.id
            return (
              <Fragment key={s.ws.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? null : s.ws.id)}
                  aria-expanded={expanded}
                  className={cn(
                    'group/row grid w-full items-center gap-x-4 border-b border-line-soft px-4 py-2.5 text-left outline-none transition-colors duration-150 last:border-0 hover:bg-hover/45 focus-visible:bg-hover/45',
                    COLS,
                    expanded && 'bg-hover/45',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <WorkspaceMark ws={s.ws} size={26} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-fg">{s.ws.name}</span>
                      <span className="block font-mono text-[10.5px] leading-tight text-fg-subtle">{s.ws.key}</span>
                    </span>
                  </span>
                  <HealthBadge health={s.health} />
                  <span className="hidden items-center gap-3 @4xl:flex">
                    <MiniColumns values={s.buckets} buckets={range.buckets} now={now} />
                    <NetChange closed={s.closed} created={s.created} />
                  </span>
                  <span className="text-right text-[13.5px] font-medium tabular-nums text-fg">{s.open}</span>
                  <Count n={s.overdue} tone="late" className="hidden @xl:flex" />
                  <Count n={s.blocked} tone="stuck" className="hidden @xl:flex" />
                  <ChevronDown
                    className={cn('hidden size-3.5 text-fg-subtle transition-[transform,color] duration-200 ease-out group-hover/row:text-fg-muted @xl:block', expanded && 'rotate-180 text-fg-muted')}
                  />
                </button>
                {expanded ? <SpaceDetail stat={s} scope={scope} now={now} /> : null}
              </Fragment>
            )
          })}
        </div>
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
        'inline-flex w-fit items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2 text-[11.5px] font-semibold',
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
                style={{ height: future ? 3 : v ? Math.max(4, Math.round((v / max) * 24)) : 3, background: future || !v ? 'var(--chart-track)' : 'var(--done)' }}
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
    <span className="min-w-0 leading-tight">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-[5px] px-1 py-px text-xs font-semibold tabular-nums',
          net > 0 ? 'bg-success-soft text-success' : net < 0 ? 'bg-warning-soft text-mandarina-ink' : 'bg-hover text-fg-muted',
        )}
      >
        {/* la flecha es el pendiente: baja si se cierra más de lo que entra */}
        <Arrow className="size-3" strokeWidth={2.5} />
        {net > 0 ? `+${net}` : net}
      </span>
      <span className="mt-0.5 block truncate text-[10.5px] text-fg-subtle">{t('closedVsNew', { closed, created })}</span>
    </span>
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
    <div className="grid animate-in gap-8 border-b border-line-soft bg-canvas/60 px-4 py-4 fade-in-0 last:border-0 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] sm:pl-[52px]">
      <div className="min-w-0">
        <p className={cn('mb-2.5', HEAD)}>{t('detail.risks')}</p>
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
        <p className={cn('mb-2.5', HEAD)}>{t('detail.load')}</p>
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
    <section className="mt-9">
      {/* leyenda: siempre visible, la identidad nunca depende solo del color */}
      <SectionHead title={t('team.title')} count={rows.length} hint={t('team.hint')} aside={<LoadLegend />} />
      {rows.length === 0 ? (
        <p className="rounded-xl bg-panel px-5 py-6 text-sm text-fg-muted shadow-card">{t('team.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-panel shadow-card">
          {rows.map((r) => (
            <Link
              key={r.member.id}
              href={`/tasks?tab=list&scope=${encodeURIComponent(`person:${r.member.id}`)}`}
              className="group/row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-line-soft px-4 py-2.5 outline-none transition-colors duration-150 last:border-0 hover:bg-hover/45 focus-visible:bg-hover/45 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_10rem]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={r.member.full_name} src={r.member.avatar_url} seed={r.member.id} size={26} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-fg">{r.member.full_name}</span>
                  <span className="block truncate text-xs text-fg-subtle">{r.member.title || r.member.email}</span>
                </span>
              </span>
              <span className="col-span-2 row-start-2 flex sm:col-span-1 sm:row-start-auto">
                <LoadBar load={{ risk: r.risk, progress: r.progress, rest: r.rest, overdue: r.overdue, blocked: r.blocked }} max={max} />
              </span>
              <span className="row-start-1 flex flex-col items-end gap-1 whitespace-nowrap leading-none sm:row-start-auto">
                <span className="text-[13px] font-medium tabular-nums text-fg">{t('team.open', { count: r.open })}</span>
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
