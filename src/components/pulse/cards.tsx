'use client'

// Tarjetas de Hoy: reunión próxima (con preparación), en curso (con captura) e hilos de lo que ya pasó.
// Se usan en el briefing y en la línea de tiempo.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { differenceInMinutes, format } from 'date-fns'
import { ArrowRight, CheckCheck, ChevronDown, Video } from 'lucide-react'
import { useMemberMap } from '@/components/app/app-context'
import { WorkspaceMark, DocMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { StatusIcon } from '@/components/tasks/status-icon'
import { NotesButton } from '@/components/calendar/notes-button'
import { CaptureBox } from '@/components/meeting/capture-box'
import { KindChip } from '@/components/meeting/kinds'
import { useMeetingItemMutations } from '@/lib/queries/meetings'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useDateLocale } from '@/lib/dates'
import { suggestAgenda } from '@/lib/assistant'
import { cn, taskRef } from '@/lib/utils'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import type { CalendarEvent, DocSummary, WorkspaceWithRole } from '@/lib/types'
import { useOpenTask } from '@/lib/use-open-task'

// ---------------- tarjetas ----------------

export function UpcomingCard({
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
  const locale = useDateLocale()
  const ws = meeting ? wsMap.get(meeting.workspace_id) : undefined
  const minutes = differenceInMinutes(new Date(event.start), now)
  const agenda = items.filter((i) => i.kind === 'agenda')

  return (
    <article className="rounded-xl border border-line bg-panel p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {ws ? <WorkspaceMark ws={ws} size={18} /> : null}
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{event.title}</h3>
        <span className="text-xs text-fg-muted first-letter:uppercase">
          {minutes < 60
            ? t('inMinutes', { minutes })
            : minutes < 12 * 60
              ? t('inHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
              : format(new Date(event.start), 'EEE d · HH:mm', { locale })}
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

export function PrepareBox({
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

export function LiveCard({
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

export function LiveCapture({ meeting }: { meeting: MeetingRow }) {
  const members = useWorkspaceMembers(meeting.workspace_id)
  const { add } = useMeetingItemMutations(meeting.id)
  return (
    <div className="mt-3">
      <CaptureBox members={members} onCapture={(c) => add.mutate({ ...c, position: Date.now() })} />
    </div>
  )
}

export function People({ event }: { event: CalendarEvent }) {
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

export function Lineage({ decisions, tasks }: { decisions: number; tasks: TaskRow[] }) {
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

export function MeetingThread({
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
  const { open: openTask } = useOpenTask()
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

export function DocThread({ doc, tasks, wsMap }: { doc: DocSummary; tasks: TaskRow[]; wsMap: Map<string, WorkspaceWithRole> }) {
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
