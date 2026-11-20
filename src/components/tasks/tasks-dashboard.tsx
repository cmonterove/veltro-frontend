'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { differenceInCalendarDays, format, isToday, parseISO, startOfDay } from 'date-fns'
import { Activity, ArrowRight, CalendarDays, CheckCheck, LayoutGrid, OctagonPause, Users } from 'lucide-react'
import { useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Tooltip } from '@/components/ui/tooltip'
import { LoadBar, LoadLegend, type Load } from '@/components/charts/load-bar'
import type { Counter, ScopeOption } from '@/lib/scope'
import { assigneesOf } from '@/lib/assignees'
import { Skeleton } from '@/components/ui/skeleton'
import type { ApiTaskStats } from '@/lib/api/tareas'
import { useOpenTask } from '@/lib/use-open-task'
import { useDateLocale, toDateKey } from '@/lib/dates'
import { cn, taskRef } from '@/lib/utils'
import { CARD } from '@/components/ui/surface'
import type { TaskRow } from '@/lib/database.types'

type Tab = 'list' | 'calendar'

/** Carga de la API (en riesgo, en curso, resto) con los nombres de la barra. */
const toLoad = (l: { atRisk: number; inProgress: number; rest: number; overdue?: number; blocked?: number }): Load => ({
  risk: l.atRisk,
  progress: l.inProgress,
  rest: l.rest,
  overdue: l.overdue,
  blocked: l.blocked,
})

/**
 * Resumen de las tareas del alcance. De arriba abajo: qué urge (frase y lista accionable), cómo viene el
 * ritmo (cerradas contra nuevas), qué se viene (próximas dos semanas) y dónde está la carga.
 */
export function TasksDashboard({
  tasks,
  stats,
  scope,
  onFilter,
  onTab,
}: {
  tasks: TaskRow[]
  /** cifras del alcance calculadas por la API (GET /v1/tasks/stats de los últimos 14 días) */
  stats: ApiTaskStats | undefined
  scope: ScopeOption
  onFilter: (c: Counter) => void
  onTab: (tab: Tab) => void
}) {
  const t = useTranslations('tasksDashboard')
  const locale = useDateLocale()
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const { open: openTask } = useOpenTask()
  const today = useMemo(() => startOfDay(new Date()), [])
  const todayKey = toDateKey(today)
  const multi = scope.kind !== 'me'
  // Delegadas y Siguiendo no son alguien: la frase cambia («En lo que delegaste hay…»)
  const subject = scope.kind === 'me' ? 'me' : scope.kind === 'delegated' || scope.kind === 'following' ? scope.kind : 'other'

  // listas (lo que se puede abrir): de las tareas cargadas
  const open = useMemo(() => tasks.filter((x) => x.status !== 'done'), [tasks])
  const lateDays = (x: TaskRow) => (x.due_date && x.due_date < todayKey ? differenceInCalendarDays(today, parseISO(x.due_date)) : 0)
  const overdue = open.filter((x) => lateDays(x) > 0).sort((a, b) => lateDays(b) - lateDays(a))
  const blocked = open.filter((x) => x.status === 'blocked')
  const dueToday = open.filter((x) => x.due_date === todayKey)

  // lo que urge: atrasadas (más atrasadas primero), bloqueadas y lo de hoy
  const urgent = [...new Set([...overdue, ...blocked, ...dueToday])]
  // sin nada urgente, lo que sigue: abiertas, primero lo que vence antes (lo sin fecha al final)
  const urgentIds = new Set(urgent.map((x) => x.id))
  // con poco urgente, lo que sigue llena el resto (hasta 5 filas entre las dos listas)
  const next = [...open]
    .filter((x) => !urgentIds.has(x.id))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    .slice(0, Math.max(0, 5 - Math.min(urgent.length, 5)))

  // cifras: de la API
  const c = stats?.counters
  const openCount = c?.open ?? 0
  const total: Load = stats ? toLoad({ ...stats.load, overdue: c!.overdue, blocked: c!.blocked }) : { risk: 0, progress: 0, rest: 0 }
  const doneWeek = c?.done7d ?? 0
  const spaces = stats ? stats.workspaces.filter((w) => w.open > 0).length : 0

  // ritmo: cerradas y nuevas por día, últimos 14 días
  const pace = useMemo(() => (stats?.daily ?? []).map((p) => ({ d: parseISO(p.day), closed: p.closed, created: p.created })), [stats])
  const closed14 = pace.reduce((n, p) => n + p.closed, 0)
  const created14 = pace.reduce((n, p) => n + p.created, 0)
  const maxPace = Math.max(1, ...pace.map((p) => Math.max(p.closed, p.created)))

  // lo que viene: próximas dos semanas (la cifra de la API; los títulos, de la lista)
  const ahead = useMemo(
    () => (stats?.upcoming ?? []).map((u) => ({ d: parseISO(u.day), n: u.due, list: open.filter((x) => x.due_date === u.day) })),
    [stats, open],
  )
  const maxAhead = Math.max(1, ...ahead.map((a) => a.n))

  const bySpace = useMemo(
    () =>
      (stats?.workspaces ?? [])
        .filter((w) => w.open > 0)
        .flatMap((w) => (wsMap.get(w.id) ? [{ ws: wsMap.get(w.id)!, total: w.open, load: toLoad(w) }] : []))
        .sort((a, b) => b.total - a.total),
    [stats, wsMap],
  )
  const byPerson = useMemo(() => {
    if (!multi) return []
    return (stats?.people ?? [])
      .filter((p) => p.open > 0)
      .flatMap((p) => (memberMap.get(p.userId) ? [{ member: memberMap.get(p.userId)!, total: p.open, load: toLoad(p) }] : []))
  }, [stats, memberMap, multi])
  const maxSpace = Math.max(1, ...bySpace.map((s) => s.total))
  const maxPerson = Math.max(1, ...byPerson.map((p) => p.total))

  if (!stats) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 rounded-[22px]" />
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-56 rounded-[24px] lg:col-span-7" />
          <Skeleton className="h-56 rounded-[24px] lg:col-span-5" />
        </div>
      </div>
    )
  }

  // solo se nombra lo que existe: "4 tareas atrasadas y 2 bloqueadas"; cada parte filtra la lista
  const pill = (counter: Counter, tone: string, text: string) => (
    <button key={counter} type="button" onClick={() => onFilter(counter)} className={cn('rounded-md px-0.5 font-semibold underline decoration-2 underline-offset-[5px] transition-colors hover:bg-fg/[0.08]', tone)}>
      {text}
    </button>
  )
  const parts = [
    c!.overdue ? pill('overdue', 'text-danger decoration-danger/40', t('parts.late', { count: c!.overdue })) : null,
    c!.blocked ? pill('blocked', 'text-st-blocked decoration-st-blocked/40', t('parts.stuck', { count: c!.blocked })) : null,
    c!.today ? pill('today', 'text-mandarina-ink decoration-mandarina-ink/40', t('parts.due', { count: c!.today })) : null,
  ].filter(Boolean) as React.ReactElement[]
  const joined = parts.flatMap((p, i) => (i === 0 ? [p] : [i === parts.length - 1 ? ` ${t('and')} ` : ', ', p]))
  const net = closed14 - created14
  const nextList = next.length ? (
      <>
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-fg-muted">
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {t('urgent.next')}
        </p>
        <ul className="-mx-2 mt-1 flex-1">
          {next.map((x) => {
            const ws = wsMap.get(x.workspace_id)
            return (
              <li key={x.id}>
                <button type="button" onClick={() => openTask(x.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-hover/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{x.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                      {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
                      <span className="font-mono">{ws ? taskRef(ws.key, x.number) : ''}</span>
                      {ws ? <span className="truncate">· {ws.name}</span> : null}
                    </span>
                  </span>
                  {x.due_date ? (
                    <span className="shrink-0 rounded-md bg-fg/[0.05] px-1.5 py-0.5 text-xs font-medium text-fg-muted first-letter:uppercase">
                      {format(parseISO(x.due_date), 'EEE d MMM', { locale })}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </>
  ) : null

  return (
    <div className="flex flex-col gap-4 pb-2">
      {/* 1 · la respuesta corta, sobre la ciruela del marco: el estado de las tareas de un vistazo */}
      <section className="on-frame day-surface grid items-center gap-x-10 gap-y-4 rounded-[22px] px-6 py-5 shadow-[0_18px_40px_-24px_oklch(0.3_0.12_312/0.55)] sm:px-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-[20px] font-semibold leading-snug tracking-[-0.02em] text-fg">
            {parts.length ? (
              <>
                {t('subject', { subject, who: scope.display })} {joined}.
              </>
            ) : (
              t('allClear', { subject, who: scope.display })
            )}
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">{t('subline', { open: openCount, spaces, done: doneWeek })}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <LoadBar load={total} max={Math.max(1, openCount)} className="!h-2.5" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <LoadLegend className="text-fg-muted" />
            <span className="ml-auto text-xs font-medium tabular-nums text-fg-muted">{t('loadNumbers', { risk: total.risk, progress: total.progress, rest: total.rest })}</span>
          </div>
        </div>
      </section>

      {/* 2 · qué urge y cómo viene el ritmo: misma altura */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section className={cn(CARD, 'flex flex-col px-5 pb-4 pt-4 lg:col-span-7')}>
          <CardHead icon={urgent.length ? <OctagonPause className="text-danger" /> : <CheckCheck className="text-done" />} title={t('urgent.title')} count={urgent.length || undefined} />
          {urgent.length ? (
            <>
            <ul className="-mx-2 mt-2">
              {urgent.slice(0, 5).map((x) => {
                const late = lateDays(x)
                const ws = wsMap.get(x.workspace_id)
                const people = assigneesOf(x).flatMap((id) => memberMap.get(id) ?? [])
                return (
                  <li key={x.id}>
                    <button type="button" onClick={() => openTask(x.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-hover/60">
                      <span className="flex w-12 shrink-0 flex-col items-center leading-none">
                        {late ? (
                          <span className="flex w-full flex-col items-center rounded-xl bg-danger-soft py-1.5">
                            <span className="text-lg font-semibold tabular-nums text-danger">{late}</span>
                            <span className="mt-0.5 text-2xs font-medium text-danger/80">{t('urgent.days', { count: late })}</span>
                          </span>
                        ) : x.status === 'blocked' ? (
                          <span className="flex w-full flex-col items-center rounded-xl bg-danger-soft/70 py-1.5">
                            <OctagonPause className="size-5 text-st-blocked" />
                            <span className="mt-1 text-2xs font-medium text-st-blocked">{t('urgent.blocked')}</span>
                          </span>
                        ) : (
                          <span className="rounded-lg bg-warning-soft px-1.5 py-1.5 text-2xs font-semibold text-mandarina-ink">{t('urgent.today')}</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{x.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                          {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
                          <span className="font-mono">{ws ? taskRef(ws.key, x.number) : ''}</span>
                          {ws ? <span className="truncate">· {ws.name}</span> : null}
                        </span>
                      </span>
                      {multi ? <AvatarStack people={people} size={22} ring="panel" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
            {/* con poco urgente, lo que sigue llena el resto */}
            {nextList}
            </>
          ) : (
            <>
              {/* la calma, en una línea; debajo, lo que sigue: lo útil en vez de un recuadro vacío */}
              <p className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-success-soft/60 px-3 py-2 text-sm text-fg-muted ring-1 ring-success/10">
                <CheckCheck className="size-4 shrink-0 text-success" strokeWidth={2.25} />
                {t('urgent.empty')}
              </p>
              {nextList}
            </>
          )}
          {urgent.length > 5 ? (
            <button type="button" onClick={() => onTab('list')} className="mt-1 flex items-center gap-1 border-t border-line-soft pt-3 text-xs font-medium text-fg-muted hover:text-fg">
              {t('urgent.more', { count: urgent.length - 5 })}
              <ArrowRight className="size-3" />
            </button>
          ) : null}
        </section>

        <section className={cn(CARD, 'flex flex-col px-5 pb-4 pt-4 lg:col-span-5')}>
          <CardHead icon={<Activity className="text-accent" />} title={t('pace.title')} hint={t('pace.hint')} />
          <div className="mt-4 flex items-end gap-7">
            <Figure value={closed14} label={t('pace.closed')} swatch="var(--chart-closed)" />
            <Figure value={created14} label={t('pace.created')} swatch="var(--chart-new)" />
            <span
              className={cn(
                'mb-0.5 ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums',
                net > 0 ? 'bg-success-soft text-success' : net < 0 ? 'bg-warning-soft text-mandarina-ink' : 'bg-hover text-fg-muted',
              )}
            >
              {t('pace.net', { net: net > 0 ? `+${net}` : String(net) })}
            </span>
          </div>
          {/* el gráfico ocupa el alto que deja la lista de al lado (mínimo 7rem) */}
          <div className="flex max-h-44 min-h-28 flex-1 items-stretch gap-1 pt-4">
            {pace.map((p) => (
              <Tooltip key={p.d.toISOString()} content={t('pace.tip', { when: format(p.d, 'EEE d MMM', { locale }), closed: p.closed, created: p.created })}>
                <span className="group/day flex min-w-0 flex-1 flex-col justify-end rounded-md transition-colors hover:bg-fg/[0.035]" tabIndex={0}>
                  <span className="relative flex flex-1 items-end justify-center gap-[2px]">
                    <Column value={p.closed} max={maxPace} color="var(--chart-closed)" />
                    <Column value={p.created} max={maxPace} color="var(--chart-new)" />
                  </span>
                  <span className={cn('mt-1.5 text-center text-2xs tabular-nums', isToday(p.d) ? 'font-semibold text-fg' : 'text-fg-subtle')}>{format(p.d, 'd')}</span>
                </span>
              </Tooltip>
            ))}
          </div>
        </section>
      </div>

      {/* 3 · lo que viene */}
      <section className={cn(CARD, 'px-5 pb-5 pt-4')}>
        <CardHead
          icon={<CalendarDays className="text-mandarina-ink" />}
          title={t('ahead.title')}
          hint={t('ahead.hint')}
          aside={
            <button type="button" onClick={() => onTab('calendar')} className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
              {t('ahead.open')}
              <ArrowRight className="size-3" />
            </button>
          }
        />
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-14">
          {ahead.map(({ d, n, list }) => {
            const strength = n / maxAhead
            const tip = n
              ? [format(d, 'EEE d MMM', { locale }), ...list.slice(0, 4).map((x) => `· ${x.title}`), ...(n > 4 ? [t('ahead.more', { count: n - 4 })] : [])].join('\n')
              : format(d, 'EEE d MMM', { locale })
            return (
              <Tooltip key={d.toISOString()} content={<span className="block max-w-64 whitespace-pre-line text-left font-normal leading-snug">{tip}</span>}>
                <button type="button" onClick={() => onTab('calendar')} className="flex flex-col items-stretch gap-1 text-left">
                  <span className={cn('text-center text-2xs font-semibold uppercase', isToday(d) ? 'text-accent-ink' : 'text-fg-subtle')}>{format(d, 'EEEEEE', { locale })}</span>
                  <span
                    className={cn(
                      'flex h-12 items-center justify-center rounded-xl text-sm font-semibold tabular-nums transition-transform duration-150 ease-out hover:-translate-y-0.5',
                      isToday(d) && 'ring-2 ring-accent ring-offset-2 ring-offset-panel',
                      strength > 0.5 ? 'text-accent-fg' : n ? 'text-fg' : 'text-fg-subtle',
                    )}
                    style={{ background: n ? `color-mix(in oklch, var(--chart-bar) ${Math.round(22 + strength * 78)}%, var(--chart-track))` : 'var(--chart-track)' }}
                  >
                    {n || ''}
                  </span>
                  <span className="text-center text-2xs tabular-nums text-fg-subtle">{format(d, 'd MMM', { locale })}</span>
                </button>
              </Tooltip>
            )
          })}
        </div>
      </section>

      {/* 4 · dónde está la carga */}
      <div className="grid gap-4 lg:grid-cols-2">
        <LoadList
          title={t('bySpace')}
          icon={<LayoutGrid className="text-accent" />}
          className={multi ? undefined : 'lg:col-span-2'}
          rows={bySpace.map((s) => ({
            key: s.ws.id,
            label: s.ws.name,
            icon: <WorkspaceMark ws={s.ws} size={22} />,
            load: s.load,
            total: s.total,
            href: `/w/${s.ws.slug}/tasks`,
          }))}
          max={maxSpace}
          empty={t('nothingOpen')}
        />
        {multi ? (
          <LoadList
            title={t('byPerson')}
            icon={<Users className="text-accent" />}
            rows={byPerson.map((p) => ({
              key: p.member.id,
              label: p.member.full_name,
              icon: <Avatar name={p.member.full_name} src={p.member.avatar_url} seed={p.member.id} size={24} />,
              load: p.load,
              total: p.total,
              href: `/tasks?tab=list&scope=${encodeURIComponent(`person:${p.member.id}`)}`,
            }))}
            max={maxPerson}
            empty={t('nothingOpen')}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Encabezado dentro de una tarjeta: ícono, título con su cuenta, una línea que explica y algo a la derecha. */
function CardHead({ icon, title, count, hint, aside }: { icon?: React.ReactNode; title: string; count?: number; hint?: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
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
        {hint ? <p className="mt-0.5 text-xs text-fg-muted">{hint}</p> : null}
      </div>
      {aside}
    </div>
  )
}

function Figure({ value, label, swatch }: { value: number; label: string; swatch: string }) {
  return (
    <span className="flex flex-col">
      <span className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        <span className="size-2.5 rounded-[3px]" style={{ background: swatch }} />
        {label}
      </span>
      <span className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-fg">{value}</span>
    </span>
  )
}

function Column({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span
      className={cn('w-full max-w-3', value ? 'rounded-t-[4px] rounded-b-[1px]' : 'rounded-[1px]')}
      style={{ height: value ? `${Math.max(8, (value / max) * 100)}%` : 3, background: value ? color : 'var(--chart-track)' }}
    />
  )
}

function LoadList({
  title,
  icon,
  rows,
  max,
  empty,
  className,
}: {
  title: string
  icon: React.ReactNode
  rows: { key: string; label: string; icon: React.ReactNode; load: Load; total: number; href: string }[]
  max: number
  empty: string
  className?: string
}) {
  const t = useTranslations('tasksDashboard')
  return (
    <section className={cn(CARD, 'px-5 pb-4 pt-4', className)}>
      <CardHead icon={icon} title={title} count={rows.length || undefined} aside={<LoadLegend />} />
      {rows.length ? (
        <ul className="-mx-2 mt-3 flex flex-col">
          {rows.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-2 py-2.5 transition-colors hover:bg-hover/60">
                <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-fg">
                  {r.icon}
                  <span className="truncate">{r.label}</span>
                </span>
                <LoadBar load={r.load} max={max} className="h-2.5" />
                <span className="w-24 text-right text-xs tabular-nums text-fg-muted">
                  <span className="text-sm font-semibold text-fg">{r.total}</span>
                  {r.load.risk ? <span className="ml-1.5 rounded-[4px] bg-danger-soft px-1 py-px font-semibold text-danger">{t('riskShort', { count: r.load.risk })}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-fg-muted">{empty}</p>
      )}
    </section>
  )
}
