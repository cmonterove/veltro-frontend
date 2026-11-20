'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, isSameDay, parseISO, startOfDay } from 'date-fns'
import { ArrowRight, Bot, Check, CheckCheck, ChevronDown, CircleHelp, Diamond, Mic, Plus, UserRoundPlus, UserRoundX } from 'lucide-react'
import { useApp, useMemberMap, canEdit } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { CARD } from '@/components/ui/surface'
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { useCreateTask, useUpdateTask } from '@/lib/queries/tasks'
import { useMeetingItemMutations } from '@/lib/queries/meetings'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useDateLocale, toDateKey } from '@/lib/dates'
import { parseQuickTask } from '@/lib/quick-parse'
import { PRIORITY_WEIGHT } from '@/lib/constants'
import type { Counter, ScopeOption } from '@/lib/scope'
import type { ApiTaskStats } from '@/lib/api/tareas'
import { cn, taskRef } from '@/lib/utils'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import type { CalendarEvent, DocSummary, WorkspaceWithRole } from '@/lib/types'
import { ScopeMenu, ScopePeople } from '@/components/app/scope-menu'
import { useOpenTask } from '@/lib/use-open-task'
import { assigneesOf, isAssignedTo } from '@/lib/assignees'
import { AI_ENABLED } from '@/lib/features'

export type BriefData = {
  now: Date
  scopeIds: string[]
  filter: string
  events: CalendarEvent[] | undefined
  eventsLoading: boolean
  calendarIssue: string | null
  meetings: MeetingRow[]
  items: MeetingItemRow[]
  /** reuniones e ítems todavía cargando: no decir "nada pendiente" antes de saberlo */
  itemsLoading: boolean
  itemsByMeeting: Map<string, MeetingItemRow[]>
  tasks: TaskRow[] | undefined
  docs: DocSummary[]
  wsMap: Map<string, WorkspaceWithRole>
}

/** Contadores de la API con los nombres de la web. */
const toCounts = (c: ApiTaskStats['counters']): Record<Counter, number> => ({
  overdue: c.overdue,
  today: c.today,
  in_progress: c.inProgress,
  blocked: c.blocked,
  todo: c.todo,
  done: c.done7d,
})

/** Las mismas reglas que `/v1/tasks/stats` (sin subtareas), para no esperar a la API para la frase del día. */
function localCounts(tasks: TaskRow[], todayKey: string, now: Date): Record<Counter, number> {
  const top = tasks.filter((x) => !x.parent_id)
  const open = top.filter((x) => x.status !== 'done')
  const weekAgo = now.getTime() - 7 * 86_400_000
  return {
    overdue: open.filter((x) => x.due_date && x.due_date < todayKey).length,
    today: open.filter((x) => x.due_date === todayKey).length,
    in_progress: top.filter((x) => x.status === 'in_progress').length,
    blocked: top.filter((x) => x.status === 'blocked').length,
    todo: top.filter((x) => x.status === 'todo').length,
    done: top.filter((x) => x.status === 'done' && x.completed_at && Date.parse(x.completed_at) >= weekAgo).length,
  }
}

/**
 * Derivados de Hoy para el alcance elegido (mías, mi equipo, un departamento, una persona o todo).
 * Las cifras las calcula la API (`counters`); las listas salen de las tareas cargadas.
 */
export function useBriefModel(
  { now, scopeIds, filter, events, meetings, tasks }: BriefData,
  scope: Pick<ScopeOption, 'kind' | 'userIds'>,
  counters: ApiTaskStats['counters'] | undefined,
) {
  const people = scope.userIds
  // "Toda la empresa" incluye lo que no tiene responsable (como las cifras de la API)
  const everyone = scope.kind === 'all'
  return useMemo(() => {
    // por el evento de Google o, si se creó en Veltro, por su id propio (`veltro-…`)
    const meetingByEvent = new Map<string | null, MeetingRow>([
      ...meetings.map((m) => [m.google_event_id, m] as const),
      ...meetings.map((m) => [`veltro-${m.id}`, m] as const),
    ])
    const inScope = (e: CalendarEvent) => filter === 'all' || e.links.some((l) => scopeIds.includes(l.workspaceId))
    const timed = (events ?? []).filter((e) => !e.allDay && inScope(e)).sort((a, b) => a.start.localeCompare(b.start))
    const live = timed.find((e) => new Date(e.start) <= now && new Date(e.end) > now) ?? null
    const next = timed.find((e) => new Date(e.start) > now) ?? null
    const today = timed.filter((e) => isSameDay(new Date(e.start), now))
    const nextDayStart = timed.find((e) => new Date(e.start) >= addDays(startOfDay(now), 1))
    const nextDay = nextDayStart ? timed.filter((e) => isSameDay(new Date(e.start), new Date(nextDayStart.start))) : []

    const todayKey = toDateKey(now)
    const scoped = (tasks ?? []).filter((x) => (everyone || isAssignedTo(x, people)) && scopeIds.includes(x.workspace_id))
    // las cifras de la API mandan; mientras llegan (1–2 s), las mismas cuentas con las tareas ya cargadas
    const counts = counters ? toCounts(counters) : tasks ? localCounts(scoped, todayKey, now) : null
    const overdue = scoped.filter((x) => x.status !== 'done' && x.due_date && x.due_date < todayKey)
    const dueToday = scoped.filter((x) => x.status !== 'done' && x.due_date === todayKey)
    const inProgress = scoped.filter((x) => x.status === 'in_progress' && !(x.due_date && x.due_date <= todayKey))
    // lo que sigue: por hacer sin apuro de hoy (primero lo que vence antes; lo sin fecha al final)
    const upcoming = scoped
      .filter((x) => x.status === 'todo' && !(x.due_date && x.due_date <= todayKey))
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority])
    const blocked = scoped.filter((x) => x.status === 'blocked')
    const weekAgo = now.getTime() - 7 * 86_400_000
    const doneWeek = scoped
      .filter((x) => x.status === 'done' && x.completed_at && Date.parse(x.completed_at) >= weekAgo)
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))

    const unclosed = meetings
      .filter((m) => scopeIds.includes(m.workspace_id) && m.phase !== 'closed' && new Date(m.ends_at ?? m.starts_at) < now)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))

    return { meetingByEvent, live, next, today, nextDay, counts, overdue, dueToday, inProgress, upcoming, blocked, doneWeek, unclosed }
  }, [now, scopeIds, filter, events, meetings, tasks, people, everyone, counters])
}

export type BriefModel = ReturnType<typeof useBriefModel>

// ---------------- alcance ----------------

/**
 * Qué se está mirando: "Viendo las tareas de [Mías ▾] en [todos los espacios ▾]".
 * `compact`: solo los menús (en la cabecera de la lista de tareas, que ya dice qué es).
 */
export function ViewSentence({
  scopes,
  scope,
  onScope,
  workspaces,
  filter,
  onFilter,
  compact = false,
}: {
  scopes: ScopeOption[]
  scope: ScopeOption
  onScope: (id: string) => void
  workspaces: WorkspaceWithRole[]
  filter: string
  onFilter: (id: string) => void
  compact?: boolean
}) {
  const t = useTranslations('scope')
  const current = workspaces.find((w) => w.id === filter)
  const token =
    'inline-flex h-8 items-center gap-1.5 rounded-lg bg-hover px-2.5 font-medium text-fg transition-colors hover:bg-active data-[popup-open]:bg-active'
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg-muted">
      {compact ? null : <span>{t('viewing')}</span>}
      {scopes.length > 1 ? <ScopeMenu options={scopes} value={scope} onChange={onScope} /> : compact ? null : <span className="font-medium text-fg">{scope.display}</span>}
      <ScopePeople scope={scope} />
      {workspaces.length > 1 ? (
        <>
          {compact ? null : <span>{t('in')}</span>}
          <Menu>
            <MenuTrigger className={token}>
              {current ? <WorkspaceMark ws={current} size={16} /> : null}
              <span className="max-w-48 truncate">{current ? current.name : t('allWorkspaces')}</span>
              <ChevronDown className="size-3.5 text-fg-subtle" />
            </MenuTrigger>
            <MenuContent align="start" className="w-60">
              <MenuRadioGroup value={filter} onValueChange={(v) => onFilter(String(v))}>
                <MenuRadioItem value="all" closeOnClick>
                  <span className="first-letter:uppercase">{t('allWorkspaces')}</span>
                </MenuRadioItem>
                <MenuSeparator />
                {workspaces.map((w) => (
                  <MenuRadioItem key={w.id} value={w.id} closeOnClick>
                    <WorkspaceMark ws={w} size={16} />
                    {w.name}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        </>
      ) : null}
    </p>
  )
}

// ---------------- el día en una frase ----------------

const SUMMARY_TONE: Partial<Record<Counter, string>> = {
  overdue: 'text-danger',
  today: 'text-mandarina-ink',
  in_progress: 'text-st-progress',
  blocked: 'text-st-blocked',
  todo: 'text-fg',
}

/**
 * Las tareas del día en una frase (cada parte abre su lista): «Hoy tienes 2 por hacer y nada
 * vencido.» Las reuniones las cuenta la regla del día, al lado.
 */
export function DaySummary({ model, scope }: { model: BriefModel; scope: ScopeOption }) {
  const t = useTranslations('pulse.brief.summary')
  const locale = useLocale()
  const c = model.counts
  if (!c) return <Skeleton className="my-2 h-3.5 w-[24rem] max-w-full rounded-full bg-fg/[0.07]" />

  const parts: React.ReactNode[] = []
  const add = (counter: Counter, label: string) =>
    parts.push(
      <Link
        key={counter}
        href={`/tasks?tab=list&filter=${counter}&scope=${encodeURIComponent(scope.id)}`}
        className={cn('font-semibold underline decoration-current/25 decoration-2 underline-offset-[5px] transition-colors hover:decoration-current', SUMMARY_TONE[counter])}
      >
        {label}
      </Link>,
    )
  if (c.overdue) add('overdue', t('overdue', { count: c.overdue }))
  if (c.today) add('today', t('today', { count: c.today }))
  if (c.in_progress) add('in_progress', t('progress', { count: c.in_progress }))
  if (c.blocked) add('blocked', t('blocked', { count: c.blocked }))
  if (c.todo) add('todo', t('todo', { count: c.todo }))
  if (parts.length && !c.overdue) parts.push(<span key="ok">{t('nothingOverdue')}</span>)

  // la lista en el idioma de la persona («a, b y c», «a, b and c»)
  let el = 0
  const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })
    .formatToParts(parts.map((_, i) => String(i)))
    .map((p, i) => (p.type === 'element' ? <span key={`e${i}`}>{parts[el++]}</span> : <span key={`l${i}`}>{p.value}</span>))

  return (
    <p className="max-w-[62ch] text-[17px] leading-relaxed text-fg-muted">
      {parts.length ? (
        <>
          {t(scope.kind === 'me' ? 'lead' : 'leadOthers')} {list}.
        </>
      ) : (
        t('clear')
      )}
    </p>
  )
}

// ---------------- piezas comunes ----------------

export function MoreLink({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
  const cls = 'inline-flex shrink-0 items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg'
  return href ? (
    <Link href={href} className={cls}>
      {children}
      <ArrowRight className="size-3" />
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children}
      <ArrowRight className="size-3" />
    </button>
  )
}

/** Título de un grupo: un punto de su color y el nombre en minúsculas, sin gritar. */
function GroupLabel({ children, tone, hint, className = 'px-6' }: { children: React.ReactNode; tone?: string; hint?: string; className?: string }) {
  return (
    <div className={cn('pb-0.5 pt-3', className)}>
      <p className={cn('flex items-center gap-2 text-xs font-semibold', tone ?? 'text-fg-muted')}>
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
        {children}
      </p>
      {hint ? <p className="mt-0.5 pl-3.5 text-xs leading-snug text-fg-subtle">{hint}</p> : null}
    </div>
  )
}

/** Cifra en pastilla (pestañas y encabezados). */
function CountPill({ n, active }: { n: number | string; active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors',
        active ? 'bg-accent text-accent-fg' : 'bg-fg/[0.06] text-fg-muted',
      )}
    >
      {n}
    </span>
  )
}

/** Un estado tranquilo en una línea (sin ficha grande): «Todo con dueño. Nada quedó suelto…». */
function Quiet({ title, children, action, className }: { title?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <p className="flex items-start gap-2 text-sm leading-snug text-fg-muted">
        <CheckCheck className="mt-px size-4 shrink-0 text-done" />
        <span>
          {title ? <span className="font-medium text-fg">{title}. </span> : null}
          {children}
        </span>
      </p>
      {action}
    </div>
  )
}

// ---------------- tareas ----------------

/** La tarjeta de Pulso: Tareas, Pendientes de reuniones y Solicitudes se ven de la misma familia. */
export const PULSE_CARD = CARD

type TaskTab = 'focus' | 'next' | 'blocked' | 'done'

/**
 * La pieza principal de Pulso: las tareas del alcance en pestañas que filtran ahí mismo
 * (Hoy · Lo que sigue · Bloqueadas · Hechas). Abre en «Hoy» si hay algo urgente; si no, en lo que sigue.
 */
export function TasksPanel({
  data,
  model,
  scope,
  scopes,
  onScope,
  workspaces,
  onFilter,
}: {
  data: BriefData
  model: BriefModel
  scope: ScopeOption
  scopes: ScopeOption[]
  onScope: (id: string) => void
  workspaces: WorkspaceWithRole[]
  onFilter: (id: string) => void
}) {
  const t = useTranslations('pulse.brief.today')
  const tt = useTranslations('pulse.brief.tabs')
  const byPriority = (a: TaskRow, b: TaskRow) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
  const groups = [
    { id: 'overdue', label: t('overdue'), tone: 'text-danger', tasks: [...model.overdue].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')) },
    { id: 'today', label: t('today'), tone: 'text-mandarina-ink', tasks: [...model.dueToday].sort(byPriority) },
    { id: 'progress', label: t('progress'), tone: undefined, tasks: [...model.inProgress].sort(byPriority) },
  ].filter((g) => g.tasks.length)
  const focusCount = groups.reduce((n, g) => n + g.tasks.length, 0)
  // las en curso que ya vencieron o vencen hoy salen arriba: se avisa para que la cifra cuadre
  const progressAbove = [...model.overdue, ...model.dueToday].filter((x) => x.status === 'in_progress').length

  // hasta que la persona elija una pestaña, manda lo que hay: «Hoy» si hay algo urgente, si no lo que sigue
  const [picked, setPicked] = useState<TaskTab | null>(null)
  const tab = picked ?? (focusCount ? 'focus' : 'next')

  const showOwner = scope.kind !== 'me'
  const title =
    scope.kind === 'me'
      ? t('title')
      : scope.kind === 'team'
        ? t('titleTeam')
        : scope.kind === 'all'
          ? t('titleAll')
          : scope.kind === 'dept'
            ? t('titleDept', { name: scope.label })
            : t('titleOf', { name: scope.label.split(' ')[0] })

  const tabs: { id: TaskTab; label: string; n: number; alarm?: number }[] = [
    { id: 'focus', label: tt('focus'), n: focusCount, alarm: model.overdue.length },
    { id: 'next', label: tt('next'), n: model.upcoming.length },
    { id: 'blocked', label: tt('blocked'), n: model.blocked.length },
    { id: 'done', label: tt('done'), n: model.doneWeek.length },
  ]

  const list = (tasks: TaskRow[], opts: { due?: boolean } = {}) => (
    <ul>
      {tasks.map((x) => (
        <TaskLine key={x.id} task={x} data={data} showOwner={showOwner} showDue={opts.due} />
      ))}
    </ul>
  )

  let body: React.ReactNode
  if (!data.tasks) {
    body = (
      <div className="flex flex-col gap-2 px-6 py-3">
        <Skeleton className="h-7" />
        <Skeleton className="h-7" />
        <Skeleton className="h-7" />
      </div>
    )
  } else if (tab === 'focus') {
    body = focusCount ? (
      <>
        {groups.map((g) => (
          <div key={g.id}>
            <GroupLabel tone={g.tone} hint={g.id === 'progress' && progressAbove ? t('progressAbove', { count: progressAbove }) : undefined}>
              {g.label} <span className="font-medium tabular-nums text-fg-subtle">{g.tasks.length}</span>
            </GroupLabel>
            {list(g.tasks)}
          </div>
        ))}
        {/* lo urgente es poco: debajo, lo que sigue (en vez de un hueco) */}
        {focusCount < 6 && model.upcoming.length ? (
          <>
            <GroupLabel>{t('next')}</GroupLabel>
            {list(model.upcoming.slice(0, 6 - focusCount), { due: true })}
          </>
        ) : null}
      </>
    ) : (
      <Quiet
        title={t('clear')}
        className="px-6 py-5"
        action={
          model.upcoming.length ? (
            <button type="button" onClick={() => setPicked('next')} className="ml-6 inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
              {tt('seeNext')} ({model.upcoming.length})
              <ArrowRight className="size-3.5" />
            </button>
          ) : null
        }
      >
        {tt('focusEmpty')}
      </Quiet>
    )
  } else {
    const rows = tab === 'next' ? model.upcoming : tab === 'blocked' ? model.blocked : model.doneWeek
    body = rows.length ? (
      <div className="pt-1">{list(rows, { due: tab !== 'done' })}</div>
    ) : (
      <Quiet className="px-6 py-5">{tt(`${tab}Empty`)}</Quiet>
    )
  }

  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden', PULSE_CARD)}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-6 pt-4">
        <h2 className="mr-auto truncate text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        <ViewSentence compact scopes={scopes} scope={scope} onScope={onScope} workspaces={workspaces} filter={data.filter} onFilter={onFilter} />
        <MoreLink href={`/tasks?tab=list&scope=${encodeURIComponent(scope.id)}`}>{t('all')}</MoreLink>
      </header>

      <div role="tablist" aria-label={title} data-tour="counters" className="mt-1 flex shrink-0 gap-6 overflow-x-auto border-b border-line-soft px-6 scrollbar-none">
        {tabs.map((x) => {
          const active = tab === x.id
          return (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPicked(x.id)}
              className={cn('relative flex h-10 shrink-0 items-center gap-2 text-sm transition-colors', active ? 'font-semibold text-fg' : 'font-medium text-fg-muted hover:text-fg')}
            >
              {x.label}
              <CountPill n={data.tasks ? x.n : '–'} active={active && x.n > 0} />
              {x.alarm ? <span className="rounded-full bg-danger-soft px-2 py-px text-[11px] font-semibold text-danger">{tt('overdue', { count: x.alarm })}</span> : null}
              <span
                aria-hidden
                className={cn('absolute inset-x-0 -bottom-px h-[2.5px] origin-center rounded-full bg-accent transition-transform duration-200 ease-out', active ? 'scale-x-100' : 'scale-x-0')}
              />
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto py-1 scrollbar-thin">
        {body}
      </div>
      {scope.kind === 'me' ? <QuickAdd data={data} /> : null}
    </section>
  )
}

function TaskLine({ task, data, showOwner, showDue }: { task: TaskRow; data: BriefData; showOwner: boolean; showDue?: boolean }) {
  const t = useTranslations('pulse.brief.today')
  const tt = useTranslations('pulse.brief.tabs')
  const locale = useDateLocale()
  const { open } = useOpenTask()
  const update = useUpdateTask()
  const memberMap = useMemberMap()
  const [closing, setClosing] = useState(false)
  const ws = data.wsMap.get(task.workspace_id)
  const owners = assigneesOf(task).flatMap((id) => memberMap.get(id) ?? [])
  const isDone = task.status === 'done'
  const checked = isDone || closing
  const late = !isDone && task.due_date ? differenceInCalendarDays(parseISO(task.due_date), data.now) : 0

  const toggle = () => {
    if (isDone) {
      update.mutate({ id: task.id, patch: { status: 'todo' } })
      return
    }
    // se ve tachada un instante antes de irse a «Hechas»: cerrar algo tiene que sentirse
    setClosing(true)
    window.setTimeout(() => update.mutate({ id: task.id, patch: { status: 'done' } }), 380)
  }

  return (
    <li className="mx-3 flex items-center gap-3 rounded-xl px-3 py-1.5 transition-colors duration-150 hover:bg-hover/60">
      <button
        type="button"
        disabled={!canEdit(ws) || closing}
        onClick={toggle}
        aria-label={isDone ? tt('reopen') : t('complete')}
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,color,transform] duration-200 ease-out active:scale-90 disabled:cursor-default',
          checked
            ? 'border-done bg-done text-panel'
            : 'border-line-control text-transparent hover:border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-50 disabled:hover:border-line-control disabled:hover:bg-transparent disabled:hover:text-transparent',
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </button>
      <button type="button" onClick={() => open(task.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className={cn('min-w-0 flex-1 truncate text-[14.5px] transition-colors duration-200', checked ? 'text-fg-subtle line-through decoration-fg-subtle/50' : 'text-fg')}>
          {task.title}
        </span>
        {/* cuándo, como etiqueta: vencida en rojo, hoy en mandarina, lo demás en gris */}
        {late < 0 ? <span className="shrink-0 rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">{t('late', { count: -late })}</span> : null}
        {showDue && !isDone && task.due_date && late >= 0 ? (
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium first-letter:uppercase',
              late === 0 ? 'bg-warning-soft text-mandarina-ink' : 'bg-fg/[0.05] text-fg-muted',
            )}
          >
            {format(parseISO(task.due_date), 'EEE d', { locale })}
          </span>
        ) : null}
        {isDone && task.completed_at ? (
          <span className="shrink-0 text-xs text-fg-subtle">{formatDistanceToNowStrict(new Date(task.completed_at), { addSuffix: true, locale })}</span>
        ) : null}
        {showOwner ? <AvatarStack people={owners} size={20} ring="panel" /> : null}
        {ws ? <span className="w-14 shrink-0 text-right font-mono text-[11px] text-fg-subtle">{taskRef(ws.key, task.number)}</span> : null}
      </button>
    </li>
  )
}

/** Agregar una tarea para hoy con lenguaje natural (@persona, !prioridad, fecha al final). */
function QuickAdd({ data }: { data: BriefData }) {
  const t = useTranslations('pulse.brief.today')
  const { workspaces, user } = useApp()
  const editable = workspaces.filter((w) => canEdit(w) && data.scopeIds.includes(w.id))
  const [wsId, setWsId] = useState<string | undefined>(undefined)
  const target = editable.find((w) => w.id === wsId) ?? editable[0]
  const members = useWorkspaceMembers(target?.id)
  const create = useCreateTask()
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseQuickTask(text, members), [text, members])
  if (!target) return null

  const submit = () => {
    const title = (parsed.title || text).trim()
    if (!title) return
    create.mutate({
      workspace_id: target.id,
      title: title.slice(0, 500),
      priority: parsed.priority ?? 'none',
      assignee_ids: parsed.assigneeIds.length ? parsed.assigneeIds : [user.id],
      due_date: parsed.due ?? toDateKey(data.now),
      status: 'todo',
      position: Date.now() / 1000,
    })
    setText('')
  }

  return (
    // un campo de verdad al pie de la lista: se ve que ahí se escribe
    <div className="flex shrink-0 items-center gap-3 border-t border-line-soft bg-panel px-4 py-2.5">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-xl bg-canvas px-3 ring-1 ring-line-soft transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent/35">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg" aria-hidden>
          <Plus className="size-3.5" strokeWidth={2.5} />
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={t('add')}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
        />
      </label>
      {parsed.due || parsed.assigneeIds.length || parsed.priority ? <span className="hidden shrink-0 text-2xs text-accent-ink @min-[1200px]/pulse:inline">{t('understood')}</span> : null}
      {editable.length > 1 ? (
        <Menu>
          <MenuTrigger className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-fg-muted hover:bg-hover data-[popup-open]:bg-hover" aria-label={t('workspace')}>
            <WorkspaceMark ws={target} size={16} />
            <ChevronDown className="size-3" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuRadioGroup value={target.id} onValueChange={(v) => setWsId(String(v))}>
              {editable.map((w) => (
                <MenuRadioItem key={w.id} value={w.id}>
                  <WorkspaceMark ws={w} size={16} />
                  {w.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      ) : null}
    </div>
  )
}

// ---------------- columna derecha: reuniones ----------------

/** Encabezado de una sección de la columna derecha (sin caja: la columna va sobre el fondo). */
export function RailHeader({ icon, tone, title, count, action }: { icon: React.ReactNode; tone: string; title: string; count?: number; action?: React.ReactNode }) {
  return (
    <header className="flex min-h-7 items-center gap-2">
      <span className={cn('flex shrink-0 [&_svg]:size-4', tone)} aria-hidden>
        {icon}
      </span>
      <h2 className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold tracking-[-0.015em]">
        <span className="truncate">{title}</span>
        {count ? <CountPill n={count} /> : null}
      </h2>
      {action}
    </header>
  )
}

/**
 * Lo que dejaron las reuniones: las que falta cerrar, preguntas abiertas y acciones sin dueño;
 * debajo, lo último que se cerró (y la línea de tiempo completa).
 */
export function MeetingsRail({ data, model, onTimeline }: { data: BriefData; model: BriefModel; onTimeline: () => void }) {
  const t = useTranslations('pulse.brief.loose')
  const tr = useTranslations('pulse.brief.recent')
  const locale = useDateLocale()
  const meetingById = new Map(data.meetings.map((m) => [m.id, m]))
  const inScope = (i: MeetingItemRow) => data.scopeIds.includes(i.workspace_id) && meetingById.has(i.meeting_id)
  const questions = data.items.filter((i) => i.kind === 'question' && !i.done && inScope(i))
  const unowned = data.items.filter((i) => i.kind === 'action' && !i.assignee_id && !i.task_id && inScope(i) && meetingById.get(i.meeting_id)?.phase !== 'closed')
  const total = model.unclosed.length + questions.length + unowned.length

  const recent = useMemo(() => {
    const closed = data.meetings
      .filter((m) => m.phase === 'closed' && data.scopeIds.includes(m.workspace_id))
      .map((m) => ({ type: 'meeting' as const, at: new Date(m.closed_at ?? m.starts_at), id: m.id, ws: m.workspace_id, title: m.title, href: `/m/${m.id}` }))
    const sessions = data.docs
      // las sesiones de Claude, solo con la IA prendida (lib/features)
      .filter((d) => AI_ENABLED && d.source === 'claude' && data.scopeIds.includes(d.workspace_id))
      .map((d) => ({ type: 'doc' as const, at: new Date(d.created_at), id: d.id, ws: d.workspace_id, title: d.title, href: `/w/${data.wsMap.get(d.workspace_id)?.slug}/docs/${d.id}` }))
    return [...closed, ...sessions].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 4)
  }, [data.meetings, data.docs, data.scopeIds, data.wsMap])

  // ya van dentro de su tarjeta: lo que pide algo de ti en filas con aire, lo que ya pasó en filas simples
  const card = '-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-hover/60'
  const row = 'flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-hover/60'

  return (
    <section className="flex flex-col gap-2">
      <RailHeader icon={<Diamond />} tone="text-k-decision" title={t('title')} count={total} />
      {data.itemsLoading ? (
        <div className="flex flex-col gap-2 pt-1">
          <Skeleton className="h-12 rounded-2xl bg-fg/[0.05]" />
          <Skeleton className="h-12 rounded-2xl bg-fg/[0.05]" />
        </div>
      ) : total === 0 ? (
        <Quiet title={t('clear')} className="pt-0.5">
          {t('empty')}
        </Quiet>
      ) : (
        <div>
          {model.unclosed.length ? (
            <>
              <GroupLabel className="px-1 pt-1" tone="text-mandarina-ink" hint={t('meetingsHint')}>
                {t('meetings')}
              </GroupLabel>
              <ul className="mt-0.5 flex flex-col">
                {model.unclosed.map((m) => {
                  const ws = data.wsMap.get(m.workspace_id)
                  return (
                    <li key={m.id} className={card}>
                      {ws ? <WorkspaceMark ws={ws} size={16} /> : null}
                      <Link href={`/m/${m.id}`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{m.title}</span>
                        <span className="block text-xs text-fg-subtle">{t('ended', { ago: formatDistanceToNowStrict(new Date(m.ends_at ?? m.starts_at), { addSuffix: true, locale }) })}</span>
                      </Link>
                      <Link
                        href={`/m/${m.id}?view=closed`}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-warning-soft px-2.5 text-xs font-semibold text-mandarina-ink transition-colors hover:bg-mandarina hover:text-on-mandarina"
                      >
                        <CheckCheck className="size-3.5" />
                        {t('close')}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : null}
          {questions.length ? (
            <>
              <GroupLabel className="px-1" tone="text-k-question" hint={t('questionsHint')}>
                {t('questions')}
              </GroupLabel>
              <ul className="mt-0.5 flex flex-col">
                {questions.map((q) => (
                  <li key={q.id}>
                    <Link href={`/m/${q.meeting_id}`} className={cn(card, 'items-start')}>
                      <CircleHelp className="mt-0.5 size-4 shrink-0 text-k-question" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-snug text-fg">{q.text}</span>
                        <span className="block truncate text-xs text-fg-subtle">{meetingById.get(q.meeting_id)?.title}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {unowned.length ? (
            <>
              <GroupLabel className="px-1" tone="text-k-action" hint={t('unownedHint')}>
                {t('unowned')}
              </GroupLabel>
              <ul className="mt-0.5 flex flex-col">
                {unowned.map((a) => (
                  <UnownedLine key={a.id} item={a} meetingTitle={meetingById.get(a.meeting_id)?.title ?? ''} ws={data.wsMap.get(a.workspace_id)} className={card} />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}

      {recent.length ? (
        <div className="mt-4">
          <div className="flex items-center pb-1">
            <p className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {tr('title')}
            </p>
            <span className="ml-auto">
              <MoreLink onClick={onTimeline}>{tr('all')}</MoreLink>
            </span>
          </div>
          <ul className="-mx-2">
            {recent.map((e) => {
              const ws = data.wsMap.get(e.ws)
              return (
                <li key={`${e.type}-${e.id}`}>
                  <Link href={e.href} className={row}>
                    {e.type === 'meeting' ? <Mic className="size-3.5 shrink-0 text-mandarina-ink" /> : <Bot className="size-3.5 shrink-0 text-accent" />}
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{e.title}</span>
                    {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
                    <span className="shrink-0 text-right text-xs text-fg-subtle">{formatDistanceToNowStrict(e.at, { locale })}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

/** Acción sin responsable: se asigna desde aquí y se vuelve tarea al cerrar la reunión. */
function UnownedLine({ item, meetingTitle, ws, className }: { item: MeetingItemRow; meetingTitle: string; ws: WorkspaceWithRole | undefined; className: string }) {
  const t = useTranslations('pulse.brief.loose')
  const members = useWorkspaceMembers(item.workspace_id)
  const { update } = useMeetingItemMutations(item.meeting_id)
  return (
    <li className={cn(className, 'items-start')}>
      <UserRoundX className="mt-0.5 size-4 shrink-0 text-k-action" />
      <Link href={`/m/${item.meeting_id}`} className="min-w-0 flex-1">
        <span className="block text-sm leading-snug text-fg">{item.text}</span>
        <span className="block truncate text-2xs text-fg-subtle">{meetingTitle}</span>
      </Link>
      {canEdit(ws) && members.length ? (
        <Menu>
          <MenuTrigger className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-k-action-soft px-2 text-xs font-medium text-k-action transition-colors hover:opacity-80 data-[popup-open]:opacity-80">
            <UserRoundPlus className="size-3.5" />
            {t('assign')}
          </MenuTrigger>
          <MenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
            <MenuGroup>
              <MenuLabel>{t('assignTo')}</MenuLabel>
              {members.map((m) => (
                <MenuItem key={m.id} onClick={() => update.mutate({ id: item.id, patch: { assignee_id: m.id } })}>
                  <Avatar name={m.full_name} seed={m.id} src={m.avatar_url} size={18} />
                  <span className="truncate">{m.full_name}</span>
                </MenuItem>
              ))}
            </MenuGroup>
          </MenuContent>
        </Menu>
      ) : null}
    </li>
  )
}
