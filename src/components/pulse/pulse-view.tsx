'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { addDays, differenceInMinutes, format, isSameDay, startOfDay, subDays } from 'date-fns'
import { ArrowRight, CheckCheck, ChevronDown, Diamond, Video } from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark, DocMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { StatusIcon } from '@/components/tasks/status-icon'
import { ConnectCalendar } from '@/components/calendar/connect-calendar'
import { NotesButton } from '@/components/calendar/notes-button'
import { CaptureBox } from '@/components/meeting/capture-box'
import { KindChip } from '@/components/meeting/kinds'
import { CalendarError, useCalendarEvents } from '@/lib/queries/calendar'
import { useTasks } from '@/lib/queries/tasks'
import { useMeetingItemMutations, useMeetingsInRange, useWorkspaceItems } from '@/lib/queries/meetings'
import { useRecentDocs } from '@/lib/queries/docs'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useTaskPanel, useNow } from '@/lib/hooks'
import { useDateLocale } from '@/lib/dates'
import { suggestAgenda } from '@/lib/assistant'
import { cn, taskRef } from '@/lib/utils'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import type { CalendarEvent, DocSummary, WorkspaceWithRole } from '@/lib/types'
import { FocusPanel } from './focus-panel'

type Entry =
  | { type: 'event'; at: Date; event: CalendarEvent; meeting: MeetingRow | null }
  | { type: 'meeting'; at: Date; meeting: MeetingRow }
  | { type: 'doc'; at: Date; doc: DocSummary }


export function PulseView() {
  const t = useTranslations('pulse')
  const appLocale = useLocale()
  const locale = useDateLocale()
  const { workspaces, google, account } = useApp()
  const wsMap = useWorkspaceMap()
  const now = useNow(30_000)
  const [filter, setFilter] = useState<string>('all')
  const nowRef = useRef<HTMLDivElement>(null)

  const wsIds = useMemo(() => workspaces.map((w) => w.id), [workspaces])
  const scopeIds = useMemo(() => (filter === 'all' ? wsIds : [filter]), [filter, wsIds])
  const from = useMemo(() => subDays(startOfDay(new Date()), 6), [])
  const to = useMemo(() => addDays(startOfDay(new Date()), 2), [])

  const { data: events, error, isLoading } = useCalendarEvents(from, to, Boolean(google))
  const { data: meetings } = useMeetingsInRange(wsIds, from, to)
  const { data: items } = useWorkspaceItems(wsIds)
  const { data: tasks } = useTasks({ kind: 'workspaces', workspaceIds: wsIds })
  const { data: docs } = useRecentDocs(wsIds, 30)
  const errorCode = error instanceof CalendarError ? error.code : null

  const itemsByMeeting = useMemo(() => {
    const m = new Map<string, MeetingItemRow[]>()
    for (const i of items ?? []) m.set(i.meeting_id, [...(m.get(i.meeting_id) ?? []), i])
    for (const list of m.values()) list.sort((a, b) => a.position - b.position)
    return m
  }, [items])

  const entries = useMemo(() => {
    const out: Entry[] = []
    const meetingByEvent = new Map((meetings ?? []).map((m) => [m.google_event_id, m]))
    const usedMeetings = new Set<string>()
    for (const e of events ?? []) {
      if (e.allDay) continue
      const meeting = meetingByEvent.get(e.id) ?? null
      if (meeting) usedMeetings.add(meeting.id)
      const inScope = filter === 'all' || meeting?.workspace_id === filter || e.links.some((l) => l.workspaceId === filter)
      if (!inScope) continue
      // del pasado solo mostramos lo enlazado (hilos) o lo de hoy
      if (new Date(e.end) < now && !meeting && !isSameDay(new Date(e.start), now)) continue
      out.push({ type: 'event', at: new Date(e.start), event: e, meeting })
    }
    for (const m of meetings ?? []) {
      if (usedMeetings.has(m.id) || !scopeIds.includes(m.workspace_id)) continue
      out.push({ type: 'meeting', at: new Date(m.starts_at), meeting: m })
    }
    for (const d of docs ?? []) {
      if (d.source !== 'claude' || !scopeIds.includes(d.workspace_id)) continue
      if (new Date(d.created_at) < from) continue
      out.push({ type: 'doc', at: new Date(d.created_at), doc: d })
    }
    return out.sort((a, b) => b.at.getTime() - a.at.getTime())
  }, [events, meetings, docs, filter, scopeIds, now, from])

  const future = entries.filter((e) => entryEnd(e) > now && e.at > now)
  const live = entries.filter((e) => e.at <= now && entryEnd(e) > now && e.type === 'event')
  const past = entries.filter((e) => !future.includes(e) && !live.includes(e))

  const deadlines = (tasks ?? []).filter((x) => x.status !== 'done' && x.due_date && scopeIds.includes(x.workspace_id))

  useEffect(() => {
    if (!isLoading) nowRef.current?.scrollIntoView({ block: 'center' })
  }, [isLoading])

  const filters: { id: string; label: string; ws?: WorkspaceWithRole }[] = [
    { id: 'all', label: t('allWorkspaces') },
    ...workspaces.map((w) => ({ id: w.id, label: w.name, ws: w })),
  ]

  return (
    // El layout responde al ancho disponible (no al viewport): con el panel de tarea abierto, el foco baja en vez de apretar.
    <div className="@container/pulse min-h-full">
    <div className="grid min-h-full grid-cols-1 @min-[1100px]/pulse:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 border-line @min-[1100px]/pulse:border-r">
        <header className="sticky top-0 z-20 flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-line-soft bg-canvas/95 px-4 pb-4 pt-6 sm:px-8">
          <div className="mr-auto">
            <h1 className="font-brand text-[28px] font-semibold leading-tight tracking-[-0.03em] first-letter:uppercase">
              {new Intl.DateTimeFormat(appLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
            </h1>
            <p className="text-sm text-fg-muted">
              {t('weekOf', { week: format(now, 'w', { locale }) })} · {account.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-sidebar p-1">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors',
                  filter === f.id ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                )}
              >
                {f.ws ? <WorkspaceMark ws={f.ws} size={14} /> : null}
                <span className={cn(f.ws && 'hidden @min-[900px]/pulse:inline')}>{f.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => nowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-fg hover:bg-hover"
          >
            <span className="size-2 rounded-full bg-mandarina" />
            {t('now')}
          </button>
        </header>

        {!google || errorCode === 'google_not_connected' || errorCode === 'google_auth_revoked' ? (
          <div className="px-4 pt-6 sm:px-8">
            <ConnectCalendar reason={errorCode ?? undefined} returnTo="/home" compact />
          </div>
        ) : null}

        <div className="relative px-4 pb-24 pt-4 sm:px-8">
          {isLoading && google ? (
            <div className="flex flex-col gap-4 pl-16">
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <Stream
              future={future}
              live={live}
              past={past}
              now={now}
              nowRef={nowRef}
              itemsByMeeting={itemsByMeeting}
              tasks={tasks ?? []}
              deadlines={deadlines}
              wsMap={wsMap}
            />
          )}
        </div>
      </div>

      <FocusPanel loading={!tasks} tasks={tasks ?? []} items={items ?? []} meetings={meetings ?? []} docs={docs ?? []} scopeIds={scopeIds} />
    </div>
    </div>
  )
}

function entryEnd(e: Entry) {
  if (e.type === 'event') return new Date(e.event.end)
  if (e.type === 'meeting') return new Date(e.meeting.ends_at ?? e.meeting.starts_at)
  return new Date(e.doc.created_at)
}

// ---------------- stream ----------------

function Stream({
  future,
  live,
  past,
  now,
  nowRef,
  itemsByMeeting,
  tasks,
  deadlines,
  wsMap,
}: {
  future: Entry[]
  live: Entry[]
  past: Entry[]
  now: Date
  nowRef: React.RefObject<HTMLDivElement | null>
  itemsByMeeting: Map<string, MeetingItemRow[]>
  tasks: TaskRow[]
  deadlines: TaskRow[]
  wsMap: Map<string, WorkspaceWithRole>
}) {
  const t = useTranslations('pulse')
  const locale = useDateLocale()
  const days = new Set<string>()
  const dayHeader = (d: Date) => {
    const key = format(d, 'yyyy-MM-dd')
    if (days.has(key)) return null
    days.add(key)
    const label = isSameDay(d, now) ? t('today') : isSameDay(d, addDays(now, 1)) ? t('tomorrow') : isSameDay(d, subDays(now, 1)) ? t('yesterday') : format(d, 'EEEE d MMMM', { locale })
    const dl = deadlines.filter((x) => x.due_date === key)
    return (
      <div key={`day-${key}`} className="sticky top-[86px] z-10 -mx-1 mb-1 mt-6 flex items-center gap-3 bg-canvas/95 px-1 py-2 first:mt-0">
        <span className="w-14 shrink-0 font-mono text-2xs uppercase tracking-wider text-accent-ink">{format(d, 'EEE d', { locale })}</span>
        <span className="text-sm font-semibold first-letter:uppercase">{label}</span>
        {dl.length ? <Deliveries tasks={dl} wsMap={wsMap} /> : null}
      </div>
    )
  }

  const render = (e: Entry) => {
    const header = dayHeader(e.at)
    return (
      <div key={`${e.type}-${e.type === 'event' ? e.event.id : e.type === 'meeting' ? e.meeting.id : e.doc.id}`}>
        {header}
        <Row time={format(e.at, 'HH:mm')}>
          {e.type === 'doc' ? (
            <DocThread doc={e.doc} tasks={tasks} wsMap={wsMap} />
          ) : e.type === 'meeting' || (e.type === 'event' && new Date(e.event.end) <= now) ? (
            <MeetingThread
              title={e.type === 'event' ? e.event.title : e.meeting.title}
              meeting={e.meeting}
              event={e.type === 'event' ? e.event : null}
              items={e.meeting ? (itemsByMeeting.get(e.meeting.id) ?? []) : []}
              tasks={tasks}
              wsMap={wsMap}
            />
          ) : (
            <UpcomingCard event={e.event} meeting={e.meeting} items={e.meeting ? (itemsByMeeting.get(e.meeting.id) ?? []) : []} tasks={tasks} wsMap={wsMap} now={now} />
          )}
        </Row>
      </div>
    )
  }

  return (
    <div className="relative">
      <span className="absolute bottom-0 left-[62px] top-0 w-px bg-line" aria-hidden />
      {future.map(render)}

      <div ref={nowRef} className="relative my-5 scroll-mt-40">
        {dayHeader(now)}
        <div className="relative flex items-center gap-3">
          <span className="z-[1] inline-flex h-6 w-[52px] items-center justify-center rounded-md bg-mandarina font-mono text-xs font-semibold text-on-mandarina">
            {format(now, 'HH:mm')}
          </span>
          <span className="h-0.5 flex-1 rounded-full bg-mandarina" />
          <span className="text-2xs font-semibold uppercase tracking-wider text-mandarina-ink">{t('nowLine')}</span>
        </div>
        {live.map((e) =>
          e.type === 'event' ? (
            <div key={e.event.id} className="mt-3 pl-[76px]">
              <LiveCard event={e.event} meeting={e.meeting} items={e.meeting ? (itemsByMeeting.get(e.meeting.id) ?? []) : []} wsMap={wsMap} now={now} />
            </div>
          ) : null,
        )}
      </div>

      {past.length ? past.map(render) : <p className="pl-[76px] text-sm text-fg-muted">{t('nothingPast')}</p>}
    </div>
  )
}

/** Entregas del día: el contador abre la lista y cada tarea abre su panel. */
function Deliveries({ tasks, wsMap }: { tasks: TaskRow[]; wsMap: Map<string, WorkspaceWithRole> }) {
  const t = useTranslations('pulse')
  const { open } = useTaskPanel()
  return (
    <Popover>
      <PopoverTrigger className="ml-auto inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg data-[popup-open]:bg-hover data-[popup-open]:text-fg">
        <Diamond className="size-3 text-mandarina" />
        {t('deliveries', { count: tasks.length })}
        <ChevronDown className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5">
        <ul className="flex flex-col">
          {tasks.map((x) => {
            const ws = wsMap.get(x.workspace_id)
            return (
              <li key={x.id}>
                <button type="button" onClick={() => open(x.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover">
                  <StatusIcon status={x.status} />
                  {ws ? <span className="font-mono text-2xs text-fg-subtle">{taskRef(ws.key, x.number)}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function Row({ time, children }: { time: string; children: React.ReactNode }) {
  return (
    <div className="relative flex gap-6 py-2">
      <span className="w-[52px] shrink-0 pt-3 text-right font-mono text-xs tabular-nums text-fg-subtle">{time}</span>
      <span className="absolute left-[59px] top-[18px] z-[1] size-[7px] rounded-full border-2 border-canvas bg-line-strong" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// ---------------- tarjetas ----------------

function UpcomingCard({
  event,
  meeting,
  items,
  tasks,
  wsMap,
  now,
}: {
  event: CalendarEvent
  meeting: MeetingRow | null
  items: MeetingItemRow[]
  tasks: TaskRow[]
  wsMap: Map<string, WorkspaceWithRole>
  now: Date
}) {
  const t = useTranslations('pulse')
  const ws = meeting ? wsMap.get(meeting.workspace_id) : undefined
  const minutes = differenceInMinutes(new Date(event.start), now)
  const agenda = items.filter((i) => i.kind === 'agenda')

  return (
    <article className="rounded-xl border border-line bg-panel p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {ws ? <WorkspaceMark ws={ws} size={18} /> : null}
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{event.title}</h3>
        <span className="text-xs text-fg-muted">
          {minutes < 60 ? t('inMinutes', { minutes }) : t('inHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })}
        </span>
        <NotesButton event={event} />
      </div>
      <People event={event} />
      {ws ? (
        <PrepareBox ws={ws} event={event} agenda={agenda} tasks={tasks.filter((x) => x.workspace_id === ws.id)} meetingId={meeting?.id ?? null} />
      ) : (
        <p className="mt-3 text-xs text-fg-subtle">{t('linkToPrepare')}</p>
      )}
    </article>
  )
}

function PrepareBox({
  ws,
  event,
  agenda,
  tasks,
  meetingId,
}: {
  ws: WorkspaceWithRole
  event: CalendarEvent
  agenda: MeetingItemRow[]
  tasks: TaskRow[]
  meetingId: string | null
}) {
  const t = useTranslations('pulse')
  const tm = useTranslations('meeting')
  const members = useWorkspaceMembers(ws.id)
  const attendeeIds = useMemo(() => {
    const emails = new Set(event.attendees.map((a) => a.email.toLowerCase()))
    return members.filter((m) => emails.has(m.email.toLowerCase())).map((m) => m.id)
  }, [event.attendees, members])
  const suggestions = suggestAgenda({ tasks, taskRef: (x) => taskRef(ws.key, x.number), attendeeIds, previousItems: [], existing: agenda })
  const lines = agenda.length ? agenda.map((a) => ({ id: a.id, text: a.text, reason: null as string | null })) : suggestions.slice(0, 4).map((s) => ({ id: s.text, text: s.text, reason: s.reason }))
  if (!lines.length) return null

  return (
    <div className="mt-3 rounded-lg bg-highlight px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wider text-highlight-ink">{agenda.length ? t('agendaReady') : t('prepare')}</span>
        <span className="text-2xs text-fg-muted">{agenda.length ? t('agendaCount', { count: agenda.length }) : t('suggested', { count: suggestions.length })}</span>
        {meetingId ? (
          <Link href={`/m/${meetingId}`} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
            {t('openRoom')}
            <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1">
        {lines.map((l) => (
          <li key={l.id} className="flex items-center gap-2 text-sm">
            {l.reason ? <span className="w-16 shrink-0 text-2xs font-medium text-fg-subtle">{tm(`reason.${l.reason}`)}</span> : <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
            <span className="min-w-0 truncate">{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LiveCard({
  event,
  meeting,
  items,
  wsMap,
  now,
}: {
  event: CalendarEvent
  meeting: MeetingRow | null
  items: MeetingItemRow[]
  wsMap: Map<string, WorkspaceWithRole>
  now: Date
}) {
  const t = useTranslations('pulse')
  const ws = meeting ? wsMap.get(meeting.workspace_id) : undefined
  const remaining = differenceInMinutes(new Date(event.end), now)
  const agenda = items.filter((i) => i.kind === 'agenda')
  const captured = items.filter((i) => i.kind !== 'agenda').slice(-3)

  return (
    <article className="rounded-2xl bg-highlight p-4 ring-1 ring-accent/15">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-mandarina-ink">
          <span className="size-2 animate-pulse rounded-full bg-mandarina" />
          {t('live')}
        </span>
        {ws ? <WorkspaceMark ws={ws} size={18} /> : null}
        <span className="font-mono text-xs text-fg-muted">
          {format(new Date(event.start), 'HH:mm')} - {format(new Date(event.end), 'HH:mm')} · {t('remaining', { minutes: remaining })}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {event.conferenceUrl ? (
            <a href={event.conferenceUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'primary', size: 'xs' })}>
              <Video />
              {t('join')}
            </a>
          ) : null}
          <NotesButton event={event} />
        </span>
      </div>
      <h3 className="mt-2 text-lg font-semibold text-highlight-ink">{event.title}</h3>
      <People event={event} />

      {agenda.length ? (
        <ol className="mt-3 flex flex-wrap gap-1.5">
          {agenda.map((a, i) => (
            <li key={a.id} className={cn('inline-flex h-6 max-w-72 items-center gap-1.5 rounded-full px-2.5 text-xs', a.done ? 'bg-panel/50 text-fg-subtle line-through' : 'bg-panel text-fg shadow-card')}>
              <span className="font-mono text-fg-subtle">{i + 1}</span>
              <span className="truncate">{a.text}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {captured.length ? (
        <ul className="mt-3 flex flex-col gap-1">
          {captured.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              {i.kind === 'note' ? <span className="w-[74px] shrink-0" /> : <KindChip kind={i.kind} className="w-[74px] justify-center" />}
              <span className="min-w-0 truncate">{i.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {meeting && ws ? <LiveCapture meeting={meeting} /> : <p className="mt-3 text-xs text-fg-muted">{t('linkToCapture')}</p>}
    </article>
  )
}

function LiveCapture({ meeting }: { meeting: MeetingRow }) {
  const members = useWorkspaceMembers(meeting.workspace_id)
  const { add } = useMeetingItemMutations(meeting.id)
  return (
    <div className="mt-3">
      <CaptureBox members={members} onCapture={(c) => add.mutate({ ...c, position: Date.now() })} />
    </div>
  )
}

function People({ event }: { event: CalendarEvent }) {
  if (!event.attendees.length) return null
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs text-fg-muted">
      <span className="flex -space-x-1">
        {event.attendees.slice(0, 5).map((a) => (
          <Avatar key={a.email} name={a.name || a.email} seed={a.email} size={18} className="ring-2 ring-panel" />
        ))}
      </span>
      <span className="truncate">{event.attendees.map((a) => (a.name || a.email).split(' ')[0]).join(', ')}</span>
    </div>
  )
}

// ---------------- hilos ----------------

function Lineage({ decisions, tasks }: { decisions: number; tasks: TaskRow[] }) {
  const t = useTranslations('pulse')
  const done = tasks.filter((x) => x.status === 'done').length
  const blocked = tasks.filter((x) => x.status === 'blocked').length
  const open = tasks.length - done - blocked
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
      {decisions ? (
        <>
          <span className="rounded-md bg-k-decision-soft px-2 py-0.5 font-medium text-k-decision">{t('decisions', { count: decisions })}</span>
          <ArrowRight className="size-3 text-fg-subtle" />
        </>
      ) : null}
      <span className="rounded-md bg-k-action-soft px-2 py-0.5 font-medium text-k-action">{t('tasks', { count: tasks.length })}</span>
      {tasks.length ? (
        <>
          <ArrowRight className="size-3 text-fg-subtle" />
          <span className="text-fg-muted">
            {[done ? t('doneCount', { count: done }) : null, blocked ? t('blockedCount', { count: blocked }) : null, open ? t('openCount', { count: open }) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </>
      ) : null}
    </div>
  )
}

function MeetingThread({
  title,
  meeting,
  event,
  items,
  tasks,
  wsMap,
}: {
  title: string
  meeting: MeetingRow | null
  event: CalendarEvent | null
  items: MeetingItemRow[]
  tasks: TaskRow[]
  wsMap: Map<string, WorkspaceWithRole>
}) {
  const t = useTranslations('pulse')
  const [open, setOpen] = useState(false)
  const { open: openTask } = useTaskPanel()
  const ws = meeting ? wsMap.get(meeting.workspace_id) : undefined
  const decisions = items.filter((i) => i.kind === 'decision')
  const itemTaskIds = new Set(items.map((i) => i.task_id).filter(Boolean))
  const linkedTasks = meeting ? tasks.filter((x) => x.meeting_id === meeting.id || itemTaskIds.has(x.id)) : []
  const pendingClose = meeting && meeting.phase !== 'closed'

  if (!meeting) {
    return (
      <div className="flex items-center gap-3 py-1.5 text-sm text-fg-muted">
        <span className="truncate">{title}</span>
        {event ? <NotesButton event={event} /> : null}
      </div>
    )
  }

  return (
    <article className="rounded-xl border border-line-soft px-4 py-3 transition-colors hover:border-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {ws ? <WorkspaceMark ws={ws} size={18} /> : null}
        <Link href={`/m/${meeting.id}`} className="min-w-0 flex-1 truncate text-[15px] font-semibold hover:underline">
          {title}
        </Link>
        {pendingClose ? (
          <Link
            href={`/m/${meeting.id}?view=closed`}
            title={t('pendingClose')}
            className="inline-flex h-6 items-center gap-1.5 rounded-md bg-warning-soft px-2 text-xs font-medium text-mandarina-ink transition-colors hover:bg-mandarina hover:text-on-mandarina"
          >
            <CheckCheck className="size-3.5" />
            {t('closeNow')}
          </Link>
        ) : null}
        {decisions.length || linkedTasks.length ? (
          <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg" aria-expanded={open}>
            {open ? t('hide') : t('show')}
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        ) : null}
      </div>
      {meeting.summary ? (
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
          <span className="font-medium text-accent-ink">{t('summaryBy')}</span> {meeting.summary}
        </p>
      ) : null}
      {decisions.length || linkedTasks.length ? <Lineage decisions={decisions.length} tasks={linkedTasks} /> : null}
      {open ? (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-line-soft pt-3">
          {decisions.map((d) => (
            <p key={d.id} className="flex items-start gap-2 text-sm">
              <KindChip kind="decision" className="mt-0.5" />
              {d.text}
            </p>
          ))}
          {linkedTasks.map((x) => (
            <button key={x.id} type="button" onClick={() => openTask(x.id)} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-hover">
              <StatusIcon status={x.status} />
              <span className="font-mono text-2xs text-fg-subtle">{ws ? taskRef(ws.key, x.number) : ''}</span>
              <span className="truncate">{x.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function DocThread({ doc, tasks, wsMap }: { doc: DocSummary; tasks: TaskRow[]; wsMap: Map<string, WorkspaceWithRole> }) {
  const t = useTranslations('pulse')
  const memberMap = useMemberMap()
  const ws = wsMap.get(doc.workspace_id)
  const linked = tasks.filter((x) => x.doc_id === doc.id)
  const author = doc.created_by ? memberMap.get(doc.created_by) : undefined
  return (
    <article className="rounded-xl border border-line-soft px-4 py-3 hover:border-line">
      <div className="flex items-center gap-3">
        <DocMark source="claude" />
        <Link href={`/w/${ws?.slug}/docs/${doc.id}`} className="min-w-0 flex-1 truncate text-[15px] font-semibold hover:underline">
          {doc.title}
        </Link>
        {ws ? <WorkspaceMark ws={ws} size={16} /> : null}
      </div>
      <p className="mt-1 text-xs text-fg-muted">{t('claudeSession', { who: author?.full_name ?? '' })}</p>
      {linked.length ? <Lineage decisions={0} tasks={linked} /> : null}
    </article>
  )
}
