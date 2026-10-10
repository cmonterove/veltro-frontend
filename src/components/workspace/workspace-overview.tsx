'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { differenceInMinutes, format, formatDistanceToNowStrict, isPast } from 'date-fns'
import { ArrowRight, CalendarDays, Play, PenLine, Video } from 'lucide-react'
import { useWorkspaceMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTasks } from '@/lib/queries/tasks'
import { useWorkspaceDocs } from '@/lib/queries/docs'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useWorkspaceItems, useWorkspaceMeetings, type MeetingWithNotes } from '@/lib/queries/meetings'
import { openAttachment, useAttachments } from '@/lib/queries/attachments'
import { useDateLocale, dueInfo } from '@/lib/dates'
import { useNow, useTaskPanel } from '@/lib/hooks'
import { TASK_STATUSES } from '@/lib/constants'
import { cn, taskRef } from '@/lib/utils'
import { meetingAgreements } from '@/lib/agreements'
import type { MeetingItemRow, TaskRow } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { TaskGroupList } from '@/components/tasks/task-list'
import { StatusIcon } from '@/components/tasks/status-icon'
import { SourceBadge } from '@/components/docs/source-badge'
import { DocMark } from '@/components/app/marks'
import { AttachmentIcon, formatBytes } from '@/components/attachments/attachments'

/** Inicio del espacio: lo que viene, cómo va, qué se acordó y qué quedó guardado. */
export function WorkspaceOverview({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('workspace.overview')
  const ws = useWorkspaceMap().get(workspaceId)!
  const now = useNow()
  const { data: tasks, isLoading } = useTasks({ kind: 'workspace', workspaceId })
  const { data: meetings } = useWorkspaceMeetings(workspaceId, 40)
  const { data: items } = useWorkspaceItems([workspaceId])

  const focus = useMemo(() => {
    const open = (tasks ?? []).filter((x) => x.status !== 'done')
    const overdue = open.filter((x) => x.due_date && dueInfo(x.due_date).tone === 'overdue')
    const active = open.filter((x) => x.status === 'in_progress' || x.status === 'blocked')
    const ids = new Set([...overdue, ...active].map((x) => x.id))
    return open.filter((x) => ids.has(x.id)).slice(0, 8)
  }, [tasks])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      {ws.description ? <p className="mb-6 max-w-2xl text-sm leading-relaxed text-fg-muted">{ws.description}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <NextUp ws={ws} meetings={meetings} now={now} />
        <Health ws={ws} tasks={tasks} loading={isLoading} now={now} />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          <section>
            <SectionTitle title={t('focus')} />
            {isLoading ? (
              <Skeleton className="h-28" />
            ) : focus.length ? (
              <div className="overflow-hidden rounded-xl border border-line">
                <TaskGroupList groups={[{ id: 'focus', label: t('focusGroup'), tasks: focus, defaults: null }]} className="pb-0" />
              </div>
            ) : (
              <Empty>{t('noFocus')}</Empty>
            )}
          </section>
          <Agreements ws={ws} items={items ?? []} meetings={meetings ?? []} tasks={tasks ?? []} />
        </div>

        <div className="flex min-w-0 flex-col gap-10">
          <MeetingsList ws={ws} meetings={meetings} now={now} />
          <RecentDocs ws={ws} />
          <RecentFiles ws={ws} tasks={tasks ?? []} meetings={meetings ?? []} />
          <People ws={ws} />
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ title, hint, href, linkLabel }: { title: string; hint?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
      {href ? (
        <Link href={href} className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-fg-muted hover:text-fg">
          {linkLabel}
          <ArrowRight className="size-3" />
        </Link>
      ) : null}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-fg-subtle">{children}</p>
}

// ---------------- próxima reunión ----------------

function NextUp({ ws, meetings, now }: { ws: WorkspaceWithRole; meetings: MeetingWithNotes[] | undefined; now: Date }) {
  const t = useTranslations('workspace.overview')
  const locale = useDateLocale()

  if (!meetings) return <Skeleton className="h-[168px] rounded-2xl" />

  const live = meetings.find((m) => m.phase !== 'closed' && new Date(m.starts_at) <= now && new Date(m.ends_at ?? m.starts_at) > now)
  const next =
    live ??
    [...meetings]
      .filter((m) => m.phase !== 'closed' && new Date(m.starts_at) > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]

  if (!next) {
    return (
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-dashed border-line-strong p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t('nextMeeting')}</p>
          <p className="mt-2 max-w-sm text-sm text-fg-muted">{t('noNext')}</p>
        </div>
        <Link href={`/w/${ws.slug}/meetings`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start')}>
          <CalendarDays />
          {t('openCalendar')}
        </Link>
      </div>
    )
  }

  const start = new Date(next.starts_at)
  const end = next.ends_at ? new Date(next.ends_at) : null
  const isLive = next === live
  const remaining = end ? differenceInMinutes(end, now) : null

  return (
    <div
      className={cn('ws-' + ws.color, 'relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-5', isLive ? 'border-mandarina/60' : 'border-line')}
      style={{ background: 'color-mix(in oklch, var(--ws-color) 9%, var(--panel))' }}
    >
      <div className="flex items-center gap-2 text-xs font-medium">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 uppercase tracking-wide text-mandarina-ink">
            <span className="size-2 animate-pulse rounded-full bg-mandarina" />
            {t('liveNow')}
            {remaining != null && remaining > 0 ? <span className="font-normal normal-case tracking-normal text-fg-muted">· {t('remaining', { minutes: remaining })}</span> : null}
          </span>
        ) : (
          <span className="uppercase tracking-wide text-fg-subtle">
            {t('nextMeeting')}
            <span className="ml-1.5 font-normal normal-case tracking-normal text-fg-muted">· {formatDistanceToNowStrict(start, { addSuffix: true, locale })}</span>
          </span>
        )}
      </div>

      <div className="min-w-0">
        <Link href={`/m/${next.id}`} className="block truncate font-brand text-xl font-semibold tracking-[-0.02em] hover:underline">
          {next.title}
        </Link>
        <p className="mt-1 text-sm text-fg-muted first-letter:uppercase">
          {format(start, 'EEEE d MMM', { locale })} · {format(start, 'HH:mm')}
          {end ? ` - ${format(end, 'HH:mm')}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {next.attendees.length ? (
          <span className="flex -space-x-1.5">
            {next.attendees.slice(0, 6).map((a) => (
              <Avatar key={a.email} name={a.name || a.email} seed={a.email} size={24} className="ring-2 ring-panel" />
            ))}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          {isLive && next.conference_url ? (
            <a href={next.conference_url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Video />
              {t('join')}
            </a>
          ) : null}
          <Link href={`/m/${next.id}`} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            {isLive ? <Play /> : <PenLine />}
            {isLive ? t('enter') : t('prepare')}
          </Link>
        </span>
      </div>
    </div>
  )
}

// ---------------- avance ----------------

function Health({ ws, tasks, loading, now }: { ws: WorkspaceWithRole; tasks: TaskRow[] | undefined; loading: boolean; now: Date }) {
  const t = useTranslations('workspace.overview')
  const tStatus = useTranslations('tasks.status')

  const stats = useMemo(() => {
    const list = tasks ?? []
    const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<string, number>
    list.forEach((x) => counts[x.status]++)
    const overdue = list.filter((x) => x.status !== 'done' && x.due_date && dueInfo(x.due_date).tone === 'overdue').length
    const hours = list.filter((x) => x.status !== 'done').reduce((n, x) => n + (Number(x.estimate_hours) || 0), 0)
    return { counts, total: list.length, overdue, hours }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, now.toDateString()])

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
      <SectionTitle title={t('progress')} href={`/w/${ws.slug}/tasks`} linkLabel={t('allTasks')} />
      {loading ? (
        <Skeleton className="h-16" />
      ) : stats.total === 0 ? (
        <Empty>{t('noTasks')}</Empty>
      ) : (
        <>
          <div className="-mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-brand text-lg font-semibold tracking-[-0.02em]">{t('doneOf', { done: stats.counts.done, total: stats.total })}</span>
            {stats.counts.blocked ? <span className="text-xs font-medium text-danger">{t('blocked', { count: stats.counts.blocked })}</span> : null}
            {stats.overdue ? <span className="text-xs font-medium text-danger">{t('overdue', { count: stats.overdue })}</span> : null}
            {stats.hours ? <span className="ml-auto text-xs tabular-nums text-fg-muted">{t('hoursLeft', { hours: stats.hours })}</span> : null}
          </div>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {TASK_STATUSES.filter((s) => stats.counts[s]).map((s) => (
              <span
                key={s}
                className={cn(
                  'h-full first:rounded-l-full last:rounded-r-full',
                  s === 'done' && 'bg-st-done',
                  s === 'in_progress' && 'bg-st-progress',
                  s === 'blocked' && 'bg-st-blocked',
                  s === 'todo' && 'bg-st-todo/50',
                  s === 'backlog' && 'bg-st-backlog/30',
                )}
                style={{ flexGrow: stats.counts[s] }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {TASK_STATUSES.map((s) => (
              <li key={s} className="flex items-center gap-1.5 text-xs text-fg-muted">
                <StatusIcon status={s} className="size-3.5" />
                {tStatus(s)}
                <span className="tabular-nums text-fg">{stats.counts[s]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// ---------------- acuerdos vivos ----------------

function Agreements({ ws, items, meetings, tasks }: { ws: WorkspaceWithRole; items: MeetingItemRow[]; meetings: MeetingWithNotes[]; tasks: TaskRow[] }) {
  const t = useTranslations('workspace.overview')
  const locale = useDateLocale()
  const { open } = useTaskPanel()
  const meetingById = new Map(meetings.map((m) => [m.id, m]))
  const groups = meetingAgreements(items, tasks)
    .map((g) => ({ ...g, meeting: meetingById.get(g.meetingId) }))
    .slice(0, 3)

  return (
    <section>
      <SectionTitle title={t('agreements')} hint={t('agreementsHint')} />
      {groups.length ? (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <li key={g.decisions[0].id} className="rounded-xl border border-line bg-panel px-4 py-3">
              {g.meeting ? (
                <Link href={`/m/${g.meeting.id}`} className="mb-2 flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg">
                  <DocMark source="meeting" className="size-3.5" />
                  <span className="truncate">{g.meeting.title}</span>
                  <span className="shrink-0">· {format(new Date(g.meeting.starts_at), 'd MMM', { locale })}</span>
                </Link>
              ) : null}
              <ul className="flex flex-col gap-1.5">
                {g.decisions.slice(0, 3).map((d) => (
                  <li key={d.id} className="flex gap-2 text-sm leading-snug">
                    <span className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-k-decision" aria-hidden />
                    <span>{d.text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {g.open.slice(0, 4).map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => open(x.id)}
                    className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md bg-k-action-soft px-2 text-xs text-fg hover:opacity-80"
                  >
                    <StatusIcon status={x.status} className="size-3" />
                    <span className="font-mono text-2xs font-semibold text-k-action">{taskRef(ws.key, x.number)}</span>
                    <span className="truncate">{x.title}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('noAgreements')}</Empty>
      )}
    </section>
  )
}

// ---------------- reuniones ----------------

function MeetingsList({ ws, meetings, now }: { ws: WorkspaceWithRole; meetings: MeetingWithNotes[] | undefined; now: Date }) {
  const t = useTranslations('workspace.overview')
  const locale = useDateLocale()
  const upcoming = [...(meetings ?? [])].filter((m) => new Date(m.starts_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 2)
  const recent = (meetings ?? []).filter((m) => new Date(m.starts_at) <= now).slice(0, 4)

  const row = (m: MeetingWithNotes) => {
    const unclosed = m.phase !== 'closed' && isPast(new Date(m.ends_at ?? m.starts_at))
    const live = m.phase !== 'closed' && new Date(m.starts_at) <= now && new Date(m.ends_at ?? m.starts_at) > now
    return (
      <li key={m.id}>
        <Link href={`/m/${m.id}`} className="-mx-3 flex h-10 items-center gap-3 rounded-lg px-3 hover:bg-hover">
          <DocMark source="meeting" />
          <span className="min-w-0 flex-1 truncate text-sm text-fg">{m.title}</span>
          {live ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-2xs font-medium text-mandarina-ink">
              <span className="size-1.5 rounded-full bg-mandarina" />
              {t('liveNow')}
            </span>
          ) : unclosed ? (
            <span className="shrink-0 rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs font-medium text-mandarina-ink">{t('unclosed')}</span>
          ) : null}
          <span className="shrink-0 text-xs text-fg-subtle">{formatDistanceToNowStrict(new Date(m.starts_at), { addSuffix: true, locale })}</span>
        </Link>
      </li>
    )
  }

  return (
    <section>
      <SectionTitle title={t('meetings')} href={`/w/${ws.slug}/meetings`} linkLabel={t('allMeetings')} />
      {!meetings ? (
        <Skeleton className="h-24" />
      ) : !meetings.length ? (
        <Empty>{t('noMeetings')}</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {upcoming.length ? (
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{t('upcoming')}</p>
              <ul>{upcoming.map(row)}</ul>
            </div>
          ) : null}
          {recent.length ? (
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{t('recent')}</p>
              <ul>{recent.map(row)}</ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

// ---------------- docs y archivos ----------------

function RecentDocs({ ws }: { ws: WorkspaceWithRole }) {
  const t = useTranslations('workspace.overview')
  const { data: docs } = useWorkspaceDocs(ws.id)
  const recent = [...(docs ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5)
  return (
    <section>
      <SectionTitle title={t('recentDocs')} href={`/w/${ws.slug}/docs`} linkLabel={t('allDocs')} />
      {!docs ? (
        <Skeleton className="h-24" />
      ) : recent.length ? (
        <ul>
          {recent.map((d) => (
            <li key={d.id}>
              <Link href={`/w/${ws.slug}/docs/${d.id}`} className="-mx-3 flex h-10 items-center gap-3 rounded-lg px-3 hover:bg-hover">
                <DocMark source={d.source} />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{d.title || t('untitled')}</span>
                {d.source !== 'manual' ? <SourceBadge source={d.source} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('noDocs')}</Empty>
      )}
    </section>
  )
}

function RecentFiles({ ws, tasks, meetings }: { ws: WorkspaceWithRole; tasks: TaskRow[]; meetings: MeetingWithNotes[] }) {
  const t = useTranslations('workspace.overview')
  const { data: files } = useAttachments({ kind: 'workspace', workspaceId: ws.id })
  const taskById = new Map(tasks.map((x) => [x.id, x]))
  const meetingById = new Map(meetings.map((m) => [m.id, m]))
  const recent = (files ?? []).slice(0, 5)
  return (
    <section>
      <SectionTitle title={t('files')} href={`/w/${ws.slug}/docs?tab=files`} linkLabel={t('allFiles')} />
      {!files ? (
        <Skeleton className="h-24" />
      ) : recent.length ? (
        <ul>
          {recent.map((a) => {
            const task = a.task_id ? taskById.get(a.task_id) : undefined
            const meeting = a.meeting_id ? meetingById.get(a.meeting_id) : undefined
            const origin = task ? taskRef(ws.key, task.number) : meeting ? meeting.title : null
            return (
              <li key={a.id}>
                <button type="button" onClick={() => openAttachment(a)} className="-mx-3 flex h-11 w-[calc(100%+1.5rem)] items-center gap-3 rounded-lg px-3 text-left hover:bg-hover">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar">
                    <AttachmentIcon a={a} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{a.name}</span>
                    <span className="block truncate text-2xs text-fg-subtle">
                      {[origin, a.kind === 'file' ? formatBytes(a.size_bytes) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty>{t('noFiles')}</Empty>
      )}
    </section>
  )
}

function People({ ws }: { ws: WorkspaceWithRole }) {
  const t = useTranslations('workspace.overview')
  const members = useWorkspaceMembers(ws.id)
  return (
    <section>
      <SectionTitle title={t('people', { count: members.length })} />
      <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {members.slice(0, 10).map((m) => (
          <li key={m.id} className="flex min-w-0 items-center gap-2.5 text-sm" title={m.email}>
            <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={24} />
            <span className="truncate text-fg">{m.full_name}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
