'use client'

import { useTranslations } from 'next-intl'
import { differenceInMinutes, format } from 'date-fns'
import { Video } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { buttonVariants } from '@/components/ui/button'
import { useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/types'
import { EventDetails } from './event-details'
import { NotesButton, WorkspaceLinkChips } from './notes-button'
import { useNow } from '@/lib/hooks'


export function Agenda({ events }: { events: CalendarEvent[] }) {
  const t = useTranslations('calendar')
  const locale = useDateLocale()
  const now = useNow()
  const allDay = events.filter((e) => e.allDay)
  const timed = events.filter((e) => !e.allDay)

  return (
    <div className="flex flex-col">
      {allDay.length ? (
        <div className="flex flex-wrap gap-1.5 pb-3">
          {allDay.map((e) => (
            <span key={e.id} className="inline-flex h-6 items-center rounded-md bg-hover px-2 text-xs text-fg-muted">
              {e.title || t('untitled')}
            </span>
          ))}
        </div>
      ) : null}
      <ol className="flex flex-col">
        {timed.map((e) => {
          const start = new Date(e.start)
          const end = new Date(e.end)
          const live = now >= start && now < end
          const past = now >= end
          const soon = !live && !past && differenceInMinutes(start, now) <= 60
          return (
            <li
              key={`${e.calendarId}:${e.id}`}
              className={cn(
                'group/event -mx-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-3 py-2.5 transition-colors',
                live && 'bg-highlight',
                past && 'opacity-55',
              )}
            >
              <div className="w-11 shrink-0 font-mono text-xs tabular-nums text-fg-muted sm:w-[88px]">
                <span className={cn(live && 'font-semibold text-highlight-ink')}>{format(start, 'HH:mm', { locale })}</span>
                <span className="hidden text-fg-subtle sm:inline"> {format(end, 'HH:mm', { locale })}</span>
              </div>
              <Popover>
                <PopoverTrigger className="flex min-w-0 flex-1 basis-40 flex-col items-start text-left outline-none">
                  <span className="flex w-full items-center gap-2">
                    <span className="truncate text-base font-medium text-fg group-hover/event:underline group-hover/event:decoration-line-strong group-hover/event:underline-offset-4">
                      {e.title || t('untitled')}
                    </span>
                    <WorkspaceLinkChips event={e} />
                  </span>
                  <span className={cn('flex items-center gap-1.5 text-xs', live ? 'text-highlight-ink' : 'text-fg-muted')}>
                    {live ? <span className="size-2 rounded-full bg-mandarina" /> : null}
                    {live
                      ? t('liveNow')
                      : soon
                        ? t('startsIn', { minutes: Math.max(1, differenceInMinutes(start, now)) })
                        : e.attendees.length
                          ? t('attendees', { count: e.attendees.length })
                          : e.location ?? ''}
                  </span>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0">
                  <EventDetails event={e} />
                </PopoverContent>
              </Popover>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {e.conferenceUrl && !past ? (
                  <a
                    href={e.conferenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: live || soon ? 'primary' : 'ghost', size: 'xs' })}
                  >
                    <Video />
                    <span className="hidden sm:inline">{t('join')}</span>
                  </a>
                ) : null}
                <NotesButton event={e} />
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
