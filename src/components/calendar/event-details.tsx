'use client'

import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { ExternalLink, MapPin, Users, Video } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { useDateLocale } from '@/lib/dates'
import type { CalendarEvent } from '@/lib/types'
import { NotesButton, WorkspaceLinkChips } from './notes-button'

export function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

export function eventTimeLabel(e: CalendarEvent, locale: ReturnType<typeof useDateLocale>, allDayLabel: string) {
  if (e.allDay) return allDayLabel
  return `${format(new Date(e.start), 'HH:mm', { locale })} - ${format(new Date(e.end), 'HH:mm', { locale })}`
}

export function EventDetails({ event, workspaceId }: { event: CalendarEvent; workspaceId?: string }) {
  const t = useTranslations('calendar')
  const locale = useDateLocale()
  const description = event.description ? stripHtml(event.description).slice(0, 400) : null
  const going = event.attendees.filter((a) => a.responseStatus !== 'declined')

  return (
    <div className="flex w-[340px] flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-base font-semibold leading-snug text-fg">{event.title || t('untitled')}</p>
          <WorkspaceLinkChips event={event} />
        </div>
        <p className="text-sm text-fg-muted first-letter:uppercase">
          {format(new Date(event.start), 'EEEE d MMMM', { locale })} · {eventTimeLabel(event, locale, t('allDay'))}
        </p>
      </div>

      {event.location ? (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-words">{event.location}</span>
        </p>
      ) : null}

      {going.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-xs text-fg-subtle">
            <Users className="size-3.5" />
            {t('attendees', { count: going.length })}
          </p>
          <ul className="flex max-h-36 flex-col gap-1 overflow-y-auto">
            {going.slice(0, 12).map((a) => (
              <li key={a.email} className="flex items-center gap-2 text-sm">
                <Avatar name={a.name || a.email} seed={a.email} size={18} />
                <span className="truncate">{a.name || a.email}</span>
                {a.organizer ? <span className="text-2xs text-fg-subtle">{t('organizer')}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {description ? <p className="line-clamp-4 whitespace-pre-line text-sm text-fg-muted">{description}</p> : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <NotesButton event={event} size="sm" workspaceId={workspaceId} />
        {event.conferenceUrl ? (
          <a href={event.conferenceUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            <Video />
            {t('join')}
          </a>
        ) : null}
        {event.htmlLink ? (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
            aria-label={t('openInGoogle')}
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  )
}
