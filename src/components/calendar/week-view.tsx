'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addDays, addWeeks, differenceInMinutes, eachDayOfInterval, endOfDay, format, isSameDay, isToday, isWeekend, startOfDay, startOfWeek } from 'date-fns'
import { CalendarPlus, Check, ChevronLeft, ChevronRight, CircleUser, CloudOff, LayoutGrid, RotateCw, Users } from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { FilterFacet, type FilterOption } from '@/components/tasks/task-filters'
import { useHydrated, useLocalStorage } from '@/lib/hooks'
import { assigneesOf, isAssignedTo } from '@/lib/assignees'
import { UNASSIGNED, whoKeys } from '@/lib/task-filters'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarError, useCalendarEvents } from '@/lib/queries/calendar'
import { useMeetingsInRange, withVeltroMeetings } from '@/lib/queries/meetings'
import { useTasks } from '@/lib/queries/tasks'
import { toDateKey, useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { CARD } from '@/components/ui/surface'
import type { CalendarEvent } from '@/lib/types'
import { StatusIcon } from '@/components/tasks/status-icon'
import { EventDetails } from './event-details'
import { ConnectCalendar, ConnectCalendarHint } from './connect-calendar'
import { NewMeetingDialog } from './new-meeting-dialog'
import { useOpenTask } from '@/lib/use-open-task'
import { TaskPeek } from './task-peek'
import { WeekAside } from './week-aside'
import { FullscreenExitButton } from '@/components/app/fullscreen'

const HOUR = 48

type Placed = { event: CalendarEvent; top: number; height: number; col: number; cols: number }

type Show = 'meetings' | 'tasks'
/** Qué muestra el calendario: reuniones y/o tareas, de qué espacios y de quién (las tareas). */
type CalendarFilters = { show: Show[]; ws: string[]; who: string[] }

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
  const tf = useTranslations('calendar.filters')
  const tTasks = useTranslations('tasks')
  const locale = useDateLocale()
  const { google, workspaces, observedWorkspaces, user } = useApp()
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  // por defecto: mis tareas y las que no tienen responsable, para poder repartirlas desde aquí
  const [filters, setFilters] = useLocalStorage<CalendarFilters>(workspaceId ? `veltro:calendar-filters:${workspaceId}` : 'veltro:calendar-filters', {
    show: ['meetings', 'tasks'],
    ws: [],
    who: workspaceId ? [] : [user.id, UNASSIGNED],
  })
  const showMeetings = filters.show.includes('meetings')
  const showTasks = filters.show.includes('tasks')
  const [allDayOpen, setAllDayOpen] = useState(false)
  // tareas que se acaban de asignar aquí: siguen a la vista aunque ya no pasen el filtro, hasta cambiar de semana o de filtro
  const [touched, setTouched] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] })
  const { open: openTask } = useOpenTask()
  const weekStartsOn = locale.options?.weekStartsOn ?? 1
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn }))
  // hacia dónde se movió la semana: la que llega entra desde ese lado (y no se anima al abrir)
  const [nav, setNav] = useState({ key: anchor.getTime(), dir: 0 })
  if (nav.key !== anchor.getTime()) setNav({ key: anchor.getTime(), dir: anchor.getTime() > nav.key ? 1 : -1 })
  const slide = nav.dir > 0 ? 'slide-in-next' : nav.dir < 0 ? 'slide-in-prev' : ''
  // el día al que se saltó (desde el mes chico u «Hoy»): su columna se ilumina un instante
  const [focus, setFocus] = useState<{ day: string; n: number } | null>(null)
  const goToDay = (d: Date) => {
    setAnchor(startOfWeek(d, { weekStartsOn }))
    setFocus({ day: toDateKey(d), n: Date.now() })
  }
  const glow = (d: Date) =>
    focus?.day === toDateKey(d) ? <span key={focus.n} aria-hidden className="day-glow pointer-events-none absolute inset-0 -z-10 bg-accent/[0.14]" /> : null
  const [dialogOpen, setDialogOpen] = useState(false)
  const [slot, setSlot] = useState<Date | null>(null)
  const params = useSearchParams()
  useEffect(() => {
    if (params.get('new') === '1') setDialogOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const days = eachDayOfInterval({ start: anchor, end: addDays(anchor, 6) })
  const from = anchor
  const to = addDays(anchor, 7)
  const { data: googleEvents, error, isLoading, refetch: refetchEvents } = useCalendarEvents(from, to, Boolean(google))
  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  // las reuniones de Veltro (creadas aquí, sin Google, o de un evento que no está en mis calendarios) van junto a las de Google
  const { data: veltroMeetings } = useMeetingsInRange(workspaceId ? [workspaceId] : wsIds, from, to)
  const events = useMemo(
    () => withVeltroMeetings(googleEvents, veltroMeetings, { googlePending: Boolean(google) && !googleEvents && !error, from, to }),
    [googleEvents, veltroMeetings, google, error, from, to],
  )
  const { data: allTasks } = useTasks(workspaceId ? { kind: 'workspace', workspaceId } : { kind: 'workspaces', workspaceIds: wsIds })
  const scopeWs = workspaceId ? wsMap.get(workspaceId) : undefined
  const eventTone = (e: CalendarEvent) => {
    if (!workspaceId) return e.links.length ? 'linked' : 'plain'
    if (e.links.some((l) => l.workspaceId === workspaceId)) return 'mine'
    return e.links.length ? 'other' : 'unlinked'
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => new Date())
  // la hora de ahora (línea y etiqueta) solo en el navegador: el servidor puede ir un minuto atrás
  const hydrated = useHydrated()

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

  const weekFrom = toDateKey(anchor)
  const weekTo = toDateKey(addDays(anchor, 6))
  const touchKey = `${weekFrom}|${filters.ws.join()}|${filters.who.join()}`
  const keep = useMemo(() => (touched.key === touchKey ? touched.ids : []), [touched, touchKey])
  const { tasksByDay, wsOptions, whoOptions, eventOk } = useMemo(() => {
    const week = (allTasks ?? []).filter((x) => x.due_date && x.status !== 'done' && x.due_date >= weekFrom && x.due_date <= weekTo)
    const okWs = (id: string) => !filters.ws.length || filters.ws.includes(id)
    const okWho = (x: (typeof week)[number]) => !filters.who.length || whoKeys(x).some((id) => filters.who.includes(id))
    const eventOk = (e: CalendarEvent) => !filters.ws.length || e.links.some((l) => filters.ws.includes(l.workspaceId))

    const byDay = new Map<string, typeof week>()
    for (const task of week) {
      if (!okWs(task.workspace_id) || (!okWho(task) && !keep.includes(task.id))) continue
      if (!byDay.has(task.due_date!)) byDay.set(task.due_date!, [])
      byDay.get(task.due_date!)!.push(task)
    }
    // sin responsable primero: son las que piden atención en el calendario
    for (const list of byDay.values()) list.sort((a, b) => Number(assigneesOf(b).length === 0) - Number(assigneesOf(a).length === 0))

    // cada opción cuenta lo de esta semana con el otro filtro aplicado
    const wsOptions: FilterOption[] = wsIds.flatMap((id) => {
      const w = wsMap.get(id)
      if (!w) return []
      const count =
        (showTasks ? week.filter((x) => x.workspace_id === id && okWho(x)).length : 0) +
        (showMeetings ? (events ?? []).filter((e) => e.links.some((l) => l.workspaceId === id)).length : 0)
      return [{ value: id, label: w.name, icon: <WorkspaceMark ws={w} size={16} />, count }]
    })
    const whoTally = new Map<string, number>()
    for (const x of week) if (okWs(x.workspace_id)) for (const id of whoKeys(x)) whoTally.set(id, (whoTally.get(id) ?? 0) + 1)
    const rank = (id: string) => (id === user.id ? 0 : id === UNASSIGNED ? 1 : 2)
    const whoOptions: FilterOption[] = [...new Set([user.id, UNASSIGNED, ...whoTally.keys(), ...filters.who])]
      .map((id) => {
        if (id === UNASSIGNED) return { value: id, label: tTasks('unassigned'), icon: <CircleUser className="size-[18px] shrink-0 text-fg-subtle" />, count: whoTally.get(id) ?? 0 }
        const m = memberMap.get(id)
        return { value: id, label: m?.full_name ?? '?', icon: <Avatar name={m?.full_name} src={m?.avatar_url} seed={id} size={18} />, count: whoTally.get(id) ?? 0 }
      })
      .sort((a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label))
    return { tasksByDay: byDay, wsOptions, whoOptions, eventOk }
  }, [allTasks, weekFrom, weekTo, filters, wsIds, wsMap, memberMap, user.id, events, showTasks, showMeetings, tTasks, keep])

  const allDay = showMeetings ? (events ?? []).filter((e) => e.allDay && eventOk(e)) : []
  const timed = showMeetings ? (events ?? []).filter((e) => !e.allDay && eventOk(e)) : []
  const dayTasks = (d: Date) => (showTasks ? (tasksByDay.get(toDateKey(d)) ?? []) : [])
  const moreThanThree = days.some((d) => dayTasks(d).length > 3)
  const toggleIn = (key: 'ws' | 'who') => (v: string, on: boolean) =>
    setFilters((f) => ({ ...f, [key]: on ? [...f[key].filter((x) => x !== v), v] : f[key].filter((x) => x !== v) }))

  const errorCode = error instanceof CalendarError ? error.code : error ? 'google_error' : null
  const connectReturn = workspaceId && scopeWs ? `/w/${scopeWs.slug}/meetings` : '/calendar'

  return (
    // la semana en una tarjeta que llega hasta abajo y, al lado, el mes chico y la semana como lista
    <div className="flex h-full min-h-0 flex-col gap-4 px-4 pb-4 pt-5 sm:px-6">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-1">
        {/* el mes y, debajo, cómo viene la semana (lo que se ve con los filtros puestos) */}
        <div className="mr-auto min-w-0">
          <h1 className="text-[26px] font-semibold capitalize leading-tight tracking-[-0.025em]">{format(anchor, 'LLLL yyyy', { locale })}</h1>
          <p className="truncate text-sm text-fg-muted">
            {t('weekSummary', {
              week: format(anchor, 'w', { locale }),
              // «16 – 22 nov» (o «30 nov – 6 dic» si cambia de mes)
              range: `${format(anchor, anchor.getMonth() === addDays(anchor, 6).getMonth() ? 'd' : 'd MMM', { locale })} – ${format(addDays(anchor, 6), 'd MMM', { locale })}`,
              meetings: allDay.length + timed.length,
              tasks: days.reduce((n, d) => n + dayTasks(d).length, 0),
            })}
          </p>
        </div>
        {google ? <span className="hidden text-xs text-fg-subtle md:inline">{google.email}</span> : null}
        {workspaceId ? (
          <span className="hidden items-center gap-3 text-xs text-fg-muted lg:flex">
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
        {/* moverse de semana: una pastilla con las tres acciones juntas */}
        <div className="flex items-center rounded-xl bg-panel p-0.5 shadow-card">
          <Button variant="ghost" size="icon-sm" onClick={() => setAnchor(addWeeks(anchor, -1))} aria-label={t('prevWeek')}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="sm" className="font-semibold text-fg" onClick={() => goToDay(new Date())}>
            {t('today')}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setAnchor(addWeeks(anchor, 1))} aria-label={t('nextWeek')}>
            <ChevronRight />
          </Button>
        </div>
        {/* con o sin Google: sin Google la reunión se crea en Veltro */}
        <Button
          variant="primary"
          size="md"
          onClick={() => {
            setSlot(null)
            setDialogOpen(true)
          }}
        >
          <CalendarPlus />
          {t('newMeeting')}
        </Button>
        <FullscreenExitButton />
      </header>

      {errorCode === 'google_auth_revoked' ? (
        <div className="shrink-0">
          <ConnectCalendar reason={errorCode} returnTo={connectReturn} />
        </div>
      ) : !google || errorCode === 'google_not_connected' ? (
        // sin Google el calendario funciona con las reuniones de Veltro; Google solo suma sus eventos
        <ConnectCalendarHint returnTo={connectReturn} className="shrink-0 self-start" />
      ) : errorCode ? (
        // cualquier otro error de Google: se avisa (antes el calendario quedaba vacío sin explicación)
        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          <CloudOff className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{t('loadError')}</span>
          <Button size="xs" variant="secondary" onClick={() => refetchEvents()}>
            <RotateCw />
            {t('retry')}
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-4">
      <section className={cn(CARD, 'flex min-w-0 flex-1 flex-col overflow-hidden')}>
      {/* qué se ve: reuniones y/o tareas, de qué espacio y de quién */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line-soft px-4 py-2.5">
        {/* reuniones y tareas se prenden por separado (pueden ir las dos): dos pastillas con su casilla */}
        <div className="flex items-center gap-1.5" role="group" aria-label={tf('show')}>
          {(['meetings', 'tasks'] as const).map((k) => {
            const on = filters.show.includes(k)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                // siempre queda algo a la vista
                onClick={() => setFilters((f) => (on && f.show.length === 1 ? f : { ...f, show: on ? f.show.filter((x) => x !== k) : [...f.show, k] }))}
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-full pl-2 pr-3 text-sm font-medium outline-none ring-1 transition-[background-color,color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/40 active:scale-[0.98]',
                  on ? 'bg-accent-soft text-accent-ink ring-accent/15' : 'text-fg-muted ring-line hover:bg-hover hover:text-fg',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-4 items-center justify-center rounded-full transition-colors duration-150',
                    on ? 'bg-accent text-accent-fg' : 'ring-[1.5px] ring-inset ring-line-control',
                  )}
                >
                  {on ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
                </span>
                {tf(k)}
              </button>
            )
          })}
        </div>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        {!workspaceId ? (
          <FilterFacet
            icon={<LayoutGrid />}
            label={tf('space')}
            options={wsOptions}
            value={filters.ws}
            onToggle={toggleIn('ws')}
            onClear={() => setFilters((f) => ({ ...f, ws: [] }))}
          />
        ) : null}
        {showTasks ? (
          <FilterFacet
            icon={<Users />}
            label={tf('who')}
            options={whoOptions}
            value={filters.who}
            onToggle={toggleIn('who')}
            onClear={() => setFilters((f) => ({ ...f, who: [] }))}
            hint={tf('whoHint')}
            searchable={whoOptions.length > 7}
          />
        ) : null}
        {showTasks ? (
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-fg-subtle md:inline-flex">
            <span className="inline-flex size-3.5 items-center justify-center rounded-xs border border-dashed border-fg-subtle/60" />
            {tf('unassignedLegend')}
          </span>
        ) : null}
      </div>

      {/* los días: hoy destacado, el fin de semana apenas sombreado */}
      <div className="flex shrink-0 border-b border-line-soft pl-14">
        {days.map((d, i) => (
          <div
            key={d.toISOString()}
            className={cn('relative isolate flex min-w-0 flex-1 flex-col border-l border-line-soft px-2 pb-2 pt-2.5', isToday(d) ? 'bg-highlight/60' : isWeekend(d) && 'bg-canvas/70', slide)}
            // los días entran en cascada, uno detrás de otro
            style={slide ? { animationDelay: `${i * 18}ms` } : undefined}
          >
            {glow(d)}
            <span className={cn('text-[11px] font-semibold uppercase tracking-wide', isToday(d) ? 'text-accent-ink' : 'text-fg-subtle')}>{format(d, 'EEE', { locale })}</span>
            <span
              className={cn(
                'mt-1 inline-flex size-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums tracking-[-0.02em]',
                isToday(d) ? 'bg-accent text-accent-fg shadow-[0_6px_14px_-8px_var(--accent)]' : isWeekend(d) ? 'text-fg-muted' : 'text-fg',
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
                    <PopoverTrigger className="truncate rounded-md bg-hover px-1.5 py-0.5 text-left text-2xs font-medium text-fg-muted hover:bg-active">
                      {e.title || t('untitled')}
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <EventDetails event={e} workspaceId={workspaceId} />
                    </PopoverContent>
                  </Popover>
                ))}
              {(allDayOpen ? dayTasks(d) : dayTasks(d).slice(0, 3)).map((task) => {
                const nobody = assigneesOf(task).length === 0
                const owner = nobody || isAssignedTo(task, user.id) ? null : memberMap.get(assigneesOf(task)[0])
                return (
                  <Popover key={task.id}>
                    <PopoverTrigger
                      className={cn(
                        'ws-' + (wsMap.get(task.workspace_id)?.color ?? 'green'),
                        'flex min-w-0 items-center gap-1 rounded-md border px-1 py-0.5 text-left text-2xs hover:bg-hover data-[popup-open]:bg-hover',
                        nobody ? 'border-dashed border-fg-subtle/50 text-fg-muted' : 'border-line-soft bg-panel text-fg',
                      )}
                    >
                      <StatusIcon status={task.status} className="size-3" />
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      {nobody ? (
                        <CircleUser className="size-3 shrink-0 text-fg-subtle" aria-label={tTasks('unassigned')} />
                      ) : owner ? (
                        <Avatar name={owner.full_name} src={owner.avatar_url} seed={owner.id} size={14} />
                      ) : null}
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="start" className="p-0">
                      <TaskPeek
                        task={task}
                        onOpen={() => openTask(task.id)}
                        onChange={() => setTouched((p) => ({ key: touchKey, ids: [...(p.key === touchKey ? p.ids : []), task.id] }))}
                      />
                    </PopoverContent>
                  </Popover>
                )
              })}
              {moreThanThree && (allDayOpen || dayTasks(d).length > 3) ? (
                <button
                  type="button"
                  onClick={() => setAllDayOpen(!allDayOpen)}
                  className="rounded-xs px-1 py-0.5 text-left text-2xs font-medium text-fg-muted hover:bg-hover hover:text-fg"
                >
                  {allDayOpen ? t('lessTasks') : t('moreTasks', { count: dayTasks(d).length - 3 })}
                </button>
              ) : null}
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
                  <span className="absolute -top-2 right-2.5 text-[11px] font-medium tabular-nums text-fg-subtle">{String(h).padStart(2, '0')}:00</span>
                ) : null}
              </div>
            ))}
            {hydrated && days.some((d) => isSameDay(d, now)) ? (
              <span
                className="absolute right-1 z-20 -translate-y-1/2 rounded-full bg-mandarina px-1.5 font-mono text-2xs font-semibold tabular-nums text-on-mandarina shadow-[0_2px_10px_-2px_oklch(0.75_0.167_50.5/0.7)]"
                style={{ top: (differenceInMinutes(now, startOfDay(now)) / 60) * HOUR }}
              >
                {format(now, 'HH:mm')}
              </span>
            ) : null}
          </div>
          {days.map((d, i) => {
            const placed = layoutDay(
              timed.filter((e) => new Date(e.start) < endOfDay(d) && new Date(e.end) > startOfDay(d)),
              d,
            )
            return (
              <div
                key={d.toISOString()}
                className={cn('group/day relative isolate min-w-0 flex-1 border-l border-line-soft', isToday(d) ? 'bg-highlight/40' : isWeekend(d) && 'bg-canvas/60', slide)}
                style={slide ? { animationDelay: `${i * 18}ms` } : undefined}
              >
                {glow(d)}
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="border-b border-line-soft" style={{ height: HOUR }}>
                    {
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
                          // fuera del orden de tabulación: con teclado se usa "Nueva reunión" (eran 336 paradas invisibles)
                          tabIndex={-1}
                          className="group/slot flex h-1/2 w-full items-start px-1.5 pt-0.5 text-left opacity-0 transition-opacity hover:bg-accent-soft/40 hover:opacity-100 focus-visible:opacity-100"
                          aria-label={t('newAt', { time: `${String(h).padStart(2, '0')}:${m ? '30' : '00'}` })}
                        >
                          <span className="font-mono text-2xs text-accent-ink">+ {String(h).padStart(2, '0')}:{m ? '30' : '00'}</span>
                        </button>
                      ))
                    }
                  </div>
                ))}
                {isLoading && google ? <Skeleton className="absolute inset-x-1 top-[440px] h-16" /> : null}
                {placed.map(({ event, top, height, col, cols }) => {
                  const tone = eventTone(event)
                  const linked = tone === 'linked'
                  // en el calendario general, cada reunión en el color de su espacio (en pastel)
                  const evWs = linked && event.links[0] ? wsMap.get(event.links[0].workspaceId) : undefined
                  const tinted = tone === 'mine' || Boolean(evWs)
                  const past = new Date(event.end) < now
                  const isLive = new Date(event.start) <= now && !past
                  return (
                    <Popover key={`${event.calendarId}:${event.id}`}>
                      <PopoverTrigger
                        className={cn(
                          'absolute overflow-hidden rounded-lg border px-2 py-1 text-left text-xs leading-tight transition-[filter,opacity] hover:brightness-[0.97]',
                          linked && !evWs && 'border-transparent bg-highlight text-highlight-ink',
                          evWs && cn('ws-' + evWs.color, 'text-fg shadow-card'),
                          tone === 'plain' && 'border-line bg-panel text-fg shadow-card',
                          tone === 'mine' && cn('ws-' + (scopeWs?.color ?? 'violet'), 'text-fg shadow-card'),
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
                          ...(tinted
                            ? {
                                background: 'color-mix(in oklch, var(--ws-color) 22%, var(--panel))',
                                borderColor: 'color-mix(in oklch, var(--ws-color) 45%, transparent)',
                              }
                            : {}),
                        }}
                      >
                        <span className="block truncate font-semibold">{event.title || t('untitled')}</span>
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
                {hydrated && isSameDay(d, now) ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: (differenceInMinutes(now, startOfDay(now)) / 60) * HOUR }}
                  >
                    <span className="-ml-1 size-2.5 rounded-full bg-mandarina ring-2 ring-panel" />
                    <span className="h-0.5 flex-1 bg-mandarina shadow-[0_0_8px_oklch(0.75_0.167_50.5/0.6)]" />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      </section>
      <WeekAside
        anchor={anchor}
        weekStartsOn={weekStartsOn}
        onPickDay={goToDay}
        events={[...allDay, ...timed]}
        tasks={showTasks ? [...tasksByDay.values()].flat() : []}
        onNewMeeting={() => {
          setSlot(null)
          setDialogOpen(true)
        }}
      />
      </div>

      <NewMeetingDialog open={dialogOpen} onOpenChange={setDialogOpen} defaults={{ ...(workspaceId ? { workspaceId } : {}), ...(slot ? { start: slot } : {}) }} />
    </div>
  )
}
