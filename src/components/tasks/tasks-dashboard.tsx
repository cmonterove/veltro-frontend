'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { addDays, differenceInCalendarDays, format, isToday, parseISO, startOfDay } from 'date-fns'
import { ArrowRight, CheckCheck, OctagonPause } from 'lucide-react'
import { useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Tooltip } from '@/components/ui/tooltip'
import { LoadBar, LoadLegend, type Load } from '@/components/charts/load-bar'
import type { Counter, ScopeOption } from '@/lib/scope'
import { assigneesOf } from '@/lib/assignees'
import { useOpenTask } from '@/lib/use-open-task'
import { useDateLocale, toDateKey } from '@/lib/dates'
import { cn, taskRef } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'

type Tab = 'list' | 'calendar'

/**
 * Resumen de las tareas del alcance. De arriba abajo: qué urge (frase y lista accionable), cómo viene el
 * ritmo (cerradas contra nuevas), qué se viene (próximas dos semanas) y dónde está la carga.
 */
export function TasksDashboard({
  tasks,
  scope,
  onFilter,
  onTab,
}: {
  tasks: TaskRow[]
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

  const open = useMemo(() => tasks.filter((x) => x.status !== 'done'), [tasks])
  const lateDays = (x: TaskRow) => (x.due_date && x.due_date < todayKey ? differenceInCalendarDays(today, parseISO(x.due_date)) : 0)
  const overdue = open.filter((x) => lateDays(x) > 0).sort((a, b) => lateDays(b) - lateDays(a))
  const blocked = open.filter((x) => x.status === 'blocked')
  const dueToday = open.filter((x) => x.due_date === todayKey)
  const doneWeek = tasks.filter((x) => x.status === 'done' && x.completed_at && new Date(x.completed_at) >= addDays(today, -6)).length
  const spaces = new Set(open.map((x) => x.workspace_id)).size

  const loadOf = (list: TaskRow[]): Load => {
    const risky = list.filter((x) => lateDays(x) > 0 || x.status === 'blocked')
    const progress = list.filter((x) => x.status === 'in_progress' && !risky.includes(x)).length
    return {
      risk: risky.length,
      progress,
      rest: list.length - risky.length - progress,
      overdue: list.filter((x) => lateDays(x) > 0).length,
      blocked: list.filter((x) => x.status === 'blocked').length,
    }
  }
  const total = loadOf(open)

  // lo que urge: atrasadas (más atrasadas primero), bloqueadas y lo de hoy
  const urgent = [...new Set([...overdue, ...blocked, ...dueToday])]

  // ritmo: cerradas y nuevas por día, últimos 14 días
  const pace = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = addDays(today, i - 13)
        const key = toDateKey(d)
        return {
          d,
          closed: tasks.filter((x) => x.completed_at && toDateKey(new Date(x.completed_at)) === key).length,
          created: tasks.filter((x) => toDateKey(new Date(x.created_at)) === key).length,
        }
      }),
    [tasks, today],
  )
  const closed14 = pace.reduce((n, p) => n + p.closed, 0)
  const created14 = pace.reduce((n, p) => n + p.created, 0)
  const maxPace = Math.max(1, ...pace.map((p) => Math.max(p.closed, p.created)))

  // lo que viene: próximas dos semanas
  const ahead = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = addDays(today, i)
        const key = toDateKey(d)
        return { d, list: open.filter((x) => x.due_date === key) }
      }),
    [open, today],
  )
  const maxAhead = Math.max(1, ...ahead.map((a) => a.list.length))

  const bySpace = useMemo(() => {
    const m = new Map<string, TaskRow[]>()
    open.forEach((x) => m.set(x.workspace_id, [...(m.get(x.workspace_id) ?? []), x]))
    return [...m].flatMap(([id, list]) => (wsMap.get(id) ? [{ ws: wsMap.get(id)!, list, load: loadOf(list) }] : [])).sort((a, b) => b.list.length - a.list.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wsMap, todayKey])
  const byPerson = useMemo(() => {
    if (!multi) return []
    const m = new Map<string, TaskRow[]>()
    open.forEach((x) =>
      assigneesOf(x).forEach((id) => {
        if (scope.kind === 'all' || scope.userIds.has(id)) m.set(id, [...(m.get(id) ?? []), x])
      }),
    )
    return [...m]
      .flatMap(([id, list]) => (memberMap.get(id) ? [{ member: memberMap.get(id)!, list, load: loadOf(list) }] : []))
      .sort((a, b) => b.load.risk - a.load.risk || b.list.length - a.list.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberMap, scope, multi, todayKey])
  const maxSpace = Math.max(1, ...bySpace.map((s) => s.list.length))
  const maxPerson = Math.max(1, ...byPerson.map((p) => p.list.length))

  // solo se nombra lo que existe: "4 tareas atrasadas y 2 bloqueadas"; cada parte filtra la lista
  const pill = (counter: Counter, tone: string, text: string) => (
    <button key={counter} type="button" onClick={() => onFilter(counter)} className={cn('rounded-md px-0.5 font-semibold underline decoration-2 underline-offset-4 transition-colors hover:bg-hover', tone)}>
      {text}
    </button>
  )
  const parts = [
    overdue.length ? pill('overdue', 'text-danger decoration-danger/30', t('parts.late', { count: overdue.length })) : null,
    blocked.length ? pill('blocked', 'text-st-blocked decoration-st-blocked/30', t('parts.stuck', { count: blocked.length })) : null,
    dueToday.length ? pill('today', 'text-mandarina-ink decoration-mandarina/40', t('parts.due', { count: dueToday.length })) : null,
  ].filter(Boolean) as React.ReactElement[]
  const joined = parts.flatMap((p, i) => (i === 0 ? [p] : [i === parts.length - 1 ? ` ${t('and')} ` : ', ', p]))
  const net = closed14 - created14

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-8 sm:px-6">
      {/* 1 · la respuesta corta */}
      <section>
        <p className="max-w-[60ch] text-[22px] font-medium leading-snug tracking-[-0.01em] text-fg">
          {parts.length ? (
            <>
              {t('subject', { subject: multi ? 'other' : 'me', who: scope.display })} {joined}.
            </>
          ) : (
            t('allClear', { subject: multi ? 'other' : 'me', who: scope.display })
          )}
        </p>
        <p className="mt-2 text-sm text-fg-muted">{t('subline', { open: open.length, spaces, done: doneWeek })}</p>

        <div className="mt-6 flex flex-col gap-2.5">
          <LoadBar load={total} max={Math.max(1, open.length)} className="!h-3.5" />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <LoadLegend />
            <span className="ml-auto text-xs tabular-nums text-fg-muted">{t('loadNumbers', { risk: total.risk, progress: total.progress, rest: total.rest })}</span>
          </div>
        </div>
      </section>

      {/* 2 · qué urge y cómo viene el ritmo */}
      <div className="mt-10 grid gap-4 lg:grid-cols-12">
        <section className="flex flex-col rounded-xl border border-line bg-panel lg:col-span-7">
          <header className="flex items-baseline gap-2 px-5 pb-2 pt-4">
            <h2 className="text-sm font-semibold text-fg">{t('urgent.title')}</h2>
            {urgent.length ? <span className="text-xs tabular-nums text-fg-subtle">{urgent.length}</span> : null}
          </header>
          {urgent.length ? (
            <ul className="flex-1 px-2 pb-2">
              {urgent.slice(0, 5).map((x) => {
                const late = lateDays(x)
                const ws = wsMap.get(x.workspace_id)
                const people = assigneesOf(x).flatMap((id) => memberMap.get(id) ?? [])
                return (
                  <li key={x.id}>
                    <button type="button" onClick={() => openTask(x.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-hover/60">
                      <span className="flex w-11 shrink-0 flex-col items-center leading-none">
                        {late ? (
                          <>
                            <span className="text-lg font-semibold text-danger">{late}</span>
                            <span className="mt-0.5 text-2xs text-fg-subtle">{t('urgent.days', { count: late })}</span>
                          </>
                        ) : x.status === 'blocked' ? (
                          <>
                            <OctagonPause className="size-5 text-st-blocked" />
                            <span className="mt-1 text-2xs text-fg-subtle">{t('urgent.blocked')}</span>
                          </>
                        ) : (
                          <span className="rounded-md bg-warning-soft px-1.5 py-1 text-2xs font-semibold text-mandarina-ink">{t('urgent.today')}</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{x.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                          {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
                          <span className="font-mono">{ws ? taskRef(ws.key, x.number) : ''}</span>
                          {ws ? <span className="truncate">· {ws.name}</span> : null}
                        </span>
                      </span>
                      {multi ? <AvatarStack people={people} size={20} ring="panel" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="flex flex-1 items-center gap-2.5 px-5 pb-6 pt-2 text-sm text-fg-muted">
              <CheckCheck className="size-4 text-success" />
              {t('urgent.empty')}
            </p>
          )}
          {urgent.length > 5 ? (
            <button type="button" onClick={() => onTab('list')} className="flex items-center gap-1 border-t border-line-soft px-5 py-2.5 text-xs text-fg-muted hover:text-fg">
              {t('urgent.more', { count: urgent.length - 5 })}
              <ArrowRight className="size-3" />
            </button>
          ) : null}
        </section>

        <section className="flex flex-col rounded-xl border border-line bg-panel px-5 pb-4 pt-4 lg:col-span-5">
          <h2 className="text-sm font-semibold text-fg">{t('pace.title')}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">{t('pace.hint')}</p>
          <div className="mt-4 flex items-baseline gap-6">
            <Figure value={closed14} label={t('pace.closed')} swatch="var(--chart-bar)" />
            <Figure value={created14} label={t('pace.created')} swatch="var(--chart-rest)" />
            <span className={cn('ml-auto text-sm font-medium tabular-nums', net > 0 ? 'text-success' : net < 0 ? 'text-warning' : 'text-fg-muted')}>
              {t('pace.net', { net: net > 0 ? `+${net}` : String(net) })}
            </span>
          </div>
          {/* el gráfico ocupa el alto que deja la lista de al lado (mínimo 7rem) */}
          <div className="flex max-h-56 min-h-28 flex-1 items-stretch gap-1 pt-5">
            {pace.map((p) => (
              <Tooltip key={p.d.toISOString()} content={t('pace.tip', { when: format(p.d, 'EEE d MMM', { locale }), closed: p.closed, created: p.created })}>
                <span className="flex min-w-0 flex-1 flex-col justify-end" tabIndex={0}>
                  <span className="relative flex flex-1 items-end justify-center gap-px">
                    <Column value={p.closed} max={maxPace} color="var(--chart-bar)" />
                    <Column value={p.created} max={maxPace} color="var(--chart-rest)" />
                  </span>
                  <span className={cn('mt-1.5 text-center text-2xs tabular-nums', isToday(p.d) ? 'font-semibold text-accent-ink' : 'text-fg-subtle')}>{format(p.d, 'd')}</span>
                </span>
              </Tooltip>
            ))}
          </div>
        </section>
      </div>

      {/* 3 · lo que viene */}
      <section className="mt-4 rounded-xl border border-line bg-panel px-5 pb-5 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-fg">{t('ahead.title')}</h2>
          <p className="text-xs text-fg-muted">{t('ahead.hint')}</p>
          <button type="button" onClick={() => onTab('calendar')} className="ml-auto inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
            {t('ahead.open')}
            <ArrowRight className="size-3" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-14">
          {ahead.map(({ d, list }) => {
            const n = list.length
            const strength = n / maxAhead
            const tip = n
              ? [format(d, 'EEE d MMM', { locale }), ...list.slice(0, 4).map((x) => `· ${x.title}`), ...(n > 4 ? [t('ahead.more', { count: n - 4 })] : [])].join('\n')
              : format(d, 'EEE d MMM', { locale })
            return (
              <Tooltip key={d.toISOString()} content={<span className="block max-w-64 whitespace-pre-line text-left font-normal leading-snug">{tip}</span>}>
                <button type="button" onClick={() => onTab('calendar')} className="flex flex-col items-stretch gap-1 text-left">
                  <span className={cn('text-center text-2xs uppercase', isToday(d) ? 'font-semibold text-accent-ink' : 'text-fg-subtle')}>{format(d, 'EEEEEE', { locale })}</span>
                  <span
                    className={cn(
                      'flex h-12 items-center justify-center rounded-lg text-sm font-semibold tabular-nums transition-transform hover:-translate-y-0.5',
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
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <LoadList
          title={t('bySpace')}
          className={multi ? undefined : 'lg:col-span-2'}
          rows={bySpace.map((s) => ({
            key: s.ws.id,
            label: s.ws.name,
            icon: <WorkspaceMark ws={s.ws} size={18} />,
            load: s.load,
            total: s.list.length,
            href: `/w/${s.ws.slug}/tasks`,
          }))}
          max={maxSpace}
          empty={t('nothingOpen')}
        />
        {multi ? (
          <LoadList
            title={t('byPerson')}
            rows={byPerson.map((p) => ({
              key: p.member.id,
              label: p.member.full_name,
              icon: <Avatar name={p.member.full_name} src={p.member.avatar_url} seed={p.member.id} size={20} />,
              load: p.load,
              total: p.list.length,
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

function Figure({ value, label, swatch }: { value: number; label: string; swatch: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-2xl font-semibold leading-none text-fg">{value}</span>
      <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-fg-muted">
        <span className="size-2 rounded-[2px]" style={{ background: swatch }} />
        {label}
      </span>
    </span>
  )
}

function Column({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span
      className={cn('w-full max-w-2.5', value ? 'rounded-t-[3px]' : 'rounded-[1px]')}
      style={{ height: value ? `${Math.max(8, (value / max) * 100)}%` : 2, background: value ? color : 'var(--chart-track)' }}
    />
  )
}

function LoadList({
  title,
  rows,
  max,
  empty,
  className,
}: {
  title: string
  rows: { key: string; label: string; icon: React.ReactNode; load: Load; total: number; href: string }[]
  max: number
  empty: string
  className?: string
}) {
  const t = useTranslations('tasksDashboard')
  return (
    <section className={cn('rounded-xl border border-line bg-panel px-5 pb-4 pt-4', className)}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        <LoadLegend className="ml-auto" />
      </div>
      {rows.length ? (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className="-mx-2 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-hover/50">
                <span className="flex min-w-0 items-center gap-2 text-sm text-fg">
                  {r.icon}
                  <span className="truncate">{r.label}</span>
                </span>
                <LoadBar load={r.load} max={max} />
                <span className="w-24 text-right text-xs tabular-nums text-fg-muted">
                  <span className="text-sm text-fg">{r.total}</span>
                  {r.load.risk ? <span className="ml-1.5 text-danger">{t('riskShort', { count: r.load.risk })}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{empty}</p>
      )}
    </section>
  )
}
