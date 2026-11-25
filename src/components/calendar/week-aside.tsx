'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { CalendarCheck, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Video } from 'lucide-react'
import { useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { StatusIcon } from '@/components/tasks/status-icon'
import { useDateLocale } from '@/lib/dates'
import { useOpenTask } from '@/lib/use-open-task'
import { cn } from '@/lib/utils'
import { CARD } from '@/components/ui/surface'
import type { TaskRow } from '@/lib/database.types'
import type { CalendarEvent } from '@/lib/types'

/**
 * Al lado de la semana, lo que la grilla no deja ver de un vistazo: un mes chico para saltar de
 * semana (la que se ve, marcada) y la semana como lista, con sus reuniones y lo que vence, en orden.
 */
export function WeekAside({
  anchor,
  weekStartsOn,
  onPickDay,
  events,
  tasks,
  onNewMeeting,
}: {
  anchor: Date
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
  /** saltar a un día: la semana pasa a ser la suya y la columna del día se ilumina */
  onPickDay: (day: Date) => void
  events: CalendarEvent[]
  tasks: TaskRow[]
  onNewMeeting: () => void
}) {
  const t = useTranslations('calendar.aside')
  const locale = useDateLocale()
  const wsMap = useWorkspaceMap()
  const { open } = useOpenTask()
  const [month, setMonth] = useState(() => startOfMonth(anchor))
  // si la semana se mueve a otro mes con las flechas de arriba, el mes chico la sigue
  const [seen, setSeen] = useState(anchor)
  if (seen !== anchor) {
    setSeen(anchor)
    if (!isSameMonth(anchor, month) && !isSameMonth(addDays(anchor, 6), month)) setMonth(startOfMonth(anchor))
  }

  // hacia dónde se movió el mes: el que llega entra desde ese lado
  const [monthNav, setMonthNav] = useState({ key: month.getTime(), dir: 0 })
  if (monthNav.key !== month.getTime()) setMonthNav({ key: month.getTime(), dir: month.getTime() > monthNav.key ? 1 : -1 })

  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn }), end: endOfWeek(endOfMonth(month), { weekStartsOn }) })
  const weekEnd = addDays(anchor, 6)
  const inWeek = (d: Date) => d >= anchor && d <= weekEnd
  // la fila de la semana que se ve (si está en este mes): la franja se desliza hasta ahí
  const weekRow = Math.floor(days.findIndex((d) => isSameDay(d, anchor)) / 7)
  const busy = new Set(events.map((e) => format(new Date(e.start), 'yyyy-MM-dd')))

  // la semana, día por día: lo que tiene algo
  const week = eachDayOfInterval({ start: anchor, end: weekEnd })
    .map((d) => ({
      d,
      meetings: events.filter((e) => isSameDay(new Date(e.start), d)).sort((a, b) => a.start.localeCompare(b.start)),
      due: tasks.filter((x) => x.due_date === format(d, 'yyyy-MM-dd')),
    }))
    .filter((x) => x.meetings.length || x.due.length)

  const items = week.reduce((n, x) => n + x.meetings.length + x.due.length, 0)

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-4 xl:flex">
      {/* el mes chico, en blanco como la semana: la ciruela de Calendario la pone la portada de arriba */}
      <section className={cn(CARD, 'shrink-0 px-4 pb-4 pt-4')}>
        <div className="mb-2.5 flex items-center gap-1">
          <p className="mr-auto pl-1 text-[15px] font-semibold capitalize text-fg">{format(month, 'LLLL yyyy', { locale })}</p>
          <Button variant="ghost" size="icon-xs" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('prevMonth')}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('nextMonth')}>
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-7 text-center">
          {days.slice(0, 7).map((d) => (
            <span key={d.toISOString()} className="pb-1.5 text-[11px] font-semibold uppercase text-fg-subtle">
              {format(d, 'EEEEE', { locale })}
            </span>
          ))}
        </div>
        <div className="relative">
          {/* la semana que se ve: una franja translúcida que se desliza de fila en fila */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-8 rounded-xl bg-fg/[0.14] transition-[transform,opacity] duration-[420ms] ease-[var(--ease-out-expo)]"
            style={{ transform: `translateY(${Math.max(0, weekRow) * 2}rem)`, opacity: weekRow >= 0 ? 1 : 0 }}
          />
          <div key={monthNav.key} className={cn('relative grid grid-cols-7 text-center', monthNav.dir > 0 ? 'slide-in-next' : monthNav.dir < 0 ? 'slide-in-prev' : '')}>
            {days.map((d) => {
              const shown = inWeek(d)
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => onPickDay(d)}
                  className={cn(
                    'group/day relative flex h-8 items-center justify-center rounded-xl text-xs tabular-nums outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent-mid/50',
                    shown ? 'font-semibold text-fg' : 'text-fg-muted hover:text-fg',
                    !isSameMonth(d, month) && !shown && 'text-fg/35',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-out group-active/day:scale-90',
                      isToday(d) ? 'bg-accent font-semibold text-accent-fg' : 'group-hover/day:bg-fg/[0.1]',
                    )}
                  >
                    {format(d, 'd')}
                  </span>
                  {busy.has(format(d, 'yyyy-MM-dd')) && !isToday(d) ? <span className="absolute bottom-0.5 size-1 rounded-full bg-mandarina" /> : null}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* la semana como lista, en su tarjeta hasta abajo */}
      <section className={cn(CARD, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
        <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
          <CalendarDays className="size-4 shrink-0 text-mandarina-ink" aria-hidden />
          <h2 className="text-base font-semibold tracking-[-0.015em]">{t('thisWeek')}</h2>
          {items ? (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-fg/[0.06] px-1.5 text-[11px] font-semibold tabular-nums text-fg-muted">{items}</span>
          ) : null}
        </header>
        {week.length ? (
          <ol key={anchor.getTime()} className="flex min-h-0 flex-1 animate-in flex-col gap-3 overflow-y-auto px-4 pb-4 fade-in-0 duration-300 scrollbar-thin">
            {week.map(({ d, meetings, due }) => (
              <li key={d.toISOString()}>
                <p className={cn('mb-1 flex items-center gap-2 text-xs font-semibold capitalize', isToday(d) ? 'text-accent-ink' : 'text-fg-muted')}>
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  {isToday(d) ? t('today') : format(d, 'EEEE d', { locale })}
                </p>
                <ul className="flex flex-col">
                  {meetings.map((e) => {
                    const meetingId = e.id.startsWith('veltro-') ? e.id.slice(7) : e.links[0]?.meetingId
                    const body = (
                      <>
                        <Video className="size-3.5 shrink-0 text-mandarina" />
                        <span className="w-10 shrink-0 tabular-nums text-fg-subtle">{e.allDay ? '' : format(new Date(e.start), 'HH:mm')}</span>
                        <span className="min-w-0 flex-1 truncate font-medium text-fg">{e.title || t('untitled')}</span>
                      </>
                    )
                    return (
                      <li key={e.id}>
                        {meetingId ? (
                          <Link href={`/m/${meetingId}`} className="-mx-2 flex h-8 items-center gap-2 rounded-lg px-2 text-xs transition-colors hover:bg-hover/60">
                            {body}
                          </Link>
                        ) : (
                          <span className="-mx-2 flex h-8 items-center gap-2 px-2 text-xs">{body}</span>
                        )}
                      </li>
                    )
                  })}
                  {due.map((x) => {
                    const ws = wsMap.get(x.workspace_id)
                    return (
                      <li key={x.id}>
                        <button
                          type="button"
                          onClick={() => open(x.id)}
                          className="-mx-2 flex h-8 w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors hover:bg-hover/60"
                        >
                          <StatusIcon status={x.status} className="size-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-fg">{x.title}</span>
                          {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          // una semana libre no es un hueco: se dice y se ofrece crear una reunión
          // centrado con margen automático (no justify-center): si no hay alto, se desplaza en vez de cortarse arriba
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-5 scrollbar-thin">
            <div className="m-auto flex flex-col items-center py-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink ring-4 ring-accent-soft/40">
                <CalendarCheck className="size-5" />
              </span>
              <p className="mt-3 text-[15px] font-semibold text-fg">{t('free')}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{t('freeHint')}</p>
              <Button size="sm" variant="secondary" className="mt-4" onClick={onNewMeeting}>
                <CalendarPlus />
                {t('newMeeting')}
              </Button>
            </div>
          </div>
        )}
      </section>
    </aside>
  )
}
