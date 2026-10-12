'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { addDays, format, isSameDay, startOfDay, subDays } from 'date-fns'
import { ArrowLeft, ChevronDown, Diamond } from 'lucide-react'
import { useApp, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { StatusIcon } from '@/components/tasks/status-icon'
import { ConnectCalendar } from '@/components/calendar/connect-calendar'
import { CalendarError, useCalendarEvents } from '@/lib/queries/calendar'
import { useTasks } from '@/lib/queries/tasks'
import { useMeetingsInRange, useWorkspaceItems } from '@/lib/queries/meetings'
import { useRecentDocs } from '@/lib/queries/docs'
import { useLocalStorage, useNow } from '@/lib/hooks'
import { useScopes } from '@/lib/scope'
import { useDateLocale } from '@/lib/dates'
import { cn, taskRef } from '@/lib/utils'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import type { CalendarEvent, DocSummary, WorkspaceWithRole } from '@/lib/types'
import { PasilloStrip } from './pasillo-strip'
import { AskBar } from './ask-bar'
import { AgendaColumn, Counters, LooseColumn, TodayColumn, ViewSentence, useBriefModel, type BriefData } from './brief'
import { DocThread, LiveCard, MeetingThread, UpcomingCard } from './cards'
import { useOpenTask } from '@/lib/use-open-task'

type Entry =
  | { type: 'event'; at: Date; event: CalendarEvent; meeting: MeetingRow | null }
  | { type: 'meeting'; at: Date; meeting: MeetingRow }
  | { type: 'doc'; at: Date; doc: DocSummary }


export function PulseView() {
  const t = useTranslations('pulse')
  const appLocale = useLocale()
  const locale = useDateLocale()
  const { workspaces, observedWorkspaces, google, profile } = useApp()
  const wsMap = useWorkspaceMap()
  const now = useNow(30_000)
  const [filter, setFilter] = useState<string>('all')
  const nowRef = useRef<HTMLDivElement>(null)

  const wsIds = useMemo(() => workspaces.map((w) => w.id), [workspaces])
  // Las tareas también se leen de los espacios donde trabaja mi equipo (solo lectura, por jerarquía)
  const taskWsIds = useMemo(() => [...wsIds, ...observedWorkspaces.map((w) => w.id)], [wsIds, observedWorkspaces])
  const scopeIds = useMemo(() => (filter === 'all' ? taskWsIds : [filter]), [filter, taskWsIds])
  const from = useMemo(() => subDays(startOfDay(new Date()), 6), [])
  // Una semana hacia adelante para encontrar la próxima reunión aunque caiga después del fin de semana.
  const to = useMemo(() => addDays(startOfDay(new Date()), 8), [])

  const { data: events, error, isLoading } = useCalendarEvents(from, to, Boolean(google))
  const { data: meetings } = useMeetingsInRange(wsIds, from, to)
  const { data: items } = useWorkspaceItems(wsIds)
  const { data: tasks } = useTasks({ kind: 'workspaces', workspaceIds: taskWsIds })
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

  // La línea de tiempo muestra solo lo inmediato (hoy y mañana) por delante.
  const horizon = addDays(startOfDay(now), 2)
  const future = entries.filter((e) => entryEnd(e) > now && e.at > now && e.at < horizon)
  const live = entries.filter((e) => e.at <= now && entryEnd(e) > now && e.type === 'event')
  const past = entries.filter((e) => e.at <= now && !live.includes(e))

  const deadlines = (tasks ?? []).filter((x) => x.status !== 'done' && x.due_date && scopeIds.includes(x.workspace_id))

  // Hoy siempre abre en la vista principal; la línea de tiempo es un desvío desde "Lo último que pasó".
  const [view, setView] = useState<'brief' | 'timeline'>('brief')

  useEffect(() => {
    if (!isLoading && view === 'timeline') nowRef.current?.scrollIntoView({ block: 'center' })
  }, [isLoading, view])

  const filters: { id: string; label: string; ws?: WorkspaceWithRole }[] = [
    { id: 'all', label: t('allWorkspaces') },
    ...workspaces.map((w) => ({ id: w.id, label: w.name, ws: w })),
  ]

  const briefData: BriefData = {
    now,
    scopeIds,
    filter,
    events,
    eventsLoading: Boolean(google) && isLoading,
    calendarIssue: errorCode,
    meetings: meetings ?? [],
    items: items ?? [],
    itemsLoading: !items || !meetings,
    itemsByMeeting,
    tasks,
    docs: docs ?? [],
    wsMap,
  }
  const { options: scopes, resolve } = useScopes()
  const [scopeId, setScopeId] = useLocalStorage<string>('veltro:home-scope', 'me')
  const scope = resolve(scopeId)
  const model = useBriefModel(briefData, scope.userIds)
  const hour = now.getHours()
  const greeting = hour < 12 ? 'morning' : hour < 19 ? 'afternoon' : 'evening'
  const dateLine = `${new Intl.DateTimeFormat(appLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)} · ${t('weekOf', { week: format(now, 'w', { locale }) })}`

  const filterChips =
    workspaces.length > 1 ? (
      <div className="flex items-center gap-0.5 rounded-lg bg-sidebar p-0.5">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            title={f.label}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
              filter === f.id ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
            )}
          >
            {f.ws ? <WorkspaceMark ws={f.ws} size={14} /> : f.label}
          </button>
        ))}
      </div>
    ) : null

  if (view === 'timeline') {
    return (
      <div className="@container/pulse min-h-full">
        <div className="mx-auto w-full max-w-[860px] px-4 pb-24 pt-6 sm:px-8">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setView('brief')} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
              <ArrowLeft className="size-4" />
              {t('brief.back')}
            </button>
            <h1 className="text-sm font-semibold">{t('brief.timeline')}</h1>
            <span className="ml-auto">{filterChips}</span>
            <button
              type="button"
              onClick={() => nowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-fg hover:bg-hover"
            >
              <span className="size-2 rounded-full bg-mandarina" />
              {t('now')}
            </button>
          </div>
          {!google || errorCode === 'google_not_connected' || errorCode === 'google_auth_revoked' ? (
            <div className="pb-6">
              <ConnectCalendar reason={errorCode ?? undefined} returnTo="/home" compact />
            </div>
          ) : null}
          {isLoading && google ? (
            <div className="flex flex-col gap-4 pl-16">
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <Stream future={future} live={live} past={past} now={now} nowRef={nowRef} itemsByMeeting={itemsByMeeting} tasks={tasks ?? []} deadlines={deadlines} wsMap={wsMap} />
          )}
        </div>
      </div>
    )
  }

  // Pulso: todo en una pantalla. Arriba quién eres, qué estás mirando y la pregunta a Veltro;
  // después cuánto hay y tres columnas que hacen scroll por dentro.
  return (
    <div className="@container/pulse h-full">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-4 py-5 sm:px-6 @min-[1000px]/pulse:h-full">
        <header className="flex shrink-0 flex-wrap items-end gap-x-6 gap-y-2">
          <div className="mr-auto min-w-0">
            <p className="text-xs font-medium text-fg-subtle first-letter:uppercase">{dateLine}</p>
            <h1 className="font-brand text-[28px] font-semibold leading-tight tracking-[-0.03em]">
              {t(`brief.greeting.${greeting}`, { name: profile.full_name.split(' ')[0] })}
            </h1>
          </div>
          <ViewSentence scopes={scopes} scope={scope} onScope={setScopeId} workspaces={workspaces} filter={filter} onFilter={setFilter} />
        </header>

        <div className="relative z-20 shrink-0">
          <AskBar tasks={tasks ?? []} items={items ?? []} meetings={meetings ?? []} docs={docs ?? []} />
        </div>

        <div className="shrink-0">
          <Counters model={model} scope={scope} loading={!tasks} />
        </div>

        {scope.kind === 'me' ? (
          <div className="shrink-0 empty:hidden">
            <PasilloStrip />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 @min-[1000px]/pulse:min-h-0 @min-[1000px]/pulse:flex-1 @min-[1000px]/pulse:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <TodayColumn data={briefData} model={model} scope={scope} />
          <AgendaColumn data={briefData} model={model} onTimeline={() => setView('timeline')} />
          <LooseColumn data={briefData} model={model} />
        </div>
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
      <div key={`day-${key}`} className="sticky top-0 z-10 -mx-1 mb-1 mt-6 flex items-center gap-3 bg-canvas/95 px-1 py-2 first:mt-0">
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
  const { open } = useOpenTask()
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
