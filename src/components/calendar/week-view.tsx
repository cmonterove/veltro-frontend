'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addDays, addWeeks, differenceInMinutes, eachDayOfInterval, endOfDay, format, isSameDay, isToday, startOfDay, startOfWeek } from 'date-fns'
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp, useWorkspaceMap } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarError, useCalendarEvents } from '@/lib/queries/calendar'
import { useTasks } from '@/lib/queries/tasks'
import { useTaskPanel } from '@/lib/hooks'
import { toDateKey, useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/types'
import { StatusIcon } from '@/components/tasks/status-icon'
import { EventDetails } from './event-details'
import { ConnectCalendar } from './connect-calendar'
import { NewMeetingDialog } from './new-meeting-dialog'

const HOUR = 48

type Placed = { event: CalendarEvent; top: number; height: number; col: number; cols: number }

function layoutDay(events: CalendarEvent[], day: Date): Placed[] {
  const dayStart = startOfDay(day)
  const dayEnd = endOfDay(day)
  const items = events
    .map((e) => {
      const s = new Date(e.start) < dayStart ? dayStart : new Date(e.start)
      const en = new Date(e.end) > dayEnd ? dayEnd : new Date(e.end)
      const top = (differenceInMinutes(s, dayStart) / 60) * HOUR
      const height = Math.max(20, (differenceInMinutes(en, s) / 60) * HOUR - 2)
      return { event: e, top, height, end: top + height, col: 0, cols: 1 }
    })
    .sort((a, b) => a.top - b.top || b.height - a.height)

  // agrupar eventos que se solapan y repartir columnas
  let cluster: typeof items = []
  let clusterEnd = -1
  const flush = () => {
    const colsEnd: number[] = []
    for (const it of cluster) {
      let c = colsEnd.findIndex((end) => end <= it.top)
      if (c === -1) {
        c = colsEnd.length
        colsEnd.push(it.end)
      } else colsEnd[c] = it.end
      it.col = c
    }
    cluster.forEach((it) => (it.cols = colsEnd.length))
    cluster = []
  }
  for (const it of items) {
    if (cluster.length && it.top >= clusterEnd) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return items
}

/** Hora (decimal) del primer evento de hoy, para que no quede escondido sobre el scroll. */
function firstToday(events: CalendarEvent[] | undefined, now: Date) {
  const first = (events ?? []).filter((e) => !e.allDay && isSameDay(new Date(e.start), now)).map((e) => new Date(e.start))
  if (!first.length) return 24
  const d = first.reduce((a, b) => (a < b ? a : b))
  return d.getHours() + d.getMinutes() / 60 - 0.25
}

/** Calendario semanal. Con `workspaceId` muestra la vista de un espacio: sus reuniones resaltadas y sus tareas. */
export function WeekView({ workspaceId }: { workspaceId?: string } = {}) {
  const t = useTranslations('calendar')
  const locale = useDateLocale()
  const { google, workspaces, user } = useApp()
  const wsMap = useWorkspaceMap()
  const { open: openTask } = useTaskPanel()
  const weekStartsOn = locale.options?.weekStartsOn ?? 1
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn }))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [slot, setSlot] = useState<Date | null>(null)
  const params = useSearchParams()
  useEffect(() => {
    if (params.get('new') === '1' && google) setDialogOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const days = eachDayOfInterval({ start: anchor, end: addDays(anchor, 6) })
  const from = anchor
  const to = addDays(anchor, 7)
  const { data: events, error, isLoading } = useCalendarEvents(from, to, Boolean(google))
  const { data: myTasks } = useTasks(
    workspaceId ? { kind: 'workspace', workspaceId } : { kind: 'assignee', userId: user.id, workspaceIds: workspaces.map((w) => w.id) },
  )
  const scopeWs = workspaceId ? wsMap.get(workspaceId) : undefined
  const eventTone = (e: CalendarEvent) => {
    if (!workspaceId) return e.links.length ? 'linked' : 'plain'
    if (e.links.some((l) => l.workspaceId === workspaceId)) return 'mine'
    return e.links.length ? 'other' : 'unlinked'
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Al abrir una semana: si incluye hoy, la hora actual queda arriba con contexto; si no, el primer evento.
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    const key = anchor.toISOString()
    if (!el || scrolledFor.current === key || (google && isLoading)) return
    scrolledFor.current = key
    const inWeek = now >= anchor && now < addDays(anchor, 7)
    const firstHour = (events ?? [])
      .filter((e) => !e.allDay)
      .reduce((min, e) => Math.min(min, new Date(e.start).getHours() + new Date(e.start).getMinutes() / 60), 24)
    const target = inWeek ? Math.min(now.getHours() + now.getMinutes() / 60 - 1.5, firstToday(events, now)) : firstHour < 24 ? firstHour - 0.5 : 7.5
    el.scrollTo({ top: Math.max(0, target) * HOUR, behavior: scrolledFor.current && el.scrollTop ? 'smooth' : 'auto' })
  }, [anchor, events, google, isLoading, now])

  const allDay = (events ?? []).filter((e) => e.allDay)
  const timed = (events ?? []).filter((e) => !e.allDay)
  const tasksByDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof myTasks>>()
    for (const task of myTasks ?? []) {
      if (!task.due_date || task.status === 'done') continue
      if (!map.has(task.due_date)) map.set(task.due_date, [])
      map.get(task.due_date)!.push(task)
    }
    return map
  }, [myTasks])

  const errorCode = error instanceof CalendarError ? error.code : error ? 'google_error' : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6">
        <h1 className="mr-2 text-lg font-semibold capitalize tracking-tight">{format(anchor, 'LLLL yyyy', { locale })}</h1>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={() => setAnchor(addWeeks(anchor, -1))} aria-label={t('prevWeek')}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn }))}>
            {t('today')}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setAnchor(addWeeks(anchor, 1))} aria-label={t('nextWeek')}>
            <ChevronRight />
          </Button>
        </div>
        {google ? <span className="hidden text-xs text-fg-subtle md:inline">{google.email}</span> : null}
        {workspaceId ? (
          <span className="ml-auto hidden items-center gap-3 text-xs text-fg-muted lg:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('ws-' + (scopeWs?.color ?? 'violet'), 'size-2.5 rounded-sm')} style={{ background: 'var(--ws-color)' }} />
              {t('legend.mine', { workspace: scopeWs?.name ?? '' })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-dashed border-fg-subtle" />
              {t('legend.unlinked')}
            </span>
          </span>
        ) : null}
        {google ? (
          <Button
            variant="primary"
            size="sm"
            className={workspaceId ? 'ml-auto lg:ml-0' : 'ml-auto'}
            onClick={() => {
              setSlot(null)
              setDialogOpen(true)
            }}
          >
            <CalendarPlus />
            {t('newMeeting')}
          </Button>
        ) : null}
      </div>

      {!google || errorCode === 'google_not_connected' || errorCode === 'google_auth_revoked' ? (
        <div className="p-6">
          <ConnectCalendar reason={errorCode ?? undefined} returnTo={workspaceId && scopeWs ? `/w/${scopeWs.slug}/meetings` : '/calendar'} />
        </div>
      ) : null}

      <div className="flex shrink-0 border-b border-line pl-14">
        {days.map((d) => (
          <div key={d.toISOString()} className="flex min-w-0 flex-1 flex-col border-l border-line px-2 py-2">
            <span className="text-2xs font-medium uppercase text-fg-subtle">{format(d, 'EEE', { locale })}</span>
            <span
              className={cn(
                'mt-0.5 inline-flex size-7 items-center justify-center rounded-full text-base tabular-nums',
                isToday(d) ? 'bg-accent font-semibold text-accent-fg' : 'text-fg',
              )}
            >
              {format(d, 'd')}
            </span>
            <div className="mt-1 flex min-h-5 flex-col gap-0.5">
              {allDay
                .filter((e) => {
                  const s = startOfDay(new Date(e.start))
                  const en = new Date(e.end)
                  return d >= s && d < en
                })
                .map((e) => (
                  <Popover key={e.id}>
                    <PopoverTrigger className="truncate rounded-xs bg-hover px-1.5 py-0.5 text-left text-2xs text-fg-muted hover:bg-active">
                      {e.title || t('untitled')}
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <EventDetails event={e} workspaceId={workspaceId} />
                    </PopoverContent>
                  </Popover>
                ))}
              {(tasksByDay.get(toDateKey(d)) ?? []).slice(0, 3).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => openTask(task.id)}
                  className={cn('ws-' + (wsMap.get(task.workspace_id)?.color ?? 'green'), 'flex min-w-0 items-center gap-1 rounded-xs px-1 py-0.5 text-left text-2xs text-fg hover:bg-hover')}
                >
                  <StatusIcon status={task.status} className="size-3" />
                  <span className="truncate">{task.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="relative flex" style={{ height: HOUR * 24 }}>
          <div className="relative w-14 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative" style={{ height: HOUR }}>
                {h > 0 ? (
                  <span className="absolute -top-2 right-2 font-mono text-2xs tabular-nums text-fg-subtle">{String(h).padStart(2, '0')}:00</span>
                ) : null}
              </div>
            ))}
            {days.some((d) => isSameDay(d, now)) ? (
              <span
                className="absolute right-1 z-20 -translate-y-1/2 rounded-sm bg-mandarina px-1 font-mono text-2xs font-semibold tabular-nums text-on-mandarina"
                style={{ top: (differenceInMinutes(now, startOfDay(now)) / 60) * HOUR }}
              >
                {format(now, 'HH:mm')}
              </span>
            ) : null}
          </div>
          {days.map((d) => {
            const placed = layoutDay(
              timed.filter((e) => new Date(e.start) < endOfDay(d) && new Date(e.end) > startOfDay(d)),
              d,
            )
            return (
              <div key={d.toISOString()} className={cn('group/day relative min-w-0 flex-1 border-l border-line', isToday(d) && 'bg-highlight/50')}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="border-b border-line/60" style={{ height: HOUR }}>
                    {google ? (
                      // Cada media hora es un hueco: un click abre "Nueva reunión" a esa hora.
                      [0, 30].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            const at = new Date(d)
                            at.setHours(h, m, 0, 0)
                            setSlot(at)
                            setDialogOpen(true)
                          }}
                          className="group/slot flex h-1/2 w-full items-start px-1.5 pt-0.5 text-left opacity-0 transition-opacity hover:bg-accent-soft/40 hover:opacity-100 focus-visible:opacity-100"
                          aria-label={t('newAt', { time: `${String(h).padStart(2, '0')}:${m ? '30' : '00'}` })}
                        >
                          <span className="font-mono text-2xs text-accent-ink">+ {String(h).padStart(2, '0')}:{m ? '30' : '00'}</span>
                        </button>
                      ))
                    ) : null}
                  </div>
                ))}
                {isLoading && google ? <Skeleton className="absolute inset-x-1 top-[440px] h-16" /> : null}
                {placed.map(({ event, top, height, col, cols }) => {
                  const tone = eventTone(event)
                  const linked = tone === 'linked'
                  const past = new Date(event.end) < now
                  const isLive = new Date(event.start) <= now && !past
                  return (
                    <Popover key={`${event.calendarId}:${event.id}`}>
                      <PopoverTrigger
                        className={cn(
                          'absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs leading-tight transition-[filter,opacity] hover:brightness-[0.97]',
                          linked && 'border-transparent bg-highlight text-highlight-ink',
                          tone === 'plain' && 'border-line bg-panel text-fg shadow-card',
                          tone === 'mine' && cn('ws-' + (scopeWs?.color ?? 'violet'), 'font-medium text-fg shadow-card'),
                          tone === 'other' && 'border-line bg-sidebar text-fg-subtle opacity-55 hover:opacity-100',
                          tone === 'unlinked' && 'border-dashed border-fg-subtle/60 bg-transparent text-fg-muted hover:border-accent hover:text-fg',
                          past && tone !== 'mine' && 'opacity-50',
                          past && tone === 'mine' && 'opacity-75',
                          isLive && 'z-[2] ring-2 ring-mandarina',
                        )}
                        style={{
                          top,
                          height,
                          left: `calc(${(col / cols) * 100}% + 2px)`,
                          width: `calc(${100 / cols}% - 4px)`,
                          ...(tone === 'mine'
                            ? {
                                background: 'color-mix(in oklch, var(--ws-color) 26%, var(--panel))',
                                borderColor: 'color-mix(in oklch, var(--ws-color) 55%, transparent)',
                              }
                            : {}),
                        }}
                      >
                        <span className="block truncate font-medium">{event.title || t('untitled')}</span>
                        {height > 34 ? (
                          <span className="block truncate text-2xs opacity-75">
                            {format(new Date(event.start), 'HH:mm')} - {format(new Date(event.end), 'HH:mm')}
                          </span>
                        ) : null}
                      </PopoverTrigger>
                      <PopoverContent side="right" align="start" className="p-0">
                        <EventDetails event={event} workspaceId={workspaceId} />
                      </PopoverContent>
                    </Popover>
                  )
                })}
                {isSameDay(d, now) ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: (differenceInMinutes(now, startOfDay(now)) / 60) * HOUR }}
                  >
                    <span className="-ml-1 size-2 rounded-full bg-mandarina" />
                    <span className="h-px flex-1 bg-mandarina" />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {google ? (
        <NewMeetingDialog open={dialogOpen} onOpenChange={setDialogOpen} defaults={{ ...(workspaceId ? { workspaceId } : {}), ...(slot ? { start: slot } : {}) }} />
      ) : null}
    </div>
  )
}
