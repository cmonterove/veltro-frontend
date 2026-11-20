'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { differenceInMinutes, format, isSameDay, startOfDay } from 'date-fns'
import { CalendarPlus, Video } from 'lucide-react'
import { canEdit, useApp } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConnectCalendar, ConnectCalendarHint } from '@/components/calendar/connect-calendar'
import { NewMeetingDialog } from '@/components/calendar/new-meeting-dialog'
import { NotesButton } from '@/components/calendar/notes-button'
import { useHydrated } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/types'
import { MoreLink, type BriefData, type BriefModel } from './brief'

/**
 * Lo que está pasando o lo que sigue, al lado del saludo: la reunión con su botón (notas, unirse)
 * o, sin nada por delante, crear una.
 */
export function AgendaNow({ data, model }: { data: BriefData; model: BriefModel }) {
  const tn = useTranslations('pulse.brief.now')
  const ta = useTranslations('pulse.brief.agenda')
  const tc = useTranslations('calendar.empty')
  const appLocale = useLocale()
  const { workspaces } = useApp()
  const [creating, setCreating] = useState(false)
  const canCreate = workspaces.some((w) => canEdit(w))

  // una ficha translúcida sobre la ciruela: lo que sigue tiene su lugar, frente al saludo
  const tile = 'flex w-full min-w-0 flex-col gap-1 rounded-2xl bg-fg/[0.07] px-4 py-3 ring-1 ring-fg/10 @min-[760px]/pulse:w-[21rem]'

  if (data.eventsLoading) {
    return (
      <div className={tile}>
        <Skeleton className="h-3.5 w-32 rounded-full bg-fg/[0.08]" />
        <Skeleton className="h-4 w-56 rounded-full bg-fg/[0.08]" />
        <Skeleton className="mt-1 h-7 w-24 bg-fg/[0.08]" />
      </div>
    )
  }

  const event = model.live ?? model.next
  const meeting = event ? (model.meetingByEvent.get(event.id) ?? null) : null
  const ws = meeting ? data.wsMap.get(meeting.workspace_id) : event?.links[0] ? data.wsMap.get(event.links[0].workspaceId) : undefined
  const live = Boolean(model.live)
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
    <div className={tile}>
      {event ? (
        <>
          <p className={cn('flex items-center gap-1.5 text-[13px] font-medium first-letter:uppercase', live ? 'text-mandarina-ink' : 'text-fg-subtle')}>
            {live ? <span className="size-1.5 animate-pulse rounded-full bg-mandarina" /> : null}
            {/* en curso, `when` ya lo dice («En curso · quedan 24 min») */}
            <span className="truncate">{live ? when : `${tn('next')} · ${when}`}</span>
          </p>
          <div className="flex items-start gap-2">
            {ws ? <WorkspaceMark ws={ws} size={18} className="mt-0.5" /> : null}
            <p className="line-clamp-1 min-w-0 flex-1 text-[15px] font-semibold leading-snug">{event.title}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <NotesButton event={event} size="sm" />
            {live && event.conferenceUrl ? (
              <a href={event.conferenceUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <Video />
                {tn('join')}
              </a>
            ) : null}
            <span className="ml-auto">
              <MoreLink href="/calendar">{ta('open')}</MoreLink>
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="text-[15px] font-semibold leading-snug">{tc('title')}</p>
          <p className="text-[13px] text-fg-subtle">{tn('freeHint')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {canCreate ? (
              <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
                <CalendarPlus />
                {tc('new')}
              </Button>
            ) : null}
            <span className="ml-auto">
              <MoreLink href="/calendar">{ta('open')}</MoreLink>
            </span>
          </div>
        </>
      )}
      {canCreate ? <NewMeetingDialog open={creating} onOpenChange={setCreating} /> : null}
    </div>
  )
}

/**
 * El día hora por hora, de 8 a 20 (o más, si hay reuniones o si ya es hora antes o después): lo que
 * ya pasó se va llenando hasta la línea de ahora, cada reunión es un bloque del color de su espacio y
 * el tramo libre más largo dice cuánto dura. Se lee de un vistazo cuánto día queda para avanzar.
 */
export function DayRuler({ data, model, className }: { data: BriefData; model: BriefModel; className?: string }) {
  const t = useTranslations('pulse.day')
  const appLocale = useLocale()
  const { google } = useApp()
  // la hora exacta (y la zona) del servidor no es la del navegador: la regla se dibuja ya hidratada
  const hydrated = useHydrated()
  const now = data.now
  const base = startOfDay(now).getTime()
  const hourOf = (iso: string | Date) => (new Date(iso).getTime() - base) / 3_600_000

  const events = model.today
  let from = 8
  let to = 20
  for (const e of events) {
    from = Math.min(from, Math.floor(hourOf(e.start)))
    to = Math.max(to, Math.ceil(Math.min(24, hourOf(e.end))))
  }
  const nowH = hourOf(now)
  // temprano o tarde, la regla se estira hasta ahora (de madrugada no: sería un día de 20 horas)
  if (nowH >= 5) {
    from = Math.min(from, Math.floor(nowH))
    to = Math.max(to, Math.ceil(nowH + 0.01))
  }
  from = Math.max(0, from)
  to = Math.min(24, Math.max(to, from + 1))
  const span = to - from
  const x = (h: number) => ((Math.min(Math.max(h, from), to) - from) / span) * 100
  const nowIn = nowH > from && nowH < to

  // reuniones que se pisan van en carriles, una sobre otra
  const laneEnds: number[] = []
  const blocks = events.map((e) => {
    const s = hourOf(e.start)
    const en = Math.min(24, hourOf(e.end))
    let lane = laneEnds.findIndex((end) => end <= s)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(en)
    } else laneEnds[lane] = en
    return { e, s, en, lane }
  })
  const lanes = Math.max(1, laneEnds.length)

  // tramos libres de ahora al final del día; se nombra el más largo
  const gaps: [number, number][] = []
  let cursor = Math.max(nowH, from)
  for (const b of blocks) {
    if (b.en <= cursor) continue
    if (b.s > cursor) gaps.push([cursor, b.s])
    cursor = Math.max(cursor, b.en)
  }
  if (cursor < to) gaps.push([cursor, to])
  const biggest = gaps.reduce<[number, number] | null>((best, g) => (!best || g[1] - g[0] > best[1] - best[0] ? g : best), null)
  const freeMin = biggest ? Math.round(((biggest[1] - biggest[0]) * 60) / 5) * 5 : 0
  const duration = (m: number) => {
    const h = Math.floor(m / 60)
    const rest = m % 60
    return h ? (rest ? t('hm', { h, m: rest }) : t('h', { h })) : t('m', { m: rest })
  }

  const hourFmt = new Intl.DateTimeFormat(appLocale, { hour: 'numeric' })
  const step = span > 12 ? 2 : 1
  const ticks: number[] = []
  for (let k = from; k <= to; k++) ticks.push(k)
  const nowX = x(nowH)

  const revoked = data.calendarIssue === 'google_auth_revoked'
  const calendarOff = !google || data.calendarIssue === 'google_not_connected'

  if (!hydrated) {
    return (
      <div className={className}>
        <div className="h-4" />
        <Skeleton className="mt-1 h-10 rounded-xl bg-fg/[0.07]" />
      </div>
    )
  }

  return (
    <div className={className} role="group" aria-label={t('label')}>
      {/* las horas, y la de ahora en su color */}
      <div className="relative h-4 text-[11px] font-medium leading-4 tabular-nums text-fg-subtle" aria-hidden>
        {ticks.map((k) =>
          (k - from) % step === 0 && !(nowIn && Math.abs(x(k) - nowX) < 4) ? (
            <span
              key={k}
              className={cn('absolute top-0', k === from ? '' : k === to ? '-translate-x-full' : '-translate-x-1/2')}
              style={{ left: `${x(k)}%` }}
            >
              {hourFmt.format(new Date(base + k * 3_600_000))}
            </span>
          ) : null,
        )}
        {nowIn ? (
          <span
            className="absolute -top-px z-[3] -translate-x-1/2 rounded-full bg-mandarina px-2 font-mono text-[11px] font-semibold text-on-mandarina shadow-[0_2px_10px_-2px_oklch(0.75_0.167_50.5/0.7)]"
            style={{ left: `${nowX}%` }}
          >
            {format(now, 'HH:mm')}
          </span>
        ) : null}
      </div>

      {data.eventsLoading ? (
        <Skeleton className="mt-1 h-10 rounded-xl bg-fg/[0.07]" />
      ) : (
        <div className="relative mt-1 h-10 overflow-hidden rounded-xl bg-fg/[0.06] ring-1 ring-fg/10">
          {ticks.map((k) =>
            k > from && k < to ? <span key={k} aria-hidden className="absolute inset-y-0 w-px bg-fg/[0.07]" style={{ left: `${x(k)}%` }} /> : null,
          )}
          {/* lo que ya pasó: el día se va llenando hasta la línea de ahora */}
          {nowH > from ? (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0"
              style={{
                width: `${nowX}%`,
                background: 'linear-gradient(90deg, color-mix(in oklch, var(--fg) 2%, transparent), color-mix(in oklch, var(--fg) 13%, transparent))',
              }}
            />
          ) : null}
          {nowH >= to ? (
            <span className="absolute inset-0 flex items-center justify-center text-[13px] text-fg-muted">{t('over')}</span>
          ) : biggest && freeMin >= 30 ? (
            // el tramo libre más largo, con cuánto dura
            <span
              className="absolute inset-y-0 flex items-center justify-center px-3"
              style={{ left: `${x(biggest[0])}%`, width: `${x(biggest[1]) - x(biggest[0])}%` }}
            >
              <span className="truncate text-[13px] font-medium text-fg-muted">{t(events.length ? 'free' : 'freeDay', { duration: duration(freeMin) })}</span>
            </span>
          ) : null}
          {blocks.map((b) => (
            <Block key={b.e.id} event={b.e} start={b.s} end={b.en} lane={b.lane} lanes={lanes} nowH={nowH} x={x} data={data} model={model} />
          ))}
          {nowIn ? (
            <span
              aria-hidden
              className="absolute inset-y-0 z-[2] w-0.5 -translate-x-1/2 bg-mandarina shadow-[0_0_12px_2px_oklch(0.75_0.167_50.5/0.55)]"
              style={{ left: `${nowX}%` }}
            />
          ) : null}
        </div>
      )}

      {revoked ? (
        <div className="mt-3">
          <ConnectCalendar reason="google_auth_revoked" returnTo="/home" compact />
        </div>
      ) : calendarOff ? (
        <ConnectCalendarHint returnTo="/home" className="mt-2 bg-transparent px-0 py-0" />
      ) : null}
    </div>
  )
}

function Block({
  event,
  start,
  end,
  lane,
  lanes,
  nowH,
  x,
  data,
  model,
}: {
  event: CalendarEvent
  start: number
  end: number
  lane: number
  lanes: number
  nowH: number
  x: (h: number) => number
  data: BriefData
  model: BriefModel
}) {
  const meeting = model.meetingByEvent.get(event.id) ?? null
  const ws = meeting ? data.wsMap.get(meeting.workspace_id) : event.links[0] ? data.wsMap.get(event.links[0].workspaceId) : undefined
  const past = end <= nowH
  const live = start <= nowH && end > nowH
  const unclosed = past && meeting && meeting.phase !== 'closed'
  // sobre la ciruela, cada reunión en una versión pastel del color de su espacio, con texto tinta;
  // lo que ya pasó, apagado
  const color = ws ? 'var(--ws-color)' : 'oklch(0.773 0.115 303)'
  const style: React.CSSProperties = {
    left: `${x(start)}%`,
    width: `max(${x(end) - x(start)}%, 8px)`,
    top: `calc(4px + ${lane} * (100% - 8px) / ${lanes})`,
    height: `calc((100% - 8px) / ${lanes} - ${lanes > 1 ? 2 : 0}px)`,
    ...(past
      ? { background: 'oklch(0.969 0.011 54.5 / 0.12)' }
      : { background: `color-mix(in oklch, ${color} 48%, oklch(0.975 0.012 54.5))`, color: 'oklch(0.243 0.088 312.7)' }),
  }
  const label = `${format(new Date(event.start), 'HH:mm')}–${format(new Date(event.end), 'HH:mm')} · ${event.title}`
  const cls = cn(
    ws && `ws-${ws.color}`,
    'absolute z-[1] flex items-center overflow-hidden rounded-lg px-2 text-xs font-semibold',
    past && 'text-fg-muted',
    live && 'ring-2 ring-mandarina ring-offset-0 shadow-[0_0_16px_-2px_oklch(0.75_0.167_50.5/0.6)]',
    meeting && 'transition-[filter,transform] duration-150 ease-out hover:brightness-105 active:scale-[0.98]',
  )
  const body = <span className="truncate">{event.title}</span>
  return meeting ? (
    <Link href={`/m/${meeting.id}${unclosed ? '?view=closed' : ''}`} className={cls} style={style} title={label}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style} title={label}>
      {body}
    </div>
  )
}
