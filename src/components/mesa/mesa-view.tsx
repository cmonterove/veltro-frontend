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
import { ArrowUpRight, ChevronDown, CircleAlert, CircleCheck, Info, OctagonAlert } from 'lucide-react'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { ScopeMenu, ScopePeople } from '@/components/app/scope-menu'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { DateRangePicker, formatRange, rangeBuckets, resolveRange, type DateRangeValue } from '@/components/ui/date-range-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { Tooltip } from '@/components/ui/tooltip'
import { StatusIcon } from '@/components/tasks/status-icon'
import { useTasks } from '@/lib/queries/tasks'
import { useLocalStorage, useNow } from '@/lib/hooks'
import { useScopes, type ScopeOption } from '@/lib/scope'
import { assigneesOf, isAssignedTo } from '@/lib/assignees'
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

const inRange = (iso: string | null | undefined, from: Date, to: Date) => {
  if (!iso) return false
  const d = new Date(iso)
  return d >= from && d < to
}


const NO_TASKS: TaskRow[] = []
export function MesaView() {
  const t = useTranslations('mesa')
  const { workspaces, observedWorkspaces, accountRole } = useApp()
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

  const spaces = useMemo(() => [...workspaces, ...observedWorkspaces], [workspaces, observedWorkspaces])
  const wsIds = useMemo(() => spaces.map((w) => w.id), [spaces])
  const tasksQuery = useTasks({ kind: 'workspaces', workspaceIds: wsIds })
  const tasks = wsIds.length ? tasksQuery.data : NO_TASKS

  // "Toda la empresa" incluye lo que no tiene responsable; los demás alcances, lo asignado a esas personas
  const scoped = useMemo(() => (tasks ?? []).filter((x) => scope.kind === 'all' || isAssignedTo(x, scope.userIds)), [tasks, scope])
  const todayKey = toDateKey(now)
  const lateDays = (x: TaskRow) => (x.due_date && x.due_date < todayKey ? differenceInCalendarDays(now, parseISO(x.due_date)) : 0)

  const stats = useMemo(() => {
    return spaces
      .map((ws) => {
        const mine = scoped.filter((x) => x.workspace_id === ws.id)
        const open = mine.filter((x) => x.status !== 'done')
        const overdue = open.filter((x) => lateDays(x) > 0)
        const blocked = open.filter((x) => x.status === 'blocked')
        const risky = [...new Set([...overdue, ...blocked])].sort((a, b) => lateDays(b) - lateDays(a) || (a.status === 'blocked' ? -1 : 1))
        const oldest = overdue.reduce((m, x) => Math.max(m, lateDays(x)), 0)
        const health: Health = oldest > RISK_DAYS || risky.length >= RISK_COUNT ? 'risk' : risky.length ? 'attention' : 'ok'
        const closed = mine.filter((x) => x.status === 'done' && inRange(x.completed_at, range.from, range.end))
        const created = mine.filter((x) => inRange(x.created_at, range.from, range.end))
        const buckets = range.buckets.map((b) => closed.filter((x) => inRange(x.completed_at, b.start, b.end)).length)
        return { ws, open, overdue, blocked, risky, oldest, health, closed: closed.length, created: created.length, buckets, touched: mine.length > 0 }
      })
      .filter((s) => scope.kind === 'all' || s.touched)
      .sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || b.risky.length - a.risky.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces, scoped, range, scope.kind, todayKey])

  const totals = stats.reduce(
    (acc, s) => ({
      closed: acc.closed + s.closed,
      created: acc.created + s.created,
      overdue: acc.overdue + s.overdue.length,
      blocked: acc.blocked + s.blocked.length,
      atRisk: acc.atRisk + (s.health === 'risk' ? 1 : 0),
    }),
    { closed: 0, created: 0, overdue: 0, blocked: 0, atRisk: 0 },
  )
  const periodLabel = range.preset ? tr(`presets.${range.preset}`) : formatRange(range, locale, now)

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 pb-16 pt-8 sm:px-8">
      <header>
        <h1 className="font-brand text-[28px] font-semibold leading-tight tracking-[-0.03em]">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('subtitle')}</p>
      </header>

      {/* filtros: una fila, arriba de todo lo que acotan */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <DateRangePicker value={rangeValue} onChange={setRangeValue} />
        <ScopeMenu options={options} value={scope} onChange={setScopeId} />
        <ScopePeople scope={scope} />
      </div>

      {tasksQuery.isError ? (
        <ErrorState onRetry={() => tasksQuery.refetch()} className="mt-4" />
      ) : !tasks ? (
        <div className="mt-8 flex flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-4 h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          {/* la respuesta corta, en una frase */}
          <p className="mt-6 max-w-[75ch] text-[15px] leading-relaxed text-fg">
            {t('sentence', {
              period: periodLabel,
              closed: totals.closed,
              created: totals.created,
              overdue: totals.overdue,
              blocked: totals.blocked,
              atRisk: totals.atRisk,
              problems: totals.overdue + totals.blocked ? 'some' : 'none',
            })}
          </p>

          <SpacesTable stats={stats} range={range} now={now} lateDays={lateDays} />
          <TeamLoad scope={scope} tasks={scoped} range={range} lateDays={lateDays} />
        </>
      )}
    </div>
  )
}

const HEALTH_ORDER: Record<Health, number> = { risk: 0, attention: 1, ok: 2 }

// ---------------- espacios ----------------

type SpaceStat = {
  ws: WorkspaceWithRole
  open: TaskRow[]
  overdue: TaskRow[]
  blocked: TaskRow[]
  risky: TaskRow[]
  oldest: number
  health: Health
  closed: number
  created: number
  buckets: number[]
}

const COLS = 'grid-cols-[minmax(0,1fr)_7.5rem_3.5rem] sm:grid-cols-[minmax(0,1.6fr)_8.5rem_minmax(9rem,1fr)_4.5rem_4.5rem_4.5rem_1.5rem]'

function SpacesTable({ stats, range, now, lateDays }: { stats: SpaceStat[]; range: { from: Date; end: Date; buckets: Bucket[] }; now: Date; lateDays: (x: TaskRow) => number }) {
  const t = useTranslations('mesa')
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-fg">{t('spaces.title')}</h2>
      {stats.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel px-5 py-6 text-sm text-fg-muted">{t('spaces.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className={cn('grid items-center gap-x-4 border-b border-line px-5 py-2.5 text-xs font-medium text-fg-subtle', COLS)}>
            <span>{t('spaces.space')}</span>
            <span className="flex items-center gap-1">
              {t('spaces.health')}
              <Tooltip content={<span className="block max-w-64 whitespace-normal font-normal leading-snug">{t('spaces.healthHelp', { days: RISK_DAYS, count: RISK_COUNT })}</span>}>
                <button type="button" className="text-fg-subtle hover:text-fg" aria-label={t('spaces.healthHelpLabel')}>
                  <Info className="size-3.5" />
                </button>
              </Tooltip>
            </span>
            <span className="hidden sm:block">{t('spaces.progress')}</span>
            <span className="text-right">{t('spaces.open')}</span>
            <span className="hidden text-right sm:block">{t('spaces.overdue')}</span>
            <span className="hidden text-right sm:block">{t('spaces.blocked')}</span>
            <span className="hidden sm:block" />
          </div>
          {stats.map((s) => {
            const expanded = openId === s.ws.id
            return (
              <Fragment key={s.ws.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? null : s.ws.id)}
                  aria-expanded={expanded}
                  className={cn('grid w-full items-center gap-x-4 border-b border-line-soft px-5 py-3 text-left transition-colors last:border-0 hover:bg-hover/40', COLS, expanded && 'bg-hover/40')}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <WorkspaceMark ws={s.ws} size={28} />
                    <span className="truncate text-sm font-medium text-fg">{s.ws.name}</span>
                  </span>
                  <HealthBadge health={s.health} />
                  <span className="hidden items-center gap-3 sm:flex">
                    <MiniColumns values={s.buckets} buckets={range.buckets} now={now} />
                    <NetChange closed={s.closed} created={s.created} />
                  </span>
                  <span className="text-right text-sm tabular-nums text-fg">{s.open.length}</span>
                  <span className={cn('hidden text-right text-sm tabular-nums sm:block', s.overdue.length ? 'font-medium text-danger' : 'text-fg-subtle')}>{s.overdue.length}</span>
                  <span className={cn('hidden text-right text-sm tabular-nums sm:block', s.blocked.length ? 'font-medium text-danger' : 'text-fg-subtle')}>{s.blocked.length}</span>
                  <ChevronDown className={cn('hidden size-4 text-fg-subtle transition-transform sm:block', expanded && 'rotate-180')} />
                </button>
                {expanded ? <SpaceDetail stat={s} lateDays={lateDays} /> : null}
              </Fragment>
            )
          })}
        </div>
      )}
    </section>
  )
}

function HealthBadge({ health }: { health: Health }) {
  const t = useTranslations('mesa.health')
  const Icon = health === 'risk' ? OctagonAlert : health === 'attention' ? CircleAlert : CircleCheck
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        health === 'risk' ? 'bg-danger-soft text-danger' : health === 'attention' ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success',
      )}
    >
      <Icon className="size-3.5" />
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
    <span className="flex h-6 shrink-0 items-end gap-[2px]" aria-hidden>
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
            <span className="flex h-6 w-[7px] items-end">
              <span
                className={cn('w-full', v ? 'rounded-t-[2px]' : '')}
                style={{ height: future ? 2 : v ? Math.max(3, Math.round((v / max) * 24)) : 2, background: future || !v ? 'var(--chart-track)' : 'var(--chart-bar)' }}
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
  return (
    <span className="min-w-0 leading-tight">
      <span className={cn('block text-sm font-medium tabular-nums', net > 0 ? 'text-success' : net < 0 ? 'text-warning' : 'text-fg-muted')}>
        {net > 0 ? `+${net}` : net}
      </span>
      <span className="block truncate text-2xs text-fg-subtle">{t('closedVsNew', { closed, created })}</span>
    </span>
  )
}

function SpaceDetail({ stat, lateDays }: { stat: SpaceStat; lateDays: (x: TaskRow) => number }) {
  const t = useTranslations('mesa')
  const memberMap = useMemberMap()
  const { open } = useOpenTask()
  // quién carga este espacio: tareas abiertas por responsable
  const load = useMemo(() => {
    const m = new Map<string, number>()
    stat.open.forEach((x) => assigneesOf(x).forEach((id) => m.set(id, (m.get(id) ?? 0) + 1)))
    return [...m]
      .map(([id, n]) => ({ member: memberMap.get(id), n }))
      .filter((x): x is { member: Member; n: number } => Boolean(x.member))
      .sort((a, b) => b.n - a.n)
  }, [stat.open, memberMap])

  return (
    <div className="grid gap-6 border-b border-line-soft bg-sidebar/40 px-5 py-5 last:border-0 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-fg-subtle">{t('detail.risks')}</p>
        {stat.risky.length ? (
          <ul className="flex flex-col">
            {stat.risky.slice(0, 6).map((x) => {
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
            {stat.risky.length > 6 ? <li className="pt-1 text-xs text-fg-subtle">{t('detail.more', { count: stat.risky.length - 6 })}</li> : null}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t('detail.noRisks')}</p>
        )}
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-fg-subtle">{t('detail.load')}</p>
        {load.length ? (
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

function TeamLoad({ scope, tasks, range, lateDays }: { scope: ScopeOption; tasks: TaskRow[]; range: { from: Date; end: Date }; lateDays: (x: TaskRow) => number }) {
  const t = useTranslations('mesa')
  const memberMap = useMemberMap()

  const rows = useMemo(() => {
    const ids = scope.kind === 'all' ? [...memberMap.keys()] : [...scope.userIds]
    return ids
      .flatMap((id) => {
        const member = memberMap.get(id)
        if (!member) return []
        const theirs = tasks.filter((x) => assigneesOf(x).includes(id))
        const open = theirs.filter((x) => x.status !== 'done')
        const overdue = open.filter((x) => lateDays(x) > 0).length
        const blocked = open.filter((x) => x.status === 'blocked').length
        const risk = open.filter((x) => lateDays(x) > 0 || x.status === 'blocked').length
        const progress = open.filter((x) => x.status === 'in_progress' && !(lateDays(x) > 0)).length
        const closed = theirs.filter((x) => x.status === 'done' && inRange(x.completed_at, range.from, range.end)).length
        return open.length || closed ? [{ member, open: open.length, risk, progress, rest: open.length - risk - progress, overdue, blocked, closed }] : []
      })
      .sort((a, b) => b.risk - a.risk || b.open - a.open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, tasks, memberMap, range])
  const max = Math.max(1, ...rows.map((r) => r.open))

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">{t('team.title')}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">{t('team.hint')}</p>
        </div>
        {/* leyenda: siempre visible, la identidad nunca depende solo del color */}
        <LoadLegend />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel px-5 py-6 text-sm text-fg-muted">{t('team.empty')}</p>
      ) : (
        <div className="divide-y divide-line-soft rounded-xl border border-line bg-panel">
          {rows.map((r) => (
            <Link
              key={r.member.id}
              href={`/tasks?tab=list&scope=${encodeURIComponent(`person:${r.member.id}`)}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-hover/40 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_9rem]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={r.member.full_name} src={r.member.avatar_url} seed={r.member.id} size={26} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{r.member.full_name}</span>
                  <span className="block truncate text-xs text-fg-subtle">{r.member.title || r.member.email}</span>
                </span>
              </span>
              <span className="col-span-2 row-start-2 flex sm:col-span-1 sm:row-start-auto">
                <LoadBar load={{ risk: r.risk, progress: r.progress, rest: r.rest, overdue: r.overdue, blocked: r.blocked }} max={max} />
              </span>
              <span className="row-start-1 text-right text-xs leading-tight sm:row-start-auto">
                <span className="block text-sm tabular-nums text-fg">
                  {t('team.open', { count: r.open })}
                  {r.risk ? <span className="ml-1.5 font-medium text-danger">{t('team.atRisk', { count: r.risk })}</span> : null}
                </span>
                <span className="block text-fg-subtle">{t('team.closed', { count: r.closed })}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
