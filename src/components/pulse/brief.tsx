'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { addDays, differenceInCalendarDays, differenceInMinutes, format, formatDistanceToNowStrict, isSameDay, parseISO, startOfDay } from 'date-fns'
import { ArrowRight, Bot, CalendarDays, Check, CheckCheck, ChevronDown, CircleAlert, CircleHelp, Mic, Plus, UserRoundPlus, UserRoundX, Video } from 'lucide-react'
import { useApp, useMemberMap, canEdit } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { ConnectCalendar } from '@/components/calendar/connect-calendar'
import { NotesButton } from '@/components/calendar/notes-button'
import { StatusIcon } from '@/components/tasks/status-icon'
import { useCreateTask, useUpdateTask } from '@/lib/queries/tasks'
import { useMeetingItemMutations } from '@/lib/queries/meetings'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useDateLocale, toDateKey } from '@/lib/dates'
import { parseQuickTask } from '@/lib/quick-parse'
import { PRIORITY_WEIGHT } from '@/lib/constants'
import { COUNTERS, matchesCounter, type Counter, type ScopeOption } from '@/lib/scope'
import { cn, taskRef } from '@/lib/utils'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import type { CalendarEvent, DocSummary, WorkspaceWithRole } from '@/lib/types'
import { LiveCapture } from './cards'
import { ScopeMenu, ScopePeople } from '@/components/app/scope-menu'
import { useOpenTask } from '@/lib/use-open-task'
import { assigneesOf, isAssignedTo } from '@/lib/assignees'

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

/** Derivados de Hoy para el alcance elegido (mías, mi equipo, un departamento, una persona o todo). */
export function useBriefModel({ now, scopeIds, filter, events, meetings, tasks }: BriefData, people: Set<string>) {
  return useMemo(() => {
    const meetingByEvent = new Map(meetings.map((m) => [m.google_event_id, m]))
    const inScope = (e: CalendarEvent) => filter === 'all' || e.links.some((l) => scopeIds.includes(l.workspaceId))
    const timed = (events ?? []).filter((e) => !e.allDay && inScope(e)).sort((a, b) => a.start.localeCompare(b.start))
    const live = timed.find((e) => new Date(e.start) <= now && new Date(e.end) > now) ?? null
    const next = timed.find((e) => new Date(e.start) > now) ?? null
    const today = timed.filter((e) => isSameDay(new Date(e.start), now))
    const nextDayStart = timed.find((e) => new Date(e.start) >= addDays(startOfDay(now), 1))
    const nextDay = nextDayStart ? timed.filter((e) => isSameDay(new Date(e.start), new Date(nextDayStart.start))) : []

    const todayKey = toDateKey(now)
    const scoped = (tasks ?? []).filter((x) => isAssignedTo(x, people) && scopeIds.includes(x.workspace_id))
    const counts = Object.fromEntries(COUNTERS.map((c) => [c, scoped.filter((x) => matchesCounter(x, c, now)).length])) as Record<Counter, number>
    const overdue = scoped.filter((x) => x.status !== 'done' && x.due_date && x.due_date < todayKey)
    const dueToday = scoped.filter((x) => x.status !== 'done' && x.due_date === todayKey)
    const inProgress = scoped.filter((x) => x.status === 'in_progress' && !(x.due_date && x.due_date <= todayKey))

    const unclosed = meetings
      .filter((m) => scopeIds.includes(m.workspace_id) && m.phase !== 'closed' && new Date(m.ends_at ?? m.starts_at) < now)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))

    return { meetingByEvent, live, next, today, nextDay, counts, overdue, dueToday, inProgress, unclosed }
  }, [now, scopeIds, filter, events, meetings, tasks, people])
}

export type BriefModel = ReturnType<typeof useBriefModel>

// ---------------- alcance ----------------

export function ScopePicker({ options, value, onChange }: { options: ScopeOption[]; value: ScopeOption; onChange: (id: string) => void }) {
  return (
    <span className="flex items-center gap-2.5">
      <ScopePeople scope={value} />
      <ScopeMenu options={options} value={value} onChange={onChange} triggerClassName="h-9 border border-line bg-panel hover:bg-hover data-[popup-open]:bg-hover" />
    </span>
  )
}

/**
 * Qué se está mirando, como una frase: "Viendo las tareas de [Mías ▾] en [todos los espacios ▾]".
 * Cada parte subrayada abre su menú.
 */
export function ViewSentence({
  scopes,
  scope,
  onScope,
  workspaces,
  filter,
  onFilter,
}: {
  scopes: ScopeOption[]
  scope: ScopeOption
  onScope: (id: string) => void
  workspaces: WorkspaceWithRole[]
  filter: string
  onFilter: (id: string) => void
}) {
  const t = useTranslations('scope')
  const current = workspaces.find((w) => w.id === filter)
  const token =
    'inline-flex h-8 items-center gap-1.5 rounded-lg bg-hover px-2.5 font-medium text-fg transition-colors hover:bg-active data-[popup-open]:bg-active'
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg-muted">
      <span>{t('viewing')}</span>
      {scopes.length > 1 ? <ScopeMenu options={scopes} value={scope} onChange={onScope} /> : <span className="font-medium text-fg">{scope.display}</span>}
      <ScopePeople scope={scope} />
      {workspaces.length > 1 ? (
        <>
          <span>{t('in')}</span>
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

// ---------------- contadores ----------------

const COUNTER_TONE: Record<Counter, string> = {
  overdue: 'text-danger',
  today: 'text-mandarina-ink',
  in_progress: 'text-st-progress',
  blocked: 'text-st-blocked',
  todo: 'text-fg',
  done: 'text-st-done',
}

/** Cantidades por estado del alcance elegido; cada una abre esa lista en Mis tareas. */
export function Counters({ model, scope, loading }: { model: BriefModel; scope: ScopeOption; loading: boolean }) {
  const t = useTranslations('pulse.brief.counters')
  return (
    <div className="grid grid-cols-2 gap-2 @min-[520px]/pulse:grid-cols-3 @min-[900px]/pulse:grid-cols-6">
      {COUNTERS.map((c) => {
        const n = model.counts[c]
        return (
          <Link
            key={c}
            href={`/tasks?tab=list&filter=${c}&scope=${encodeURIComponent(scope.id)}`}
            className="group flex flex-col gap-1 rounded-xl border border-line bg-panel px-3.5 py-2.5 transition-colors hover:border-line-strong hover:bg-hover/40"
          >
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              {c === 'overdue' ? <CircleAlert className="size-3.5 text-danger" /> : c === 'today' ? <CalendarDays className="size-3.5 text-mandarina-ink" /> : <StatusIcon status={c === 'done' ? 'done' : c} className="size-3.5" />}
              <span className="truncate">{t(c)}</span>
              <ArrowRight className="ml-auto size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            {loading ? (
              <Skeleton className="h-7 w-10" />
            ) : (
              <span className={cn('font-brand text-[26px] font-semibold leading-none tabular-nums', n ? COUNTER_TONE[c] : 'text-fg-subtle')}>{n}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ---------------- columnas ----------------

function Column({
  title,
  subtitle,
  count,
  action,
  children,
  className,
}: {
  title: string
  /** qué muestra la columna, en una línea: el título solo no alcanza */
  subtitle: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel', className)}>
      <header className="flex shrink-0 items-start gap-2 border-b border-line-soft px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-baseline gap-2 text-sm font-semibold">
            <span className="truncate">{title}</span>
            {count ? <span className="text-xs font-normal tabular-nums text-fg-subtle">{count}</span> : null}
          </h2>
          <p className="truncate text-xs text-fg-subtle">{subtitle}</p>
        </div>
        {action ? <span className="shrink-0 pt-0.5">{action}</span> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
    </section>
  )
}

function MoreLink({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
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

function GroupLabel({ children, tone, hint }: { children: React.ReactNode; tone?: string; hint?: string }) {
  return (
    <div className="px-4 pb-1 pt-3">
      <p className={cn('text-2xs font-semibold uppercase tracking-wide', tone ?? 'text-fg-subtle')}>{children}</p>
      {hint ? <p className="mt-0.5 text-2xs leading-snug text-fg-subtle">{hint}</p> : null}
    </div>
  )
}

// ---------- 1) tareas ----------

export function TodayColumn({ data, model, scope }: { data: BriefData; model: BriefModel; scope: ScopeOption }) {
  const t = useTranslations('pulse.brief.today')
  const byPriority = (a: TaskRow, b: TaskRow) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
  // los tres grupos siempre a la vista (aunque estén en 0) con los mismos nombres que los contadores
  const groups = [
    { id: 'overdue', label: t('overdue'), tone: 'text-danger', tasks: [...model.overdue].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')) },
    { id: 'today', label: t('today'), tone: 'text-mandarina-ink', tasks: [...model.dueToday].sort(byPriority) },
    { id: 'progress', label: t('progress'), tone: undefined, tasks: [...model.inProgress].sort(byPriority) },
  ]
  const total = groups.reduce((n, g) => n + g.tasks.length, 0)
  // las en curso que ya vencieron o vencen hoy salen arriba: se avisa para que la cifra cuadre con el contador
  const progressAbove = [...model.overdue, ...model.dueToday].filter((x) => x.status === 'in_progress').length
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

  return (
    <Column title={title} subtitle={t('subtitle')} count={total} action={<MoreLink href={`/tasks?tab=list&scope=${encodeURIComponent(scope.id)}`}>{t('all')}</MoreLink>}>
      <div className="flex min-h-full flex-col">
        {!data.tasks ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : total === 0 ? (
          <p className="px-4 py-6 text-sm text-fg-muted">{t('empty')}</p>
        ) : (
          <div className="flex-1 pb-2">
            {groups.map((g) => (
              <div key={g.id}>
                <GroupLabel tone={g.tasks.length ? g.tone : 'text-fg-subtle'} hint={g.id === 'progress' && progressAbove ? t('progressAbove', { count: progressAbove }) : undefined}>
                  {g.label} <span className="font-normal text-fg-subtle">{g.tasks.length}</span>
                </GroupLabel>
                <ul>
                  {g.tasks.map((x) => (
                    <TaskLine key={x.id} task={x} data={data} showOwner={showOwner} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {scope.kind === 'me' ? <QuickAdd data={data} /> : null}
      </div>
    </Column>
  )
}

function TaskLine({ task, data, showOwner }: { task: TaskRow; data: BriefData; showOwner: boolean }) {
  const t = useTranslations('pulse.brief.today')
  const { open } = useOpenTask()
  const update = useUpdateTask()
  const memberMap = useMemberMap()
  const ws = data.wsMap.get(task.workspace_id)
  const owners = assigneesOf(task).flatMap((id) => memberMap.get(id) ?? [])
  const late = task.due_date ? differenceInCalendarDays(parseISO(task.due_date), data.now) : 0
  return (
    <li className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-hover/50">
      <button
        type="button"
        disabled={!canEdit(ws)}
        onClick={() => update.mutate({ id: task.id, patch: { status: 'done' } })}
        aria-label={t('complete')}
        className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-strong text-transparent transition-colors hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-50 disabled:hover:border-line-strong disabled:hover:text-transparent"
      >
        <Check className="size-3" strokeWidth={3} />
      </button>
      <button type="button" onClick={() => open(task.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="min-w-0 flex-1 truncate text-sm text-fg">{task.title}</span>
        {late < 0 ? <span className="shrink-0 text-xs text-danger">{t('late', { count: -late })}</span> : null}
        {showOwner ? <AvatarStack people={owners} size={18} ring="panel" /> : null}
        {ws ? <span className="w-12 shrink-0 text-right font-mono text-2xs text-fg-subtle">{taskRef(ws.key, task.number)}</span> : null}
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
    <div className="sticky bottom-0 flex items-center gap-2.5 border-t border-line bg-panel px-4 py-1.5">
      <Plus className="size-[18px] shrink-0 text-fg-subtle" />
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
        className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
      />
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

// ---------- 2) agenda ----------

export function AgendaColumn({ data, model, onTimeline }: { data: BriefData; model: BriefModel; onTimeline: () => void }) {
  const t = useTranslations('pulse.brief.agenda')
  const tn = useTranslations('pulse.brief.now')
  const appLocale = useLocale()
  const locale = useDateLocale()
  const { google } = useApp()

  const event = model.live ?? model.next
  const meeting = event ? (model.meetingByEvent.get(event.id) ?? null) : null
  const ws = meeting ? data.wsMap.get(meeting.workspace_id) : event?.links[0] ? data.wsMap.get(event.links[0].workspaceId) : undefined
  const live = Boolean(model.live)
  const dayOver = !model.today.some((e) => new Date(e.end) > data.now)
  const showNextDay = dayOver && model.nextDay.length > 0
  const nextDayLabel = showNextDay
    ? isSameDay(new Date(model.nextDay[0].start), addDays(data.now, 1))
      ? t('tomorrow')
      : format(new Date(model.nextDay[0].start), 'EEEE d', { locale })
    : ''

  const when = !event
    ? ''
    : live
      ? tn('remaining', { minutes: differenceInMinutes(new Date(event.end), data.now) })
      : isSameDay(new Date(event.start), data.now)
        ? differenceInMinutes(new Date(event.start), data.now) < 60
          ? tn('inMinutes', { minutes: differenceInMinutes(new Date(event.start), data.now) })
          : tn('atTime', { time: format(new Date(event.start), 'HH:mm') })
        : new Intl.DateTimeFormat(appLocale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(event.start))

  return (
    <Column title={t('title')} subtitle={t('subtitle')} action={<MoreLink href="/calendar">{t('open')}</MoreLink>}>
      {!google || data.calendarIssue === 'google_not_connected' || data.calendarIssue === 'google_auth_revoked' ? (
        <div className="p-3">
          <ConnectCalendar reason={data.calendarIssue ?? undefined} returnTo="/home" compact />
        </div>
      ) : data.eventsLoading ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : (
        <div className="pb-3">
          {/* lo que está pasando o lo que sigue */}
          <div className={cn('m-3 rounded-xl border p-3', live ? 'border-mandarina/50 bg-highlight' : 'border-line bg-sidebar/40')}>
            {event ? (
              <>
                <p className={cn('flex items-center gap-1.5 text-xs first-letter:uppercase', live ? 'font-medium text-mandarina-ink' : 'text-fg-muted')}>
                  {live ? <span className="size-1.5 animate-pulse rounded-full bg-mandarina" /> : null}
                  {live ? tn('live') : tn('next')} · {when}
                </p>
                <div className="mt-1 flex items-start gap-2">
                  {ws ? <WorkspaceMark ws={ws} size={18} className="mt-0.5" /> : null}
                  <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{event.title}</p>
                </div>
                {event.attendees.length ? (
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">{event.attendees.map((a) => (a.name || a.email).split(' ')[0]).join(', ')}</p>
                ) : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <NotesButton event={event} size="sm" />
                  {live && event.conferenceUrl ? (
                    <a href={event.conferenceUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                      <Video />
                      {tn('join')}
                    </a>
                  ) : null}
                </div>
                {live && meeting && ws ? <LiveCapture meeting={meeting} /> : null}
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{tn('free')}</p>
                <p className="mt-0.5 text-xs text-fg-muted">{tn('freeHint')}</p>
              </>
            )}
          </div>

          <GroupLabel>{t('today')}</GroupLabel>
          {model.today.length ? (
            <AgendaList events={model.today} data={data} model={model} withNow />
          ) : (
            <p className="px-4 py-1 text-sm text-fg-subtle">{t('empty')}</p>
          )}
          {showNextDay ? (
            <>
              <GroupLabel>{nextDayLabel}</GroupLabel>
              <AgendaList events={model.nextDay.slice(0, 5)} data={data} model={model} />
            </>
          ) : null}

          <Recent data={data} onTimeline={onTimeline} />
        </div>
      )}
    </Column>
  )
}

function AgendaList({ events, data, model, withNow }: { events: CalendarEvent[]; data: BriefData; model: BriefModel; withNow?: boolean }) {
  const t = useTranslations('pulse.brief.agenda')
  const nowIndex = withNow ? events.findIndex((e) => new Date(e.start) > data.now) : -1
  const rows = events.map((e) => {
    const meeting = model.meetingByEvent.get(e.id) ?? null
    const ws = meeting ? data.wsMap.get(meeting.workspace_id) : e.links[0] ? data.wsMap.get(e.links[0].workspaceId) : undefined
    const live = new Date(e.start) <= data.now && new Date(e.end) > data.now
    const past = new Date(e.end) <= data.now
    const closed = meeting?.phase === 'closed'
    const unclosed = past && meeting && !closed
    const cls = cn('flex h-8 items-center gap-2.5 px-4', live && 'bg-highlight', meeting && 'hover:bg-hover/60')
    const body = (
      <>
        <span className={cn('w-10 shrink-0 font-mono text-xs tabular-nums', past ? 'text-fg-subtle' : 'text-fg-muted')}>{format(new Date(e.start), 'HH:mm')}</span>
        <span className={cn('min-w-0 flex-1 truncate text-sm', past && !unclosed ? 'text-fg-subtle' : 'text-fg', live && 'font-semibold')}>{e.title}</span>
        {live ? <span className="shrink-0 text-2xs font-medium uppercase text-mandarina-ink">{t('live')}</span> : null}
        {unclosed ? <span className="shrink-0 text-2xs text-mandarina-ink">{t('unclosed')}</span> : null}
        {closed ? <Check className="size-3.5 shrink-0 text-fg-subtle" /> : null}
        {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
      </>
    )
    return (
      <li key={e.id}>
        {meeting ? (
          <Link href={`/m/${meeting.id}${unclosed ? '?view=closed' : ''}`} className={cls}>
            {body}
          </Link>
        ) : (
          <div className={cls}>{body}</div>
        )}
      </li>
    )
  })
  if (withNow) {
    const marker = (
      <li key="now" className="flex items-center gap-2 px-4 py-1" aria-hidden>
        <span className="rounded-sm bg-mandarina px-1 font-mono text-2xs font-semibold text-on-mandarina">{format(data.now, 'HH:mm')}</span>
        <span className="h-px flex-1 bg-mandarina/70" />
      </li>
    )
    rows.splice(nowIndex === -1 ? rows.length : nowIndex, 0, marker)
  }
  return <ul>{rows}</ul>
}

function Recent({ data, onTimeline }: { data: BriefData; onTimeline: () => void }) {
  const t = useTranslations('pulse.brief.recent')
  const locale = useDateLocale()
  const entries = useMemo(() => {
    const closed = data.meetings
      .filter((m) => m.phase === 'closed' && data.scopeIds.includes(m.workspace_id))
      .map((m) => ({ type: 'meeting' as const, at: new Date(m.closed_at ?? m.starts_at), id: m.id, ws: m.workspace_id, title: m.title, href: `/m/${m.id}` }))
    const sessions = data.docs
      .filter((d) => d.source === 'claude' && data.scopeIds.includes(d.workspace_id))
      .map((d) => ({ type: 'doc' as const, at: new Date(d.created_at), id: d.id, ws: d.workspace_id, title: d.title, href: `/w/${data.wsMap.get(d.workspace_id)?.slug}/docs/${d.id}` }))
    return [...closed, ...sessions].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 4)
  }, [data.meetings, data.docs, data.scopeIds, data.wsMap])
  if (!entries.length) return null
  return (
    <div className="mt-2 border-t border-line-soft">
      <div className="flex items-center px-4 pb-1 pt-3">
        <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{t('title')}</p>
        <span className="ml-auto">
          <MoreLink onClick={onTimeline}>{t('all')}</MoreLink>
        </span>
      </div>
      <ul>
        {entries.map((e) => {
          const ws = data.wsMap.get(e.ws)
          return (
            <li key={`${e.type}-${e.id}`}>
              <Link href={e.href} className="flex h-8 items-center gap-2.5 px-4 hover:bg-hover/60">
                {e.type === 'meeting' ? <Mic className="size-3.5 shrink-0 text-mandarina-ink" /> : <Bot className="size-3.5 shrink-0 text-accent" />}
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{e.title}</span>
                {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
                <span className="w-16 shrink-0 text-right text-2xs text-fg-subtle">{formatDistanceToNowStrict(e.at, { locale })}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------- 3) pendientes de reuniones ----------

export function LooseColumn({ data, model }: { data: BriefData; model: BriefModel }) {
  const t = useTranslations('pulse.brief.loose')
  const locale = useDateLocale()
  const meetingById = new Map(data.meetings.map((m) => [m.id, m]))
  const inScope = (i: MeetingItemRow) => data.scopeIds.includes(i.workspace_id) && meetingById.has(i.meeting_id)
  const questions = data.items.filter((i) => i.kind === 'question' && !i.done && inScope(i))
  const unowned = data.items.filter((i) => i.kind === 'action' && !i.assignee_id && !i.task_id && inScope(i) && meetingById.get(i.meeting_id)?.phase !== 'closed')
  const total = model.unclosed.length + questions.length + unowned.length

  return (
    <Column title={t('title')} subtitle={t('subtitle')} count={total}>
      {data.itemsLoading ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-2.5 px-4 py-6 text-sm text-fg-muted">
          <CheckCheck className="size-4 shrink-0 text-success" />
          {t('empty')}
        </div>
      ) : (
        <div className="pb-3">
          {model.unclosed.length ? (
            <>
              <GroupLabel tone="text-mandarina-ink" hint={t('meetingsHint')}>
                {t('meetings')}
              </GroupLabel>
              <ul>
                {model.unclosed.map((m) => {
                  const ws = data.wsMap.get(m.workspace_id)
                  return (
                    <li key={m.id} className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-hover/50">
                      {ws ? <WorkspaceMark ws={ws} size={16} /> : null}
                      <Link href={`/m/${m.id}`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{m.title}</span>
                        <span className="block text-2xs text-fg-subtle">{t('ended', { ago: formatDistanceToNowStrict(new Date(m.ends_at ?? m.starts_at), { addSuffix: true, locale }) })}</span>
                      </Link>
                      <Link
                        href={`/m/${m.id}?view=closed`}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-warning-soft px-2 text-xs font-medium text-mandarina-ink transition-colors hover:bg-mandarina hover:text-on-mandarina"
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
              <GroupLabel tone="text-k-question" hint={t('questionsHint')}>
                {t('questions')}
              </GroupLabel>
              <ul>
                {questions.map((q) => (
                  <li key={q.id}>
                    <Link href={`/m/${q.meeting_id}`} className="flex items-start gap-2.5 px-4 py-1.5 hover:bg-hover/50">
                      <CircleHelp className="mt-0.5 size-4 shrink-0 text-k-question" />
                      <span className="min-w-0">
                        <span className="block text-sm leading-snug text-fg">{q.text}</span>
                        <span className="block truncate text-2xs text-fg-subtle">{meetingById.get(q.meeting_id)?.title}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {unowned.length ? (
            <>
              <GroupLabel tone="text-k-action" hint={t('unownedHint')}>
                {t('unowned')}
              </GroupLabel>
              <ul>
                {unowned.map((a) => (
                  <UnownedLine key={a.id} item={a} meetingTitle={meetingById.get(a.meeting_id)?.title ?? ''} ws={data.wsMap.get(a.workspace_id)} />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </Column>
  )
}

/** Acción sin responsable: se asigna desde aquí y se vuelve tarea al cerrar la reunión. */
function UnownedLine({ item, meetingTitle, ws }: { item: MeetingItemRow; meetingTitle: string; ws: WorkspaceWithRole | undefined }) {
  const t = useTranslations('pulse.brief.loose')
  const members = useWorkspaceMembers(item.workspace_id)
  const { update } = useMeetingItemMutations(item.meeting_id)
  return (
    <li className="flex items-start gap-2.5 px-4 py-1.5 hover:bg-hover/50">
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
